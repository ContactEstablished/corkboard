using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using HomeKiosk.Api.Tests.Speech;
using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace HomeKiosk.Api.Tests;

/// <summary><c>POST /api/voice</c> with a scripted STT engine: limits, decoding, and the shared command pipeline.</summary>
public sealed class VoiceApiTests : IAsyncLifetime
{
    private readonly FakeSpeechToText _speech = new();
    private readonly KioskApiFactory _factory;
    private HttpClient _client = null!;

    public VoiceApiTests()
    {
        _factory = new KioskApiFactory { TestServices = s => s.AddSingleton<ISpeechToText>(_speech) };
    }

    public async ValueTask InitializeAsync()
    {
        _client = _factory.CreateKioskClient();
        await _factory.WaitForSttAsync("ready", TimeSpan.FromSeconds(10), Ct);
        _speech.Clips.Clear(); // the warm-up decode
    }

    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_clip_is_transcribed_and_run_like_a_typed_command()
    {
        _speech.Transcript = "Add milk to the grocery list.";

        var response = await (await PostAsync(Audio.Wav(1.5))).ReadAsync<CommandResponse>();

        Assert.Equal(CommandSource.Voice, response.Source);
        Assert.Equal("Add milk to the grocery list.", response.Transcript);
        Assert.True(response.Understood);
        Assert.Equal("Added milk to Grocery.", response.Reply);
        Assert.Equal("Kiosk", response.AddedBy);
        var item = Assert.Single(response.List!.Items);
        Assert.Equal(("Milk", CommandSource.Voice, "Kiosk"), (item.Text, item.Source, item.AddedBy));
        Assert.Equal(FakeSpeechToText.SttMs, response.Timings.SttMs);
        Assert.Equal(24_000, Assert.Single(_speech.Clips).Length);

        var logged = (await _client.GetFromJsonAsync<List<CommandLogSummary>>("/api/commands/recent", KioskApiFactory.Json, Ct))![0];
        Assert.Equal((CommandSource.Voice, "Add milk to the grocery list.", FakeSpeechToText.SttMs), (logged.Source, logged.RawText, logged.Timings.SttMs));
    }

    [Fact]
    public async Task Voice_changes_can_be_undone()
    {
        _speech.Transcript = "add bread";
        await PostAsync(Audio.Wav(1));

        var undo = await (await _client.PostAsync("/api/undo", null, Ct)).ReadAsync<CommandResponse>();

        Assert.Equal("Undid the last change: Added bread to Grocery.", undo.Reply);
    }

    [Fact]
    public async Task A_clip_under_300_ms_is_not_transcribed()
    {
        _speech.Transcript = "add milk";

        var response = await (await PostAsync(Audio.Wav(0.2))).ReadAsync<CommandResponse>();

        Assert.False(response.Understood);
        Assert.Equal("I didn't catch that.", response.Reply);
        Assert.Equal("", response.Transcript);
        Assert.Empty(response.Actions);
        Assert.Empty(_speech.Clips);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public async Task No_words_means_I_didnt_catch_that(string transcript)
    {
        _speech.Transcript = transcript;

        var response = await PostAsync(Audio.Wav(1));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var command = await response.ReadAsync<CommandResponse>();
        Assert.Equal((false, "I didn't catch that."), (command.Understood, command.Reply));
        Assert.Single(_speech.Clips);
    }

    [Fact]
    public async Task Speech_that_isnt_a_command_gets_the_usual_hint()
    {
        _speech.Transcript = "What's the weather?";

        var response = await (await PostAsync(Audio.Wav(1))).ReadAsync<CommandResponse>();

        Assert.Equal("I didn't catch that. Try 'add milk to the grocery list'.", response.Reply);
        Assert.Equal("What's the weather?", response.Transcript);
    }

    [Fact]
    public async Task A_clip_over_30_seconds_is_413()
    {
        var response = await PostAsync(Audio.Wav(30.5));

        await AssertProblemAsync(response, HttpStatusCode.RequestEntityTooLarge, "Audio clips can be at most 30 seconds.");
        Assert.Empty(_speech.Clips);
    }

    [Fact]
    public async Task An_upload_over_2_MB_is_413()
    {
        var response = await PostAsync(new byte[2 * 1024 * 1024 + 1]);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task A_missing_audio_field_is_400()
    {
        var response = await PostAsync(Audio.Wav(1), field: "file");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ogg_opus_goes_through_ffmpeg()
    {
        Audio.SkipWithoutFfmpeg();
        _speech.Transcript = "Add milk to the grocery list.";

        var response = await PostAsync(Audio.Fixture("add-milk-to-the-grocery-list.ogg"), "audio/ogg; codecs=opus");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.InRange(Assert.Single(_speech.Clips).Length, 2.3 * ISpeechToText.SampleRate, 2.6 * ISpeechToText.SampleRate);
    }

    [Fact]
    public async Task Unreadable_audio_is_400()
    {
        Audio.SkipWithoutFfmpeg();
        var garbage = new byte[4096];
        new Random(3).NextBytes(garbage);

        var response = await PostAsync(garbage, "audio/webm");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty("audio", out _));
    }

    [Fact]
    public async Task Voice_needs_the_kiosk_key()
    {
        using var form = Form(Audio.Wav(1), "audio/wav", "audio");

        var response = await _factory.CreateClient().PostAsync("/api/voice", form, Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private async Task<HttpResponseMessage> PostAsync(byte[] audio, string contentType = "audio/wav", string field = "audio")
    {
        using var form = Form(audio, contentType, field);
        return await _client.PostAsync("/api/voice", form, Ct);
    }

    internal static MultipartFormDataContent Form(byte[] audio, string contentType, string field)
    {
        var file = new ByteArrayContent(audio);
        file.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        return new MultipartFormDataContent { { file, field, "clip" } };
    }

    internal static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string detail)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(detail, problem.RootElement.GetProperty("detail").GetString());
    }
}

/// <summary>What <c>/api/voice</c> and <c>/api/health</c> say before STT is ready, or when it can't be.</summary>
public sealed class VoiceAvailabilityTests
{
    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Voice_is_503_while_the_model_loads_then_works()
    {
        var speech = new FakeSpeechToText { HoldLoading = true, Transcript = "add eggs" };
        await using var factory = new KioskApiFactory { TestServices = s => s.AddSingleton<ISpeechToText>(speech) };
        var client = factory.CreateKioskClient();

        await factory.WaitForSttAsync("loading", TimeSpan.FromSeconds(10), Ct);
        using (var form = VoiceApiTests.Form(Audio.Wav(1), "audio/wav", "audio"))
        {
            await VoiceApiTests.AssertProblemAsync(
                await client.PostAsync("/api/voice", form, Ct),
                HttpStatusCode.ServiceUnavailable,
                "Speech recognition is still loading. Try again in a moment.");
        }

        speech.FinishLoading();
        await factory.WaitForSttAsync("ready", TimeSpan.FromSeconds(10), Ct);
        using (var form = VoiceApiTests.Form(Audio.Wav(1), "audio/wav", "audio"))
        {
            Assert.Equal("Added eggs to Grocery.", (await (await client.PostAsync("/api/voice", form, Ct)).ReadAsync<CommandResponse>()).Reply);
        }
    }

    [Theory]
    [InlineData("Parakeet")] // the test host points Stt:ModelPath at an empty folder
    [InlineData("Whisper")] // not implemented
    public async Task Without_a_usable_engine_health_says_error_and_voice_is_503(string engine)
    {
        await using var factory = new KioskApiFactory { Settings = { ["Stt:Engine"] = engine } };

        await factory.WaitForSttAsync("error", TimeSpan.FromSeconds(10), Ct);
        using var form = VoiceApiTests.Form(Audio.Wav(1), "audio/wav", "audio");
        await VoiceApiTests.AssertProblemAsync(
            await factory.CreateKioskClient().PostAsync("/api/voice", form, Ct),
            HttpStatusCode.ServiceUnavailable,
            "Speech recognition isn't available. See /api/health and the server log.");

        // Everything that isn't voice still works.
        var command = await factory.CreateKioskClient().PostAsJsonAsync("/api/commands", new { text = "add milk" }, Ct);
        Assert.Equal(HttpStatusCode.OK, command.StatusCode);
    }
}
