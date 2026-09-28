using CivicFlow.Domain.Common;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Domain.Entities;

/// <summary>One step in a case type's workflow; each new case gets a task per step.</summary>
public class WorkflowStepTemplate : Entity
{
    public int CaseTypeId { get; set; }
    public CaseType CaseType { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }

    /// <summary>The department whose queue receives the step's task.</summary>
    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    public int SlaDays { get; set; }
    public TaskOutcome AllowedOutcomes { get; set; } = TaskOutcome.Complete;
}
