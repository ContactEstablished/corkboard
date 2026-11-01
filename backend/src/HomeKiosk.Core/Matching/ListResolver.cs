using System.Text.RegularExpressions;
using HomeKiosk.Core.Commands;

namespace HomeKiosk.Core.Matching;

/// <summary>Turns what someone called a list ("the groceries list", "to do") into a list slug.</summary>
public static partial class ListResolver
{
    /// <summary>
    /// Strips articles and a trailing "list": "the grocery list" → "grocery". Returns "" for a bare
    /// reference to the default list ("the list", "my list").
    /// </summary>
    public static string CleanReference(string? spoken)
    {
        var text = ReferenceNoise().Replace(TextNormalizer.NormalizeName(spoken), "").Trim();
        return text == "list" ? "" : text;
    }

    /// <summary>Exact match on slug, name or alias (case-insensitive), then fuzzy on the same.</summary>
    public static ListSummaryWithAliases? Resolve(string? spoken, IEnumerable<ListSummaryWithAliases> lists)
    {
        var all = lists as IReadOnlyCollection<ListSummaryWithAliases> ?? [.. lists];
        return ResolveExact(spoken, all) ?? ResolveFuzzy(CleanReference(spoken), all);
    }

    public static ListSummaryWithAliases? ResolveExact(string? spoken, IEnumerable<ListSummaryWithAliases> lists)
    {
        var reference = CleanReference(spoken);
        if (reference.Length == 0)
        {
            return null;
        }

        var slug = SlugGenerator.FromName(reference);
        return lists.FirstOrDefault(l => Names(l).Contains(reference) || l.Slug == slug);
    }

    private static ListSummaryWithAliases? ResolveFuzzy(string reference, IReadOnlyCollection<ListSummaryWithAliases> lists)
    {
        if (reference.Length == 0)
        {
            return null;
        }

        var close = lists
            .Select(l => (List: l, Close: Names(l).Where(n => Levenshtein.IsClose(n, reference)).ToList()))
            .Where(x => x.Close.Count > 0)
            .Select(x => (x.List, Distance: x.Close.Min(n => Levenshtein.Distance(n, reference))))
            .OrderBy(x => x.Distance)
            .ToList();

        // Two lists equally close is a guess, not a match.
        return close.Count == 1 || (close.Count > 1 && close[0].Distance < close[1].Distance) ? close[0].List : null;
    }

    private static IEnumerable<string> Names(ListSummaryWithAliases list) =>
        list.Aliases.Append(list.Slug).Append(TextNormalizer.NormalizeName(list.Name)).Distinct();

    [GeneratedRegex(@"^(?:(?:the|my|our|a)\s+)+|\s+lists?$")]
    private static partial Regex ReferenceNoise();
}
