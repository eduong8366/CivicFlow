using CivicFlow.Application.Common;
using CivicFlow.Domain.Enums;
using FluentValidation;

namespace CivicFlow.Application.Tasks;

/// <summary>A row in My Work or a department queue: the task plus enough of its case to triage it.</summary>
public sealed record TaskListItemDto(
    int Id,
    string Name,
    int Sequence,
    WorkflowTaskStatus Status,
    int DepartmentId,
    string DepartmentName,
    int? AssigneeId,
    string? AssigneeName,
    DateOnly? DueDate,
    DateTimeOffset? StartedAt,
    bool IsOverdue,
    int CaseId,
    string CaseNumber,
    string CaseTitle,
    string CaseTypeName,
    CasePriority CasePriority,
    CaseStatus CaseStatus);

public sealed class TaskQueueQuery : PageQuery
{
    /// <summary>Defaults to the caller's department. Only admins may view other departments, or all of them.</summary>
    public int? DepartmentId { get; set; }
}

public sealed class TaskQueueQueryValidator : PageQueryValidator<TaskQueueQuery>;

/// <summary>Assigns a task to <see cref="AssigneeId"/>, or returns it to its department's queue when that's null.</summary>
public sealed record AssignTaskRequest(int? AssigneeId);

public sealed record CompleteTaskRequest(TaskOutcome Outcome, string? Notes);

public sealed class CompleteTaskRequestValidator : AbstractValidator<CompleteTaskRequest>
{
    public CompleteTaskRequestValidator()
    {
        RuleFor(r => r.Outcome).IsInEnum().NotEqual(TaskOutcome.None);
        RuleFor(r => r.Notes).MaximumLength(2000);

        // Anything that sends work backwards or stops it needs a reason on the record.
        RuleFor(r => r.Notes).NotEmpty()
            .When(r => r.Outcome is TaskOutcome.Reject or TaskOutcome.Return or TaskOutcome.RequestInfo)
            .WithMessage("Notes are required when rejecting, returning or requesting information.");
    }
}
