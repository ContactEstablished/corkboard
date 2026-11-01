using System.Text.RegularExpressions;
using HomeKiosk.Core.Matching;

namespace HomeKiosk.Core.Commands;

/// <summary>
/// Fast, free parsing of the common phrasings with compiled regexes. Returns <see cref="Unrecognized"/>
/// when nothing matches, so a fallback parser can try. Tolerates speech-recognition punctuation and casing.
/// </summary>
public sealed partial class RuleBasedCommandParser : ICommandParser
{
    public const string ParserName = "rules";
    public const int MaxItemsPerCommand = 25;
    public const int MaxItemLength = 100;
    public const int MaxListNameLength = 50;

    private delegate ListCommand? Rule(Match match, ParseContext context);

    /// <summary>Phrases that contain "and" but are one item.</summary>
    private static readonly string[] Compounds =
    [
        "mac and cheese",
        "macaroni and cheese",
        "half and half",
        "salt and vinegar chips",
        "peanut butter and jelly",
        "fish and chips",
        "chips and salsa",
        "salt and pepper",
    ];

    private static readonly string[] AddTargets = ["onto", "to", "on"];
    private static readonly string[] RemoveTargets = ["off of", "from", "off", "on"];
    private static readonly string[] CompleteTargets = ["on", "from", "off of", "off", "in"];

    /// <summary>
    /// Prepositions that may name a list we don't have ("add drill bits to hardware" → "no such list").
    /// "on"/"in" don't count, so "add cream cheese on sale" doesn't invent a list called "sale".
    /// </summary>
    private static readonly HashSet<string> UnknownTargetPrepositions = ["to", "onto", "from", "off", "off of"];

    private readonly (Regex Pattern, Rule Build)[] _rules;

    public RuleBasedCommandParser()
    {
        _rules =
        [
            (UndoPattern(), (_, _) => new Undo()),
            (TakeThatBackPattern(), (_, _) => new Undo()),

            (WhatListsPattern(), (_, _) => new GetLists()),
            (ShowListsPattern(), (_, _) => new GetLists()),

            (CreateCalledPattern(), (m, _) => Create(m)),
            (NewListPattern(), (m, _) => Create(m)),
            (CreateNamedListPattern(), (m, _) => Create(m)),

            (WhatsOnPattern(), (m, c) => GetListOf(m, c, ListMatch.Any)),
            (WhatDoWeNeedPattern(), (m, c) => GetListOf(m, c, ListMatch.Any)),
            (ReadListPattern(), (m, c) => GetListOf(m, c, ListMatch.KnownOrSaysList)),
            (BareListPattern(), (m, c) => GetListOf(m, c, ListMatch.KnownOnly)),

            (ClearCompletedPattern(), (m, c) => new ClearList(ListValue(m.Groups["list"].Value, c), CompletedOnly: true)),
            (ClearEverythingPattern(), (m, c) => new ClearList(ListValue(m.Groups["list"].Value, c), CompletedOnly: false)),
            (ClearListPattern(), (m, c) => ClearWholeList(m, c)),

            (CheckOffPattern(), (m, c) => Complete(m.Groups["rest"].Value, c)),
            (CheckItemsOffPattern(), (m, c) => Complete(m.Groups["items"].Value, c, m.Groups["list"].Value)),
            (MarkDonePattern(), (m, c) => Complete(m.Groups["rest"].Value, c)),
            (GotPattern(), (m, c) => Complete(m.Groups["rest"].Value, c)),
            (ItemIsDonePattern(), (m, c) => Complete(m.Groups["rest"].Value, c)),
            (CompleteVerbPattern(), (m, c) => Complete(m.Groups["rest"].Value, c)),

            (RemoveVerbPattern(), (m, c) => Remove(m.Groups["rest"].Value, c, requireTarget: false)),
            (TakeOffPattern(), (m, c) => Remove(m.Groups["rest"].Value, c, requireTarget: false)),
            (TakePattern(), (m, c) => Remove(m.Groups["rest"].Value, c, requireTarget: true)),
            (DontNeedPattern(), (m, c) => Remove(m.Groups["rest"].Value, c, requireTarget: false)),

            (AddVerbPattern(), (m, c) => Add(m.Groups["rest"].Value, c)),
            (OutOfPattern(), (m, c) => Add(m.Groups["rest"].Value, c)),
            (WeNeedPattern(), (m, c) => Add(m.Groups["rest"].Value, c)),
            (BareNeedPattern(), (m, c) => Add(m.Groups["rest"].Value, c)),
        ];
    }

    public Task<ParseResult> ParseAsync(string text, ParseContext context, CancellationToken ct) =>
        Task.FromResult(Parse(text, context));

    public ParseResult Parse(string text, ParseContext context)
    {
        var utterance = Prepare(text);
        if (utterance.Length == 0)
        {
            return ParseResult.NotUnderstood("empty");
        }

        // "add milk and check off bread" → two clauses, but only if every clause parses on its own.
        var clauses = ClauseBoundary().Split(utterance).Select(c => c.Trim(' ', ',')).Where(c => c.Length > 0).ToList();
        if (clauses.Count > 1)
        {
            var commands = clauses.Select(c => ParseClause(c, context)).ToList();
            if (commands.All(c => c is not null and not Unrecognized))
            {
                return new ParseResult(commands!, ParserName);
            }
        }

        var command = ParseClause(utterance, context);
        return command is null or Unrecognized
            ? ParseResult.NotUnderstood((command as Unrecognized)?.Reason ?? "no rule matched")
            : new ParseResult([command], ParserName);
    }

    private ListCommand? ParseClause(string clause, ParseContext context)
    {
        foreach (var (pattern, build) in _rules)
        {
            var match = pattern.Match(clause);
            if (match.Success && build(match, context) is { } command)
            {
                return command;
            }
        }

        return null;
    }

    /// <summary>Lower-cases, drops speech punctuation (keeping commas and apostrophes) and polite filler.</summary>
    internal static string Prepare(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "";
        }

        var cleaned = text.ToLowerInvariant().Replace('’', '\'').Replace('‘', '\'');
        cleaned = SpeechPunctuation().Replace(cleaned, " ");
        cleaned = Whitespace().Replace(cleaned, " ").Trim(' ', ',');
        cleaned = LeadingFiller().Replace(cleaned, "");
        cleaned = TrailingFiller().Replace(cleaned, "");
        return cleaned.Trim(' ', ',');
    }

    // ---- Builders -------------------------------------------------------------------------------

    /// <summary>How sure a phrasing must be that it names a list.</summary>
    private enum ListMatch
    {
        /// <summary>"what's on hardware": any short name; an unknown one gets the "no such list" reply.</summary>
        Any,

        /// <summary>"show me the camping list": a known list, or a name ending in "list". Not "show me milk".</summary>
        KnownOrSaysList,

        /// <summary>"grocery list" on its own: only a list we have. Not "make a camping list".</summary>
        KnownOnly,
    }

    private static ListCommand? GetListOf(Match match, ParseContext context, ListMatch required)
    {
        var spoken = match.Groups["list"].Value;
        var target = ClassifyTarget(spoken, context);
        if (target.Kind == TargetKind.Unknown)
        {
            var saysList = spoken.TrimEnd().EndsWith("list", StringComparison.Ordinal);
            if (required == ListMatch.KnownOnly
                || (required == ListMatch.KnownOrSaysList && !saysList)
                || WordCount(target.Value!) > 3)
            {
                return null;
            }
        }

        return new GetList(target.Value);
    }

    private static ListCommand? ClearWholeList(Match match, ParseContext context)
    {
        var spoken = match.Groups["list"].Value;
        var target = ClassifyTarget(spoken, context);
        // "clear groceries" and "clear the list" are list references; "clear the table" is not.
        if (target.Kind == TargetKind.Unknown && !spoken.EndsWith("list", StringComparison.Ordinal))
        {
            return null;
        }

        return new ClearList(target.Value, CompletedOnly: false);
    }

    private static ListCommand? Create(Match match)
    {
        var name = TextNormalizer.ToDisplay(match.Groups["name"].Value);
        if (name.Length == 0)
        {
            return null;
        }

        return name.Length > MaxListNameLength ? new Unrecognized("list name too long") : new CreateList(name);
    }

    private static ListCommand? Add(string rest, ParseContext context)
    {
        var (itemsText, list) = SplitTarget(rest, context, AddTargets, requireTarget: false)!.Value;
        var items = SplitItems(itemsText, KnownItems(list, context)).Select(ToItemSpec).Where(i => i.Text.Length > 0).ToList();
        return Validate(items.Select(i => i.Text), items.Count) ?? (items.Count == 0 ? null : new AddItems(list, items));
    }

    private static ListCommand? Remove(string rest, ParseContext context, bool requireTarget)
    {
        if (SplitTarget(rest, context, RemoveTargets, requireTarget) is not var (itemsText, list))
        {
            return null;
        }

        var items = CleanItems(itemsText, list, context);
        return Validate(items, items.Count) ?? (items.Count == 0 ? null : new RemoveItems(list, items));
    }

    private static ListCommand? Complete(string rest, ParseContext context, string? explicitList = null)
    {
        string itemsText;
        string? list;
        if (!string.IsNullOrWhiteSpace(explicitList))
        {
            (itemsText, list) = (rest, ListValue(explicitList, context));
        }
        else
        {
            (itemsText, list) = SplitTarget(rest, context, CompleteTargets, requireTarget: false)!.Value;
        }

        var items = CleanItems(itemsText, list, context);
        return Validate(items, items.Count) ?? (items.Count == 0 ? null : new CompleteItems(list, items));
    }

    private static ListCommand? Validate(IEnumerable<string> texts, int count)
    {
        if (count > MaxItemsPerCommand)
        {
            return new Unrecognized($"more than {MaxItemsPerCommand} items");
        }

        return texts.Any(t => t.Length > MaxItemLength) ? new Unrecognized("item text too long") : null;
    }

    private static List<string> CleanItems(string itemsText, string? list, ParseContext context) =>
        [.. SplitItems(itemsText, KnownItems(list, context)).Select(TextNormalizer.Normalize).Where(t => t.Length > 0)];

    private static ItemSpec ToItemSpec(string raw)
    {
        var text = raw.Trim();
        var quantity = UnitQuantity().Match(text) is { Success: true } unit ? unit
            : CountQuantity().Match(text) is { Success: true } count ? count
            : null;

        return quantity is null
            ? new ItemSpec(TextNormalizer.Normalize(text))
            : new ItemSpec(TextNormalizer.Normalize(quantity.Groups["item"].Value), quantity.Groups["q"].Value);
    }

    // ---- Lists and items ------------------------------------------------------------------------

    private enum TargetKind
    {
        Default,
        Known,
        Unknown,
    }

    /// <param name="Value">null for the default list, the slug when known, otherwise the cleaned spoken name.</param>
    private readonly record struct Target(TargetKind Kind, string? Value);

    private static Target ClassifyTarget(string? spoken, ParseContext context)
    {
        var reference = ListResolver.CleanReference(spoken);
        if (reference.Length == 0)
        {
            return new Target(TargetKind.Default, null);
        }

        return ListResolver.Resolve(reference, context.Lists) is { } list
            ? new Target(TargetKind.Known, list.Slug)
            : new Target(TargetKind.Unknown, reference);
    }

    private static string? ListValue(string? spoken, ParseContext context) => ClassifyTarget(spoken, context).Value;

    /// <summary>
    /// Splits "milk to the grocery list" into items and a list. Tries each preposition left to right and
    /// takes the first whose remainder is a list we know ("call mom to the to do list"); otherwise the
    /// last one that could name a new list ("drill bits to hardware"); otherwise there is no list.
    /// </summary>
    private static (string Items, string? List)? SplitTarget(string rest, ParseContext context, string[] prepositions, bool requireTarget)
    {
        (string Items, string? List)? fallback = null;
        foreach (Match m in PrepositionRegex(prepositions).Matches(rest))
        {
            var items = rest[..m.Index].Trim();
            if (items.Length == 0)
            {
                continue;
            }

            var target = ClassifyTarget(rest[(m.Index + m.Length)..], context);
            if (target.Kind != TargetKind.Unknown)
            {
                return (items, target.Value);
            }

            if (UnknownTargetPrepositions.Contains(m.Groups["prep"].Value) && WordCount(target.Value!) <= 3)
            {
                fallback = (items, target.Value);
            }
        }

        return fallback ?? (requireTarget ? null : (rest, null));
    }

    private static IEnumerable<string> KnownItems(string? list, ParseContext context)
    {
        var slug = list ?? context.DefaultListSlug;
        return context.OpenItemsByList.TryGetValue(slug, out var items) ? items.Select(TextNormalizer.Normalize) : [];
    }

    /// <summary>Splits on commas, "and", "&amp;" and "plus", keeping known "x and y" items whole.</summary>
    private static IEnumerable<string> SplitItems(string text, IEnumerable<string> knownItems)
    {
        const char glue = '\u0001';
        foreach (var phrase in Compounds.Concat(knownItems.Where(k => k.Contains(" and ", StringComparison.Ordinal))))
        {
            text = text.Replace(phrase, phrase.Replace(' ', glue), StringComparison.Ordinal);
        }

        return ItemSeparator().Split(text).Select(p => p.Replace(glue, ' ').Trim()).Where(p => p.Length > 0);
    }

    private static int WordCount(string text) => text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static readonly Dictionary<string, Regex> PrepositionRegexes = [];

    private static Regex PrepositionRegex(string[] prepositions)
    {
        var key = string.Join('|', prepositions);
        lock (PrepositionRegexes)
        {
            if (!PrepositionRegexes.TryGetValue(key, out var regex))
            {
                regex = new Regex($@"\s+(?<prep>{key})\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);
                PrepositionRegexes[key] = regex;
            }

            return regex;
        }
    }

    // ---- Patterns -------------------------------------------------------------------------------
    // Applied in order to a lower-cased clause with filler removed. Earlier rules win, so the more
    // specific phrasings ("clear completed", "create a list called") come before the generic verbs.

    private const string Article = @"(?:(?:the|my|our)\s+)?";
    private const string Verbs = "add|put|remove|delete|take|check|cross|tick|mark|clear|create|make|undo";
    private const string Numbers = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";

    private const string Units =
        "gallons?|quarts?|pints?|liters?|litres?|pounds?|lbs?|ounces?|oz|kilos?|kgs?|grams?|bags?|boxe?s?|cans?|"
        + "bottles?|cartons?|jars?|packs?|packages?|packets?|loaf|loaves|bunch(?:es)?|heads?|dozen|cases?|rolls?|"
        + "tubs?|containers?|sticks?|bars?|cups?|pieces?|slices?";

    [GeneratedRegex(@"^(?:(?:never\s*mind|oops|wait|no|sorry|actually)[\s,]+)*(?:undo|revert|reverse)(?:\s+(?:that|it|this|(?:the\s+)?last(?:\s+(?:one|thing|change|command|action))?))?$")]
    private static partial Regex UndoPattern();

    [GeneratedRegex(@"^(?:(?:never\s*mind|oops|no|sorry)[\s,]+)*take\s+(?:that|it)\s+back$")]
    private static partial Regex TakeThatBackPattern();

    [GeneratedRegex(@"^(?:(?:what|which|how many)\s+lists\b.*|(?:what|which)\s+are\s+(?:all\s+)?(?:the\s+|my\s+|our\s+)?lists)$")]
    private static partial Regex WhatListsPattern();

    [GeneratedRegex(@"^(?:show|read|tell|list|give|name)\s+(?:me\s+|us\s+)?(?:all\s+)?(?:of\s+)?(?:the\s+|my\s+|our\s+)?lists$")]
    private static partial Regex ShowListsPattern();

    [GeneratedRegex(@"^(?:what's|whats|what\s+is|what\s+else\s+is|what\s+do\s+we\s+have|what\s+have\s+we\s+got|what's\s+left)\s+on\s+(?<list>.+)$")]
    private static partial Regex WhatsOnPattern();

    [GeneratedRegex(@"^what\s+do\s+(?:we|i)\s+(?:still\s+)?need(?:\s+(?:from|at|on)\s+(?<list>.+))?$")]
    private static partial Regex WhatDoWeNeedPattern();

    [GeneratedRegex(@"^(?:read|show|tell|give|display|open|pull\s+up|bring\s+up|get(?=\s+(?:me|us)\b))\s+(?:me\s+|us\s+)?(?:what's\s+on\s+|what\s+is\s+on\s+)?(?<list>.+)$")]
    private static partial Regex ReadListPattern();

    [GeneratedRegex(@"^(?:what's\s+|whats\s+|what\s+is\s+)?(?<list>(?:(?:the|my|our)\s+)?.+?\s+list)$")]
    private static partial Regex BareListPattern();

    [GeneratedRegex(@"^(?:create|make|start|add|set\s+up|begin|open)\s+(?:a\s+|an\s+|another\s+)?(?:new\s+)?list\s+(?:called|named|for|titled)\s+(?<name>.+)$")]
    private static partial Regex CreateCalledPattern();

    [GeneratedRegex(@"^new\s+list\s+(?:called\s+|named\s+|for\s+)?(?<name>.+)$")]
    private static partial Regex NewListPattern();

    [GeneratedRegex(@"^(?:create|make|start|set\s+up|begin)\s+(?:a\s+|an\s+|another\s+)?(?:new\s+)?(?<name>.+?)\s+list$")]
    private static partial Regex CreateNamedListPattern();

    [GeneratedRegex(@"^(?:clear|remove|delete|clean\s+up|clean\s+out|clear\s+out|get\s+rid\s+of|erase)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:checked\s+off|checked-off|crossed\s+off|completed|checked|done|finished|bought)(?:\s+(?:items|things|stuff|ones|entries))?(?:\s+(?:from|on|off|in)\s+(?<list>.+))?$")]
    private static partial Regex ClearCompletedPattern();

    [GeneratedRegex(@"^(?:clear|delete|remove|erase)\s+(?:out\s+)?everything(?:\s+(?:from|on|off)\s+(?<list>.+))?$")]
    private static partial Regex ClearEverythingPattern();

    [GeneratedRegex(@"^(?:clear|empty|wipe|reset|clean\s+out)\s+(?:out\s+)?(?<list>.+)$")]
    private static partial Regex ClearListPattern();

    [GeneratedRegex(@"^(?:check|cross|tick|mark)\s+off\s+(?<rest>.+)$")]
    private static partial Regex CheckOffPattern();

    [GeneratedRegex(@"^(?:check|cross|tick|mark)\s+(?<items>.+?)\s+off(?:\s+(?:of\s+)?(?<list>.+))?$")]
    private static partial Regex CheckItemsOffPattern();

    [GeneratedRegex(@"^mark\s+(?<rest>.+?)\s+(?:as\s+)?(?:done|complete|completed|bought|finished|checked)$")]
    private static partial Regex MarkDonePattern();

    [GeneratedRegex(@"^(?:(?:i|we|i've|we've|i\s+have|we\s+have)\s+)?(?:just\s+|already\s+)?(?:got|bought|picked\s+up|grabbed|purchased)\s+(?<rest>.+)$")]
    private static partial Regex GotPattern();

    [GeneratedRegex(@"^(?<rest>.+?)\s+(?:is|are)\s+(?:done|checked\s+off|bought|taken\s+care\s+of)$")]
    private static partial Regex ItemIsDonePattern();

    [GeneratedRegex(@"^(?:complete|finish|finished)\s+(?<rest>.+)$")]
    private static partial Regex CompleteVerbPattern();

    [GeneratedRegex(@"^(?:remove|delete|drop|scratch|erase)\s+(?<rest>.+)$")]
    private static partial Regex RemoveVerbPattern();

    [GeneratedRegex(@"^take\s+off\s+(?<rest>.+)$")]
    private static partial Regex TakeOffPattern();

    [GeneratedRegex(@"^take\s+(?<rest>.+)$")]
    private static partial Regex TakePattern();

    [GeneratedRegex(@"^(?:(?:we|i)\s+)?(?:don't|do\s+not|no\s+longer)\s+need\s+(?<rest>.+?)(?:\s+(?:anymore|any\s+more))?$")]
    private static partial Regex DontNeedPattern();

    [GeneratedRegex(@"^(?:add|put|throw|stick|toss|include|pop|write\s+down|jot\s+down|buy|get|pick\s+up|grab|order)\s+(?<rest>.+)$")]
    private static partial Regex AddVerbPattern();

    [GeneratedRegex(@"^(?:(?:we're|we\s+are|were|i'm|i\s+am|im)\s+)?(?:all\s+|almost\s+|nearly\s+|completely\s+)?(?:out\s+of|running\s+low\s+on|low\s+on|running\s+out\s+of)\s+(?<rest>.+)$")]
    private static partial Regex OutOfPattern();

    [GeneratedRegex(@"^(?:we|i)\s+(?:(?:really\s+|also\s+|still\s+)?(?:need|want|could\s+use)\s+(?!to\b)|(?:need|have|got)\s+to\s+(?:get|buy|pick\s+up)\s+|should\s+(?:get|buy)\s+|gotta\s+(?:get|buy)\s+)(?:more\s+)?(?<rest>.+)$")]
    private static partial Regex WeNeedPattern();

    [GeneratedRegex(@"^(?:need|needs)\s+(?!to\b)(?:more\s+)?(?<rest>.+)$")]
    private static partial Regex BareNeedPattern();

    [GeneratedRegex(@"(?:\s*,\s*|\s+)(?:and\s+then|and|then|also|plus)\s+(?=(?:" + Verbs + @")\b)|\s*,\s*(?=(?:" + Verbs + @")\b)")]
    private static partial Regex ClauseBoundary();

    [GeneratedRegex(@"\s*,\s*(?:and\s+|&\s*|plus\s+)?|\s+(?:and|plus)\s+|\s*&\s*")]
    private static partial Regex ItemSeparator();

    [GeneratedRegex(@"^(?<q>(?:\d+(?:[.,/]\d+)?|a|an|" + Numbers + @"|half\s+an?|a\s+couple|a\s+few)\s+(?:" + Units + @"))(?:\s+of)?\s+(?<item>.+)$")]
    private static partial Regex UnitQuantity();

    [GeneratedRegex(@"^(?<q>\d+|" + Numbers + @"|a\s+couple|a\s+few|several)(?:\s+of)?\s+(?<item>.+)$")]
    private static partial Regex CountQuantity();

    [GeneratedRegex(@"[.!?;:""()\[\]]+")]
    private static partial Regex SpeechPunctuation();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"^(?:(?:hey|hi|hello|ok|okay|so|um+|uh+|er+|erm|ah+|oh|hmm+|mm+|yeah|well|alright|all\s+right|please|kindly|just|can\s+you|could\s+you|would\s+you|will\s+you|can\s+we|could\s+we|i\s+want\s+to|i'd\s+like\s+to|i\s+would\s+like\s+to|i\s+need\s+you\s+to|go\s+ahead\s+and|let's|lets)\b[\s,]*)+")]
    private static partial Regex LeadingFiller();

    [GeneratedRegex(@"(?:[\s,]+(?:please|thanks|thank\s+you|for\s+me|now|right\s+now|ok|okay))+$")]
    private static partial Regex TrailingFiller();
}
