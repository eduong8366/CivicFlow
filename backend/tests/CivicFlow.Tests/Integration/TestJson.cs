using System.Text.Json;
using System.Text.Json.Serialization;

namespace CivicFlow.Tests.Integration;

internal static class TestJson
{
    /// <summary>Matches the API: web defaults with enums as strings.</summary>
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };
}
