using HomeKiosk.Core.Matching;

namespace HomeKiosk.Core.Tests.Matching;

public sealed class SlugGeneratorTests
{
    [Theory]
    [InlineData("Grocery", "grocery")]
    [InlineData("To-do", "to-do")]
    [InlineData("Camping Trip", "camping-trip")]
    [InlineData("  Hardware store!! ", "hardware-store")]
    [InlineData("Café", "cafe")]
    [InlineData("Kids' stuff", "kids-stuff")]
    [InlineData("!!!", "")]
    public void FromName_builds_url_safe_slugs(string name, string expected) =>
        Assert.Equal(expected, SlugGenerator.FromName(name));
}
