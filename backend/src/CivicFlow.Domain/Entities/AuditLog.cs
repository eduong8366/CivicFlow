namespace CivicFlow.Domain.Entities;

/// <summary>
/// An append-only record of a change. It deliberately has no foreign keys or navigations,
/// so audit history outlives the rows it describes.
/// </summary>
public class AuditLog
{
    public long Id { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;

    /// <summary>The case the change belongs to, if any, so a case's full history is one query.</summary>
    public int? CaseId { get; set; }
    public int? UserId { get; set; }
    public DateTimeOffset Timestamp { get; set; }

    /// <summary>JSON of the changed properties' old and new values.</summary>
    public string? Changes { get; set; }
}
