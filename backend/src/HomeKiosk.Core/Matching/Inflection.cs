namespace HomeKiosk.Core.Matching;

/// <summary>Just enough English plural handling to match "banana" with "bananas".</summary>
public static class Inflection
{
    /// <summary>True when two phrases differ only by the plural ending of their last word.</summary>
    public static bool SameSingular(string a, string b) => SingularForms(a).Overlaps(SingularForms(b));

    /// <summary>
    /// Candidate singular forms of a phrase's last word. Generating every candidate and comparing sets
    /// avoids guessing the right rule ("tomatoes" → "tomato", but "shoes" → "shoe").
    /// </summary>
    public static HashSet<string> SingularForms(string phrase)
    {
        var space = phrase.LastIndexOf(' ');
        var head = phrase[..(space + 1)];
        var word = phrase[(space + 1)..];

        var forms = new HashSet<string>(StringComparer.Ordinal) { phrase };
        if (word.Length <= 3 || word.EndsWith("ss", StringComparison.Ordinal))
        {
            return forms;
        }

        if (word.EndsWith('s'))
        {
            forms.Add(head + word[..^1]);
        }

        if (word.EndsWith("es", StringComparison.Ordinal))
        {
            forms.Add(head + word[..^2]);
        }

        if (word.EndsWith("ies", StringComparison.Ordinal))
        {
            forms.Add(head + word[..^3] + "y");
        }

        return forms;
    }
}
