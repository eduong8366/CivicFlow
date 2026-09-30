using CivicFlow.Application.Common;
using FluentValidation;

namespace CivicFlow.Application.Audit;

/// <summary>
/// One audit log entry. <see cref="UserName"/> is null for system changes and
/// <see cref="CaseNumber"/> is null for changes outside any case (or to a case since deleted).
/// </summary>
public sealed record AuditEntryDto(
    long Id,
    DateTimeOffset Timestamp,
    string EntityType,
    string EntityId,
    string Action,
    int? CaseId,
    string? CaseNumber,
    int? UserId,
    string? UserName,
    IReadOnlyDictionary<string, AuditChange> Changes);

/// <summary>Filters for the agency audit log, all optional. Entries come newest first.</summary>
public sealed class AuditQuery : PageQuery
{
    /// <summary>The kind of record changed, e.g. Case, WorkflowTask, Comment, Attachment or User.</summary>
    public string? EntityType { get; set; }

    /// <summary>The changed record's id; use with <see cref="EntityType"/>.</summary>
    public string? EntityId { get; set; }

    public int? CaseId { get; set; }

    /// <summary>Who made the change.</summary>
    public int? UserId { get; set; }

    /// <summary>An action from <see cref="AuditActions"/>, e.g. Created, Claimed or Approved.</summary>
    public string? Action { get; set; }

    /// <summary>On or after this date (Pacific time).</summary>
    public DateOnly? From { get; set; }

    /// <summary>On or before this date (Pacific time).</summary>
    public DateOnly? To { get; set; }
}

public sealed class AuditQueryValidator : PageQueryValidator<AuditQuery>
{
    public AuditQueryValidator()
    {
        RuleFor(q => q.EntityType).MaximumLength(100);
        RuleFor(q => q.EntityId).MaximumLength(50);
        RuleFor(q => q.Action).MaximumLength(50);
        RuleFor(q => q.To).GreaterThanOrEqualTo(q => q.From)
            .When(q => q.From is not null && q.To is not null)
            .WithMessage("'To' must not be before 'From'.");
    }
}
