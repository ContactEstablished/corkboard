using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Api.Auth;

/// <summary>
/// Authenticates the kiosk by its shared key. REST calls send <c>X-Kiosk-Key</c>. The SignalR client's
/// <c>accessTokenFactory</c> sends the same key as <c>Authorization: Bearer</c> (negotiate, long polling)
/// or as the <c>access_token</c> query string (WebSockets), which is only read on hub paths.
/// </summary>
public sealed class KioskKeyAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptions<KioskOptions> kiosk) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "KioskKey";
    public const string HeaderName = "X-Kiosk-Key";
    public const string HubPathPrefix = "/hubs";

    private readonly byte[] _expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(kiosk.Value.ApiKey));

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var key = ReadKey();
        if (string.IsNullOrEmpty(key))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        // Hashing first makes the comparison constant-time regardless of the key's length.
        var matches = CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(key)), _expectedHash);
        if (!matches)
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid kiosk key."));
        }

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, "Kiosk")], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }

    private string? ReadKey()
    {
        string? header = Request.Headers[HeaderName];
        if (!string.IsNullOrEmpty(header))
        {
            return header;
        }

        string? authorization = Request.Headers.Authorization;
        if (authorization?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true)
        {
            return authorization["Bearer ".Length..].Trim();
        }

        return Request.Path.StartsWithSegments(HubPathPrefix) ? Request.Query["access_token"].ToString() : null;
    }
}
