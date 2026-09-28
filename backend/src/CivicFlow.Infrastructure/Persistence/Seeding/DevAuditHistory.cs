using System.Globalization;
using CivicFlow.Application.Audit;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Infrastructure.Persistence.Seeding;

/// <summary>
/// A backdated audit trail for a seeded case, as if its history had happened through the app, so
/// case timelines and the audit log have data. The seed saves with the automatic audit trail
/// switched off (it would stamp everything "now"), and writes these rows instead. It covers the
/// milestones: creation, each step's activation, claim and outcome, comments, and how the case ended.
/// </summary>
internal static class DevAuditHistory
{
    public static List<AuditLog> For(Case @case, IReadOnlyList<User> users, DateTimeOffset now)
    {
        var history = new List<AuditLog>();

        void Add(object entity, int entityId, string action, int? userId, DateTimeOffset at, params (string Name, object? Old, object? New)[] changes) =>
            history.Add(new AuditLog
            {
                EntityType = entity.GetType().Name,
                EntityId = entityId.ToString(CultureInfo.InvariantCulture),
                Action = action,
                CaseId = @case.Id,
                UserId = userId,
                Timestamp = at,
                Changes = AuditChanges.Serialize(changes.ToDictionary(
                    c => c.Name, c => new AuditChange(AuditChanges.Format(c.Old), AuditChanges.Format(c.New)))),
            });

        int SupervisorOf(int departmentId) =>
            users.First(u => u.Role == UserRole.Supervisor && u.DepartmentId == departmentId).Id;

        Add(@case, @case.Id, AuditActions.Created, @case.CreatedById, @case.CreatedAt,
            (nameof(Case.CaseNumber), null, @case.CaseNumber),
            (nameof(Case.Title), null, @case.Title),
            (nameof(Case.Priority), null, @case.Priority),
            (nameof(Case.Status), null, CaseStatus.Open),
            (nameof(Case.RequesterName), null, @case.RequesterName),
            (nameof(Case.DueDate), null, @case.DueDate));

        // Whoever finished the previous step set the next one going; the creator started the first.
        int? previousWorker = @case.CreatedById;
        foreach (var task in @case.Tasks.Where(t => t.StartedAt is not null).OrderBy(t => t.Sequence))
        {
            var startedAt = task.StartedAt!.Value;
            Add(task, task.Id, AuditActions.Activated, previousWorker, startedAt,
                (nameof(WorkflowTask.Status), WorkflowTaskStatus.Pending, WorkflowTaskStatus.Active),
                (nameof(WorkflowTask.DueDate), null, task.DueDate));

            if (task.AssigneeId is not { } assigneeId)
            {
                continue;
            }

            var endedAt = task.CompletedAt ?? @case.ClosedAt ?? now;
            Add(task, task.Id, AuditActions.Claimed, assigneeId, startedAt + (endedAt - startedAt) * 0.15,
                (nameof(WorkflowTask.AssigneeId), null, assigneeId));

            if (task.Status == WorkflowTaskStatus.Completed)
            {
                var action = task.Outcome switch
                {
                    TaskOutcome.Approve => AuditActions.Approved,
                    TaskOutcome.Reject => AuditActions.Rejected,
                    _ => AuditActions.Completed,
                };
                Add(task, task.Id, action, assigneeId, task.CompletedAt!.Value,
                    (nameof(WorkflowTask.Status), WorkflowTaskStatus.Active, WorkflowTaskStatus.Completed),
                    (nameof(WorkflowTask.Outcome), null, task.Outcome),
                    (nameof(WorkflowTask.Notes), null, task.Notes));
                previousWorker = assigneeId;
            }
        }

        foreach (var comment in @case.Comments)
        {
            Add(comment, comment.Id, AuditActions.Created, comment.AuthorId, comment.CreatedAt,
                (nameof(Comment.Body), null, comment.Body),
                (nameof(Comment.IsInternal), null, comment.IsInternal));
        }

        var current = @case.Tasks.Where(t => t.StartedAt is not null).MaxBy(t => t.Sequence);
        switch (@case.Status)
        {
            case CaseStatus.Closed:
                Add(@case, @case.Id, AuditActions.Closed, previousWorker, @case.ClosedAt!.Value,
                    (nameof(Case.Status), CaseStatus.InProgress, CaseStatus.Closed),
                    (nameof(Case.Resolution), null, @case.Resolution));
                break;

            case CaseStatus.Cancelled:
                Add(@case, @case.Id, AuditActions.Cancelled, SupervisorOf(current!.DepartmentId), @case.ClosedAt!.Value,
                    (nameof(Case.Status), CaseStatus.InProgress, CaseStatus.Cancelled));
                break;

            case CaseStatus.OnHold:
                var heldAt = current!.StartedAt!.Value + (now - current.StartedAt.Value) / 2;
                Add(@case, @case.Id, AuditActions.PutOnHold, SupervisorOf(current.DepartmentId), heldAt,
                    (nameof(Case.Status), CaseStatus.InProgress, CaseStatus.OnHold));
                break;
        }

        return history;
    }
}
