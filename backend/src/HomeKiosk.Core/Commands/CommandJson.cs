using System.Text.Json;
using System.Text.Json.Serialization;

namespace HomeKiosk.Core.Commands;

/// <summary>Serialization of <see cref="LoggedAction"/>s into the command log. Same casing as the API.</summary>
public static class CommandJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static string Serialize(IEnumerable<LoggedAction> actions) => JsonSerializer.Serialize(actions, Options);

    public static IReadOnlyList<LoggedAction> Deserialize(string json) =>
        JsonSerializer.Deserialize<List<LoggedAction>>(json, Options) ?? [];
}
