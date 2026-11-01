using HomeKiosk.Core.Abstractions;
using HomeKiosk.Infrastructure.Speech;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Api.Tests.Speech;

public sealed class WavDecoderTests
{
    [Fact]
    public void Decodes_16k_mono_pcm16_to_floats()
    {
        var pcm = new byte[] { 0x00, 0x40, 0x00, 0x80, 0xFF, 0x7F, 0x00, 0x00 }; // 16384, -32768, 32767, 0
        var wav = Audio.Riff(Audio.Fmt(1, 1, 16000, 16), Audio.Chunk("data", pcm));

        Assert.True(WavDecoder.TryDecode(wav, out var samples));
        Assert.Equal([0.5f, -1f, 32767 / 32768f, 0f], samples);
    }

    [Fact]
    public void Skips_other_chunks_including_odd_sized_ones()
    {
        var wav = Audio.Riff(
            Audio.Chunk("LIST", [1, 2, 3]),
            Audio.Fmt(1, 1, 16000, 16),
            Audio.Chunk("fact", [4, 0, 0, 0, 5]),
            Audio.Chunk("data", [0x00, 0x40]));

        Assert.True(WavDecoder.TryDecode(wav, out var samples));
        Assert.Equal([0.5f], samples);
    }

    [Fact]
    public void A_streaming_data_size_reads_to_the_end()
    {
        var wav = Audio.Riff(Audio.Fmt(1, 1, 16000, 16), Audio.Chunk("data", [0x00, 0x40, 0x00, 0x40], declaredSize: 0xFFFFFFFF));

        Assert.True(WavDecoder.TryDecode(wav, out var samples));
        Assert.Equal(2, samples.Length);
    }

    [Theory]
    [InlineData(44100, 1, 16)]
    [InlineData(16000, 2, 16)]
    [InlineData(16000, 1, 8)]
    public void Leaves_other_formats_to_ffmpeg(int rate, int channels, int bits)
    {
        Assert.False(WavDecoder.TryDecode(Audio.Wav(0.1, rate, channels, bits), out _));
    }

    [Fact]
    public void Rejects_non_pcm_data_before_fmt_and_non_wav()
    {
        Assert.False(WavDecoder.TryDecode(Audio.Riff(Audio.Fmt(3, 1, 16000, 16), Audio.Chunk("data", [0, 0])), out _)); // float
        Assert.False(WavDecoder.TryDecode(Audio.Riff(Audio.Chunk("data", [0, 0]), Audio.Fmt(1, 1, 16000, 16)), out _));
        Assert.False(WavDecoder.TryDecode("OggS\0\0\0\0\0\0\0\0\0\0"u8, out _));
        Assert.False(WavDecoder.TryDecode([], out _));
    }

    [Theory]
    [InlineData("add-milk-to-the-grocery-list.wav")]
    [InlineData("whats-on-the-grocery-list.wav")]
    [InlineData("add-several-items.wav")]
    public void The_fixtures_take_the_fast_path(string fixture)
    {
        Assert.True(WavDecoder.TryDecode(Audio.Fixture(fixture), out var samples));
        Assert.InRange(samples.Length, 2 * ISpeechToText.SampleRate, 6 * ISpeechToText.SampleRate);
    }
}

public sealed class FfmpegAudioDecoderTests
{
    private readonly AudioDecoder _decoder = new(new FfmpegAudioDecoder(Options.Create(new SttOptions())));

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Resamples_and_downmixes_other_wavs()
    {
        Audio.SkipWithoutFfmpeg();

        var samples = await _decoder.DecodeAsync(Audio.Wav(1.0, rate: 44100, channels: 2), "audio/wav", Ct);

        Assert.InRange(samples.Length, 15_900, 16_100);
        Assert.Contains(samples, s => Math.Abs(s) > 0.1f); // the tone survived
    }

    [Fact]
    public async Task Decodes_ogg_opus()
    {
        Audio.SkipWithoutFfmpeg();

        var wav = Audio.Fixture("add-milk-to-the-grocery-list.wav");
        Assert.True(WavDecoder.TryDecode(wav, out var original));

        var samples = await _decoder.DecodeAsync(Audio.Fixture("add-milk-to-the-grocery-list.ogg"), "audio/ogg", Ct);

        Assert.InRange(samples.Length, original.Length * 0.97, original.Length * 1.03);
    }

    [Fact]
    public async Task Stops_a_second_past_the_length_limit()
    {
        Audio.SkipWithoutFfmpeg();
        var decoder = new FfmpegAudioDecoder(Options.Create(new SttOptions { MaxSeconds = 2 }));

        var samples = await decoder.DecodeAsync(Audio.Wav(5.0, rate: 8000), Ct);

        Assert.InRange(samples.Length, 3 * ISpeechToText.SampleRate - 400, 3 * ISpeechToText.SampleRate + 400);
    }

    [Fact]
    public async Task Garbage_is_invalid_data()
    {
        Audio.SkipWithoutFfmpeg();

        var garbage = new byte[4096];
        new Random(7).NextBytes(garbage);

        await Assert.ThrowsAsync<InvalidDataException>(() => _decoder.DecodeAsync(garbage, "audio/webm", Ct));
    }
}
