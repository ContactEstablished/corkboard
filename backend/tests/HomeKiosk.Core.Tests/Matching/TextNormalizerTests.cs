using HomeKiosk.Core.Matching;

namespace HomeKiosk.Core.Tests.Matching;

public sealed class TextNormalizerTests
{
    [Theory]
    [InlineData("Milk", "milk")]
    [InlineData("  Paper   Towels ", "paper towels")]
    [InlineData("Milk.", "milk")]
    [InlineData("eggs, ", "eggs")]
    [InlineData("Some milk", "milk")]
    [InlineData("a dozen eggs", "dozen eggs")]
    [InlineData("some more coffee!", "coffee")]
    [InlineData("the", "the")] // never strip a phrase down to nothing
    [InlineData("", "")]
    [InlineData(null, "")]
    public void Normalize_cleans_and_lowercases(string? input, string expected) =>
        Assert.Equal(expected, TextNormalizer.Normalize(input));

    [Theory]
    [InlineData("milk", "Milk")]
    [InlineData("some milk.", "Milk")]
    [InlineData("iPhone charger", "IPhone charger")]
    [InlineData("paper towels", "Paper towels")]
    public void ToDisplay_capitalizes_the_first_letter_only(string input, string expected) =>
        Assert.Equal(expected, TextNormalizer.ToDisplay(input));

    [Theory]
    [InlineData("The Store", "the store")]
    [InlineData(" To  Do. ", "to do")]
    public void NormalizeName_keeps_leading_words(string input, string expected) =>
        Assert.Equal(expected, TextNormalizer.NormalizeName(input));
}
