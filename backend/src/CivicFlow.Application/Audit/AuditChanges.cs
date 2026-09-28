using System.Collections;
using System.Globalization;
using System.Text.Json;

namespace CivicFlow.Application.Audit;

/// <summary>One property's value before and after a change, formatted as text. Null means no value.</summary>
public sealed record AuditChange(string? Old, string? New);

/// <summary>
/// The format of <see cref="Domain.Entities.AuditLog.Changes"/>: a JSON object mapping each changed
/// property to its old and new values, e.g. <c>{"Status":{"old":"Open","new":"InProgress"}}</c>.
/// Values are stored as text so the log reads the same whatever the property's type.
/// </summary>
public static class AuditChanges
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string Serialize(IReadOnlyDictionary<string, AuditChange> changes) =>
        JsonSerializer.Serialize(changes, JsonOptions);

    public static IReadOnlyDictionary<string, AuditChange> Deserialize(string? json) =>
        string.IsNullOrEmpty(json)
            ? new Dictionary<string, AuditChange>()
            : JsonSerializer.Deserialize<Dictionary<string, AuditChange>>(json, JsonOptions) ?? [];

    /// <summary>Formats a property value: invariant numbers, ISO 8601 dates, enum names and JSON for lists.</summary>
    public static string? Format(object? value) => value switch
    {
        null => null,
        string text => text,
        bool flag => flag ? "true" : "false",
        Enum member => member.ToString(),
        DateTimeOffset instant => instant.ToString("O", CultureInfo.InvariantCulture),
        DateTime instant => instant.ToString("O", CultureInfo.InvariantCulture),
        DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        IEnumerable items => JsonSerializer.Serialize(items, JsonOptions),
        _ => value.ToString(),
    };
}
