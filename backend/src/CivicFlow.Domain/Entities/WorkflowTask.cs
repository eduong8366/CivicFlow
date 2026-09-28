using CivicFlow.Domain.Common;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Domain.Entities;

/// <summary>
/// A case's instance of a workflow step. <see cref="Name"/> and <see cref="Sequence"/> are
/// copied from the template so later edits to the case type don't rewrite existing cases.
/// </summary>
public class WorkflowTask : Entity
{
    public int CaseId { get; set; }
    public Case Case { get; set; } = null!;

    public int StepTemplateId { get; set; }
    public WorkflowStepTemplate StepTemplate { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public int Sequence { get; set; }

    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    /// <summary>Null while the task waits in its department's queue.</summary>
    public int? AssigneeId { get; set; }
    public User? Assignee { get; set; }

    public WorkflowTaskStatus Status { get; set; } = WorkflowTaskStatus.Pending;
    public TaskOutcome? Outcome { get; set; }
    public string? Notes { get; set; }

    /// <summary>Set when the task becomes active: activation date plus the step's SLA days.</summary>
    public DateOnly? DueDate { get; set; }

    /// <summary>When the task became active.</summary>
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];
}
