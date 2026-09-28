using System.Globalization;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Audit;

/// <summary>
/// The <see cref="AuditLog.Action"/> vocabulary. Inserts and deletes are Created and Deleted; updates
/// to cases and tasks are named after the workflow transition their changes show, so the log reads
/// "Claimed" or "Returned" rather than "Modified". Other updates are Updated.
/// </summary>
public static class AuditActions
{
    public const string Created = "Created";
    public const string Updated = "Updated";
    public const string Deleted = "Deleted";

    // Cases
    public const string PutOnHold = "PutOnHold";
    public const string Resumed = "Resumed";
    public const string Reopened = "Reopened";
    public const string Cancelled = "Cancelled";
    public const string Closed = "Closed";

    // Workflow tasks
    public const string Activated = "Activated";
    public const string Claimed = "Claimed";
    public const string Assigned = "Assigned";
    public const string Unassigned = "Unassigned";
    public const string Completed = "Completed";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string Returned = "Returned";
    public const string InfoRequested = "InfoRequested";
    public const string Skipped = "Skipped";

    /// <summary>Names a change from the entity's type, what happened to it and its changed properties.</summary>
    /// <param name="actorUserId">Who made the change; taking an unassigned task yourself is a claim.</param>
    public static string Resolve(
        string entityType, EntityState state, IReadOnlyDictionary<string, AuditChange> changes, int? actorUserId) =>
        state switch
        {
            EntityState.Added => Created,
            EntityState.Deleted => Deleted,
            _ => entityType switch
            {
                nameof(Case) => ForCase(changes),
                nameof(WorkflowTask) => ForTask(changes, actorUserId),
                _ => Updated,
            },
        };

    private static string ForCase(IReadOnlyDictionary<string, AuditChange> changes)
    {
        if (!changes.TryGetValue(nameof(Case.Status), out var status))
        {
            return Updated;
        }

        return status.New switch
        {
            nameof(CaseStatus.OnHold) => PutOnHold,
            nameof(CaseStatus.Cancelled) => Cancelled,
            nameof(CaseStatus.Closed) => Closed,
            _ => status.Old switch
            {
                nameof(CaseStatus.OnHold) => Resumed,
                nameof(CaseStatus.Closed) or nameof(CaseStatus.Cancelled) => Reopened,
                // Open ↔ InProgress follows from task work, which has entries of its own.
                _ => Updated,
            },
        };
    }

    private static string ForTask(IReadOnlyDictionary<string, AuditChange> changes, int? actorUserId)
    {
        if (changes.TryGetValue(nameof(WorkflowTask.Status), out var status))
        {
            return status.New switch
            {
                nameof(WorkflowTaskStatus.Active) => Activated,
                nameof(WorkflowTaskStatus.Skipped) => Skipped,
                nameof(WorkflowTaskStatus.Completed) => changes.GetValueOrDefault(nameof(WorkflowTask.Outcome))?.New switch
                {
                    nameof(TaskOutcome.Approve) => Approved,
                    nameof(TaskOutcome.Reject) => Rejected,
                    nameof(TaskOutcome.Return) => Returned,
                    _ => Completed,
                },
                _ => Updated,
            };
        }

        // Notes change without a status change only when Request Info leaves the task active.
        if (changes.ContainsKey(nameof(WorkflowTask.Notes)))
        {
            return InfoRequested;
        }

        if (changes.TryGetValue(nameof(WorkflowTask.AssigneeId), out var assignee))
        {
            if (assignee.New is null)
            {
                return Unassigned;
            }

            var byThemselves = actorUserId?.ToString(CultureInfo.InvariantCulture) == assignee.New;
            return assignee.Old is null && byThemselves ? Claimed : Assigned;
        }

        return Updated;
    }
}
