using System.Text.RegularExpressions;

namespace HomeKiosk.Core.Matching;

public static partial class TextNormalizer
{
    private static readonly HashSet<string> LeadingFiller = new(StringComparer.OrdinalIgnoreCase)
    {
        "a",
        "an",
        "some",
        "the",
        "more",
    };

    /// <summary>Lower-cased, cleaned phrase used for dedupe and matching: "Some Milk." → "milk".</summary>
    public static string Normalize(string? text) => Clean(text).ToLowerInvariant();

    /// <summary>Cleaned phrase with its first letter capitalized: "some milk." → "Milk".</summary>
    public static string ToDisplay(string? text)
    {
        var cleaned = Clean(text);
        return cleaned.Length == 0 ? cleaned : char.ToUpperInvariant(cleaned[0]) + cleaned[1..];
    }

    /// <summary>
    /// Normalization for list names and aliases: like <see cref="Normalize"/> but keeps leading words,
    /// so "The Store" stays "the store".
    /// </summary>
    public static string NormalizeName(string? text) => Tidy(text).ToLowerInvariant();

    /// <summary>Trims, collapses whitespace, strips trailing punctuation and leading filler words. Keeps case.</summary>
    public static string Clean(string? text)
    {
        var words = Tidy(text).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var start = 0;
        while (start < words.Length - 1 && LeadingFiller.Contains(words[start]))
        {
            start++;
        }

        return string.Join(' ', words, start, words.Length - start);
    }

    private static string Tidy(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "";
        }

        var collapsed = Whitespace().Replace(text.Trim(), " ");
        return TrailingPunctuation().Replace(collapsed, "");
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"[\p{P}\s]+$")]
    private static partial Regex TrailingPunctuation();
}
