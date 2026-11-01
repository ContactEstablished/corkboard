using System.Net;
using System.Text.Json;

namespace HomeKiosk.Api.Tests;

public sealed class AuthAndHealthTests(KioskApiFactory factory) : IClassFixture<KioskApiFactory>
{
    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Requests_without_a_key_get_401_problem()
    {
        var response = await factory.CreateClient().GetAsync("/api/lists", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Requests_with_a_wrong_key_get_401()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Kiosk-Key", "wrong-key");

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/lists", Ct)).StatusCode);
    }

    [Fact]
    public async Task Bearer_token_is_accepted_like_the_header()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", KioskApiFactory.ApiKey);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/lists", Ct)).StatusCode);
    }

    [Fact]
    public async Task Access_token_query_string_works_for_the_hub_only()
    {
        var client = factory.CreateClient();
        var key = Uri.EscapeDataString(KioskApiFactory.ApiKey);

        var hub = await client.PostAsync($"/hubs/kiosk/negotiate?negotiateVersion=1&access_token={key}", null, Ct);
        var anonymousHub = await client.PostAsync("/hubs/kiosk/negotiate?negotiateVersion=1", null, Ct);
        var rest = await client.GetAsync($"/api/lists?access_token={key}", Ct);

        Assert.Equal(HttpStatusCode.OK, hub.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousHub.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, rest.StatusCode);
    }

    [Fact]
    public async Task Health_needs_no_key_and_reports_feature_status()
    {
        var response = await factory.CreateClient().GetAsync("/api/health", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var health = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        Assert.Equal("ok", health.RootElement.GetProperty("status").GetString());
        Assert.Contains(health.RootElement.GetProperty("stt").GetString(), new[] { "loading", "error" }); // no model in tests
        Assert.Equal("disabled", health.RootElement.GetProperty("telegram").GetString());
        Assert.False(string.IsNullOrEmpty(health.RootElement.GetProperty("version").GetString()));
    }

    [Fact]
    public async Task OpenApi_document_is_public_and_declares_the_kiosk_key()
    {
        var json = await factory.CreateClient().GetStringAsync("/openapi/v1.json", Ct);

        Assert.Contains("X-Kiosk-Key", json);
        Assert.Contains("/api/lists/{slug}/items", json);
    }
}
