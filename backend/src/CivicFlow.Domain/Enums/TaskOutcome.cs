namespace CivicFlow.Domain.Enums;

/// <summary>
/// The result of completing a workflow task. It is a flags enum so a step template
/// can list the outcomes it allows; a completed task records exactly one.
/// </summary>
[Flags]
public enum TaskOutcome
{
    None = 0,
    Complete = 1,
    Approve = 2,
    Reject = 4,
    Return = 8,
    RequestInfo = 16,
}
