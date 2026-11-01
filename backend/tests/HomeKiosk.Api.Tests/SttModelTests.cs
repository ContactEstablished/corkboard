using System.Net;
using HomeKiosk.Api.Tests.Speech;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Api.Tests;

/// <summary>
/// Loads the real Parakeet model once for the class. Skipped unless it has been downloaded
/// (scripts/download-models) or <c>KIOSK_STT_MODEL</c> points at it.
/// </summary>
public sealed class SttModelFixture : IAsyncLifetime
{
    public KioskApiFactory? Factory { get; private set; }

    public async ValueTask InitializeAsync()
    {
        if (Audio.ModelDirectory() is not { } model)
        {
            return;
        }

        Factory = new KioskApiFactory { Settings = { ["Stt:ModelPath"] = model } };
        await Factory.WaitForSttAsync("ready", TimeSpan.FromMinutes(2), TestContext.Current.CancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (Factory is not null)
        {
            await Factory.DisposeAsync();
        }
    }
}

/// <summary>Spec M3 acceptance: the recorded fixtures transcribe and apply, and a ~4 s clip decodes in under 1.5 s.</summary>
[Trait("Category", "RequiresModel")]
public sealed class SttModelTests(SttModelFixture fixture) : IClassFixture<SttModelFixture>
{
    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Spoken_commands_are_transcribed_and_applied()
    {
        var added = await SayAsync("add-milk-to-the-grocery-list.wav");

        Assert.Contains("milk", added.Transcript!, StringComparison.OrdinalIgnoreCase);
        Assert.True(added.Understood, $"Transcript: {added.Transcript}");
        Assert.Equal(CommandSource.Voice, added.Source);
        Assert.Equal((ActionType.AddItems, "grocery"), (added.Actions[0].Type, added.Actions[0].List));
        Assert.Contains(added.List!.Items, i => i.Text == "Milk");

        var read = await SayAsync("whats-on-the-grocery-list.wav");

        Assert.Equal(ActionType.GetList, Assert.Single(read.Actions).Type);
        Assert.StartsWith("Grocery has", read.Reply);
        Assert.Contains("milk", read.Reply);
    }

    [Fact]
    public async Task A_4_second_clip_transcribes_in_under_1_5_seconds()
    {
        var response = await SayAsync("add-several-items.wav");

        Assert.True(response.Timings.SttMs < 1500, $"STT took {response.Timings.SttMs} ms");
        var items = response.List!.Items.Select(i => i.Text).ToList();
        Assert.True(new[] { "Eggs", "Bread", "Orange juice" }.All(items.Contains), $"Transcript: {response.Transcript}; items: {string.Join(", ", items)}");
    }

    [Fact]
    public async Task Ogg_opus_transcribes_like_wav()
    {
        Audio.SkipWithoutFfmpeg();

        var response = await SayAsync("add-milk-to-the-grocery-list.ogg", "audio/ogg");

        Assert.Contains("milk", response.Transcript!, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(response.List!.Items, i => i.Text == "Milk");
    }

    private async Task<CommandResponse> SayAsync(string fixtureName, string contentType = "audio/wav")
    {
        Assert.SkipWhen(fixture.Factory is null, "STT model not downloaded (scripts/download-models) and KIOSK_STT_MODEL not set");

        using var form = VoiceApiTests.Form(Audio.Fixture(fixtureName), contentType, "audio");
        var response = await fixture.Factory!.CreateKioskClient().PostAsync("/api/voice", form, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync<CommandResponse>();
    }
}
