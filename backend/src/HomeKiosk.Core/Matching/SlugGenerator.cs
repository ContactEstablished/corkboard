using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace HomeKiosk.Core.Matching;

public static partial class SlugGenerator
{
    /// <summary>"Camping Trip" → "camping-trip", "To-do" → "to-do", "Café" → "cafe".</summary>
    public static string FromName(string name)
    {
        var decomposed = TextNormalizer.NormalizeName(name).Normalize(NormalizationForm.FormD);
        var ascii = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                ascii.Append(c);
            }
        }

        return NonSlugChars().Replace(ascii.ToString(), "-").Trim('-');
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugChars();
}
