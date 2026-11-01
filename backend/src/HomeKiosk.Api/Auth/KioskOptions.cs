using System.ComponentModel.DataAnnotations;

namespace HomeKiosk.Api.Auth;

public sealed class KioskOptions
{
    public const string Section = "Kiosk";

    /// <summary>Shared secret the kiosk sends as <c>X-Kiosk-Key</c>. Random, 32+ characters. Never logged.</summary>
    [Required(ErrorMessage = "Kiosk:ApiKey is required (env: Kiosk__ApiKey).")]
    [MinLength(32, ErrorMessage = "Kiosk:ApiKey must be at least 32 characters.")]
    public string ApiKey { get; set; } = "";

    public string TimeZone { get; set; } = "America/New_York";

    /// <summary>Rolling log files go here (14 days kept).</summary>
    public string LogDirectory { get; set; } = "/data/logs";
}
