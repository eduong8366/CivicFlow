using System.Linq.Expressions;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Workflow;

/// <summary>
/// The permission matrix's resource rules: which cases and tasks an actor may see and act on.
/// Role gates (e.g. Staff can't assign) are also enforced by the API's policies; these rules add
/// the department and assignee checks the policies can't see. A case "involves" a department
/// when any of its tasks, past or future, is routed there.
/// </summary>
public static class WorkflowPermissions
{
    /// <summary>
    /// Cases the actor may view, as a filter EF Core can translate. Admins see everything,
    /// supervisors see cases involving their department, and staff see those plus cases with a
    /// task assigned to them. Everyone sees the cases they created.
    /// </summary>
    public static Expression<Func<Case, bool>> CanView(Actor actor)
    {
        var userId = actor.UserId;
        var departmentId = actor.DepartmentId;

        return actor.Role switch
        {
            UserRole.Admin => c => true,
            UserRole.Supervisor => c => c.CreatedById == userId
                || c.Tasks.Any(t => t.DepartmentId == departmentId),
            _ => c => c.CreatedById == userId
                || c.Tasks.Any(t => t.DepartmentId == departmentId || t.AssigneeId == userId),
        };
    }

    /// <summary>Anyone may take work from their own department's queue; admins from any queue.</summary>
    public static bool CanClaim(Actor actor, WorkflowTask task) =>
        actor.IsAdmin || actor.DepartmentId == task.DepartmentId;

    /// <summary>Supervisors (re)assign within their own department; admins anywhere.</summary>
    public static bool CanAssign(Actor actor, WorkflowTask task) =>
        actor.IsAdmin || actor.IsSupervisorOf(task.DepartmentId);

    /// <summary>Only the assignee, a supervisor of the task's department or an admin completes a task.</summary>
    public static bool CanComplete(Actor actor, WorkflowTask task) =>
        task.AssigneeId == actor.UserId || actor.IsAdmin || actor.IsSupervisorOf(task.DepartmentId);

    /// <summary>Hold, cancel and reopen: supervisors of a department the case involves, and admins.</summary>
    public static bool CanManage(Actor actor, Case @case) =>
        actor.IsAdmin
        || (actor.Role == UserRole.Supervisor && @case.Tasks.Any(t => t.DepartmentId == actor.DepartmentId));

    /// <summary>
    /// Reopening follows <see cref="CanManage"/>, with one addition: the assignee of an on-hold case's
    /// active task may resume it, because Request Info puts a case on hold while its worker waits.
    /// </summary>
    public static bool CanReopen(Actor actor, Case @case) =>
        CanManage(actor, @case)
        || (@case.Status == CaseStatus.OnHold
            && @case.Tasks.Any(t => t.Status == WorkflowTaskStatus.Active && t.AssigneeId == actor.UserId));
}
