using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Cases;

/// <summary>A row in case search. The "current" columns describe the case's active task, if any.</summary>
public sealed record CaseListItemDto(
    int Id,
    string CaseNumber,
    string Title,
    int CaseTypeId,
    string CaseTypeName,
    CaseStatus Status,
    CaseResolution? Resolution,
    CasePriority Priority,
    string RequesterName,
    DateTimeOffset CreatedAt,
    DateOnly? DueDate,
    DateTimeOffset? ClosedAt,
    bool IsOverdue,
    string? CurrentStep,
    string? CurrentDepartmentName,
    string? CurrentAssigneeName,
    DateOnly? CurrentStepDueDate);

public sealed record CaseDetailDto(
    int Id,
    string CaseNumber,
    string Title,
    string? Description,
    CaseTypeSummaryDto CaseType,
    CaseStatus Status,
    CaseResolution? Resolution,
    CasePriority Priority,
    RequesterDto Requester,
    UserSummaryDto CreatedBy,
    DateTimeOffset CreatedAt,
    DateOnly? DueDate,
    DateTimeOffset? ClosedAt,
    bool IsOverdue,
    IReadOnlyList<CaseFieldDto> Fields,
    IReadOnlyList<WorkflowTaskDto> Tasks,
    CaseActionsDto Actions);

public sealed record CaseTypeSummaryDto(int Id, string Name, string Prefix);

public sealed record RequesterDto(string Name, string? Email, string? Phone, string? Address);

public sealed record UserSummaryDto(int Id, string FullName);

/// <summary>Every field of the case type, in form order; <see cref="Value"/> is null when left blank.</summary>
public sealed record CaseFieldDto(int FieldId, string Key, string Label, FieldDataType DataType, bool IsRequired, string? Value);

/// <summary>
/// One step instance. A step that was returned or reopened has several instances with the same
/// <see cref="Sequence"/>; the last one is its current state.
/// </summary>
public sealed record WorkflowTaskDto(
    int Id,
    string Name,
    int Sequence,
    int DepartmentId,
    string DepartmentName,
    int? AssigneeId,
    string? AssigneeName,
    WorkflowTaskStatus Status,
    TaskOutcome? Outcome,
    IReadOnlyList<TaskOutcome> AllowedOutcomes,
    string? Notes,
    DateOnly? DueDate,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    bool IsOverdue,
    TaskActionsDto Actions);

/// <summary>What the caller may do right now, so the UI can show only the controls that will work.</summary>
public sealed record CaseActionsDto(bool CanHold, bool CanCancel, bool CanReopen);

public sealed record TaskActionsDto(bool CanClaim, bool CanAssign, bool CanComplete);
