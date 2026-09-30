using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Cases;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Tasks;

public sealed class TaskService(
    ICivicFlowDbContext db,
    ICurrentUser currentUser,
    WorkflowEngine engine,
    CaseService cases,
    TimeProvider timeProvider,
    IValidator<PageQuery> pageValidator,
    IValidator<TaskQueueQuery> queueValidator,
    IValidator<CompleteTaskRequest> completeValidator)
{
    /// <summary>The caller's active tasks, soonest due first.</summary>
    public async Task<PagedResult<TaskListItemDto>> GetMineAsync(PageQuery query, CancellationToken cancellationToken = default)
    {
        await pageValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();

        var tasks = db.WorkflowTasks.Where(t => t.Status == WorkflowTaskStatus.Active && t.AssigneeId == actor.UserId);

        return await ToPagedListAsync(tasks, query, cancellationToken);
    }

    /// <summary>Unassigned active tasks waiting in a department's queue, soonest due first.</summary>
    public async Task<PagedResult<TaskListItemDto>> GetQueueAsync(TaskQueueQuery query, CancellationToken cancellationToken = default)
    {
        await queueValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();

        var departmentId = query.DepartmentId;
        if (!actor.IsAdmin)
        {
            departmentId ??= actor.DepartmentId ?? throw new ForbiddenException("You aren't in a department, so you have no queue.");
            if (departmentId != actor.DepartmentId)
            {
                throw new ForbiddenException("You can only view your own department's queue.");
            }
        }

        var tasks = db.WorkflowTasks.Where(t =>
            t.Status == WorkflowTaskStatus.Active
            && t.AssigneeId == null
            && (t.Case.Status == CaseStatus.Open || t.Case.Status == CaseStatus.InProgress));
        if (departmentId is { } id)
        {
            tasks = tasks.Where(t => t.DepartmentId == id);
        }

        return await ToPagedListAsync(tasks, query, cancellationToken);
    }

    public async Task<CaseDetailDto> ClaimAsync(int taskId, CancellationToken cancellationToken = default)
    {
        var actor = currentUser.RequireActor();
        var (@case, task) = await LoadAsync(taskId, cancellationToken);
        if (!WorkflowPermissions.CanClaim(actor, task))
        {
            throw new ForbiddenException("You can only claim tasks from your own department's queue.");
        }

        engine.Claim(@case, task, actor.UserId);
        return await SaveAsync(@case, cancellationToken);
    }

    public async Task<CaseDetailDto> AssignAsync(int taskId, AssignTaskRequest request, CancellationToken cancellationToken = default)
    {
        var actor = currentUser.RequireActor();
        var (@case, task) = await LoadAsync(taskId, cancellationToken);
        if (!WorkflowPermissions.CanAssign(actor, task))
        {
            throw new ForbiddenException("Only a supervisor of the task's department, or an admin, can assign it.");
        }

        if (request.AssigneeId is { } assigneeId)
        {
            var eligible = await db.Users.AnyAsync(
                u => u.Id == assigneeId && u.IsActive && u.DepartmentId == task.DepartmentId, cancellationToken);
            if (!eligible)
            {
                throw Validation.Fail(nameof(request.AssigneeId), "Choose an active user in the task's department.");
            }
        }

        engine.Assign(@case, task, request.AssigneeId);
        return await SaveAsync(@case, cancellationToken);
    }

    public async Task<CaseDetailDto> CompleteAsync(int taskId, CompleteTaskRequest request, CancellationToken cancellationToken = default)
    {
        await completeValidator.ValidateAndThrowAsync(request, cancellationToken);
        var actor = currentUser.RequireActor();
        var (@case, task) = await LoadAsync(taskId, cancellationToken);
        if (!WorkflowPermissions.CanComplete(actor, task))
        {
            throw new ForbiddenException("Only the task's assignee, a supervisor of its department, or an admin can complete it.");
        }

        engine.Complete(@case, task, request.Outcome, Validation.Clean(request.Notes), actor.UserId);
        return await SaveAsync(@case, cancellationToken);
    }

    private async Task<(Case Case, WorkflowTask Task)> LoadAsync(int taskId, CancellationToken cancellationToken)
    {
        var caseId = await db.WorkflowTasks
            .Where(t => t.Id == taskId)
            .Select(t => (int?)t.CaseId)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Task", taskId);

        var @case = await db.LoadCaseForWorkflowAsync(caseId, cancellationToken);
        return (@case, @case.Tasks.Single(t => t.Id == taskId));
    }

    /// <summary>
    /// Saves the transition and returns the updated case. Two people acting on the same task at once
    /// is caught by the task's row version and becomes a 409.
    /// </summary>
    private async Task<CaseDetailDto> SaveAsync(Case @case, CancellationToken cancellationToken)
    {
        await db.SaveChangesAsync(cancellationToken);
        return await cases.GetAsync(@case.Id, cancellationToken);
    }

    private Task<PagedResult<TaskListItemDto>> ToPagedListAsync(
        IQueryable<WorkflowTask> tasks, PageQuery page, CancellationToken cancellationToken)
    {
        var today = timeProvider.GetToday();

        return tasks
            .AsNoTracking()
            // Undated tasks last; then the most urgent cases first.
            .OrderBy(t => t.DueDate == null)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Case.Priority == CasePriority.Urgent ? 3 : t.Case.Priority == CasePriority.High ? 2 : t.Case.Priority == CasePriority.Normal ? 1 : 0)
            .ThenBy(t => t.Id)
            .Select(t => new TaskListItemDto(
                t.Id,
                t.Name,
                t.Sequence,
                t.Status,
                t.DepartmentId,
                t.Department.Name,
                t.AssigneeId,
                t.Assignee == null ? null : t.Assignee.FullName,
                t.DueDate,
                t.StartedAt,
                t.DueDate < today,
                t.CaseId,
                t.Case.CaseNumber,
                t.Case.Title,
                t.Case.CaseType.Name,
                t.Case.Priority,
                t.Case.Status))
            .ToPagedResultAsync(page, cancellationToken);
    }
}
