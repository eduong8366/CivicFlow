using CivicFlow.Domain.Common;

namespace CivicFlow.Domain.Entities;

public class CaseType : Entity
{
    public string Name { get; set; } = string.Empty;

    /// <summary>Case number prefix, e.g. <c>BLD</c> in <c>BLD-2026-000042</c>.</summary>
    public string Prefix { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<CaseTypeField> Fields { get; set; } = [];
    public ICollection<WorkflowStepTemplate> Steps { get; set; } = [];
}
