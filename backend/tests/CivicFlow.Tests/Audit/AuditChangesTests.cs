using CivicFlow.Application.Audit;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Tests.Audit;

public class AuditChangesTests
{
    public static TheoryData<object?, string?> Values => new()
    {
        { null, null },
        { "text", "text" },
        { true, "true" },
        { 1234.5m, "1234.5" },
        { 42, "42" },
        { CaseStatus.InProgress, "InProgress" },
        { new DateOnly(2026, 9, 28), "2026-09-28" },
        { new DateTimeOffset(2026, 9, 28, 13, 45, 0, TimeSpan.Zero), "2026-09-28T13:45:00.0000000+00:00" },
        { new List<string> { "A", "B" }, """["A","B"]""" },
    };

    [Theory]
    [MemberData(nameof(Values))]
    public void Values_are_formatted_invariantly(object? value, string? expected)
    {
        Assert.Equal(expected, AuditChanges.Format(value));
    }

    [Fact]
    public void Changes_round_trip_through_json()
    {
        var changes = new Dictionary<string, AuditChange>
        {
            ["Status"] = new("Open", "InProgress"),
            ["AssigneeId"] = new(null, "7"),
        };

        var json = AuditChanges.Serialize(changes);

        Assert.Equal("""{"Status":{"old":"Open","new":"InProgress"},"AssigneeId":{"old":null,"new":"7"}}""", json);
        Assert.Equal(changes, AuditChanges.Deserialize(json));
        Assert.Empty(AuditChanges.Deserialize(null));
    }
}
