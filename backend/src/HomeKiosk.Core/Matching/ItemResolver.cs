namespace HomeKiosk.Core.Matching;

/// <summary>
/// Finds the items a spoken phrase refers to. Stages, most precise first: exact normalized match →
/// singular/plural → whole-word contains → fuzzy. The first stage with any hit wins: one hit is a
/// match, several are ambiguous, none means not found.
/// </summary>
public static class ItemResolver
{
    public static IReadOnlyList<T> Resolve<T>(string query, IReadOnlyList<T> items, Func<T, string> normalizedText)
    {
        var q = TextNormalizer.Normalize(query);
        if (q.Length == 0 || items.Count == 0)
        {
            return [];
        }

        Func<string, bool>[] stages =
        [
            text => text == q,
            text => Inflection.SameSingular(text, q),
            text => ContainsWords(text, q) || ContainsWords(q, text),
            text => Levenshtein.IsClose(text, q),
        ];

        foreach (var stage in stages)
        {
            var hits = items.Where(i => stage(normalizedText(i))).ToList();
            if (hits.Count > 0)
            {
                return hits;
            }
        }

        return [];
    }

    /// <summary>"green apples" contains "apple": whole words, last word compared singular/plural-insensitively.</summary>
    private static bool ContainsWords(string haystack, string needle)
    {
        var words = haystack.Split(' ');
        var needleWords = needle.Split(' ');
        for (var start = 0; start + needleWords.Length <= words.Length; start++)
        {
            var window = string.Join(' ', words, start, needleWords.Length);
            if (window == needle || Inflection.SameSingular(window, needle))
            {
                return true;
            }
        }

        return false;
    }
}
