using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Cases;

public sealed class CaseService(
    ICivicFlowDbContext db,
    ICurrentUser currentUser,
    WorkflowEngine engine,
    ICaseNumberGenerator caseNumbers,
    TimeProvider timeProvider,
    IValidator<CreateCaseRequest> createValidator,
    IValidator<CaseSearchQuery> searchValidator,
    IValidator<ChangeCaseStatusRequest> statusChangeValidator)
{
    public async Task<PagedResult<CaseListItemDto>> SearchAsync(CaseSearchQuery query, CancellationToken cancellationToken = default)
    {
        await searchValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();
        var today = timeProvider.GetUtcToday();

        var cases = db.Cases.AsNoTracking().Where(WorkflowPermissions.CanView(actor));

        if (query.CaseTypeId is { } caseTypeId)
        {
            cases = cases.Where(c => c.CaseTypeId == caseTypeId);
        }

        if (query.Status is { } status)
        {
            cases = cases.Where(c => c.Status == status);
        }

        if (query.Priority is { } priority)
        {
            cases = cases.Where(c => c.Priority == priority);
        }

        if (query.DepartmentId is { } departmentId)
        {
            cases = cases.Where(c => c.Tasks.Any(t => t.DepartmentId == departmentId));
        }

        if (query.AssigneeId is { } assigneeId)
        {
            cases = cases.Where(c => c.Tasks.Any(t => t.Status == WorkflowTaskStatus.Active && t.AssigneeId == assigneeId));
        }

        if (query.CreatedFrom is { } from)
        {
            var start = StartOfDay(from);
            cases = cases.Where(c => c.CreatedAt >= start);
        }

        if (query.CreatedTo is { } to)
        {
            var end = StartOfDay(to.AddDays(1));
            cases = cases.Where(c => c.CreatedAt < end);
        }

        if (query.Overdue is { } overdue)
        {
            cases = overdue
                ? cases.Where(c => c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled && c.DueDate < today)
                : cases.Where(c => !(c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled && c.DueDate < today));
        }

        if (Validation.Clean(query.Search) is { } search)
        {
            cases = cases.Where(c => c.CaseNumber.Contains(search) || c.Title.Contains(search) || c.RequesterName.Contains(search));
        }

        var rows = Sort(cases, query.Sort, query.Descending)
            .Select(c => new
            {
                c.Id,
                c.CaseNumber,
                c.Title,
                c.CaseTypeId,
                CaseTypeName = c.CaseType.Name,
                c.Status,
                c.Resolution,
                c.Priority,
                c.RequesterName,
                c.CreatedAt,
                c.DueDate,
                c.ClosedAt,
                Current = c.Tasks
                    .Where(t => t.Status == WorkflowTaskStatus.Active)
                    .OrderBy(t => t.Id)
                    .Select(t => new
                    {
                        t.Name,
                        DepartmentName = t.Department.Name,
                        AssigneeName = t.Assignee == null ? null : t.Assignee.FullName,
                        t.DueDate,
                    })
                    .FirstOrDefault(),
            });

        var page = await rows.ToPagedResultAsync(query, cancellationToken);

        return new PagedResult<CaseListItemDto>(
            page.Items
                .Select(c => new CaseListItemDto(
                    c.Id, c.CaseNumber, c.Title, c.CaseTypeId, c.CaseTypeName, c.Status, c.Resolution, c.Priority,
                    c.RequesterName, c.CreatedAt, c.DueDate, c.ClosedAt,
                    IsOverdue(c.Status, c.DueDate, today),
                    c.Current?.Name, c.Current?.DepartmentName, c.Current?.AssigneeName, c.Current?.DueDate))
                .ToList(),
            page.Page, page.PageSize, page.TotalCount);
    }

    public async Task<CaseDetailDto> GetAsync(int id, CancellationToken cancellationToken = default)
    {
        var actor = currentUser.RequireActor();
        await db.EnsureCanViewCaseAsync(id, actor, cancellationToken);

        var @case = await db.Cases
            .AsNoTracking()
            .Include(c => c.CaseType).ThenInclude(t => t.Fields)
            .Include(c => c.FieldValues)
            .Include(c => c.CreatedBy)
            .Include(c => c.Tasks).ThenInclude(t => t.StepTemplate)
            .Include(c => c.Tasks).ThenInclude(t => t.Department)
            .Include(c => c.Tasks).ThenInclude(t => t.Assignee)
            .SingleAsync(c => c.Id == id, cancellationToken);

        return ToDetail(@case, actor, timeProvider.GetUtcToday());
    }

    public async Task<CaseDetailDto> CreateAsync(CreateCaseRequest request, CancellationToken cancellationToken = default)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);
        var actor = currentUser.RequireActor();

        var caseType = await db.CaseTypes
            .Include(t => t.Fields)
            .Include(t => t.Steps)
            .SingleOrDefaultAsync(t => t.Id == request.CaseTypeId && t.IsActive, cancellationToken)
            ?? throw Validation.Fail(nameof(request.CaseTypeId), "Choose an active case type.");

        var fieldValues = CaseFieldValues.Validate(caseType.Fields, request.Fields);

        var @case = new Case
        {
            CaseTypeId = caseType.Id,
            Title = request.Title.Trim(),
            Description = Validation.Clean(request.Description),
            Priority = request.Priority,
            RequesterName = request.RequesterName.Trim(),
            RequesterEmail = Validation.Clean(request.RequesterEmail),
            RequesterPhone = Validation.Clean(request.RequesterPhone),
            RequesterAddress = Validation.Clean(request.RequesterAddress),
            CreatedById = actor.UserId,
            FieldValues = fieldValues.Select(v => new CaseFieldValue { FieldId = v.Field.Id, Value = v.Value }).ToList(),
        };
        engine.Start(@case, caseType.Steps);
        @case.CaseNumber = await caseNumbers.NextAsync(caseType.Prefix, @case.CreatedAt.Year, cancellationToken);

        db.Cases.Add(@case);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(@case.Id, cancellationToken);
    }

    public Task<CaseDetailDto> HoldAsync(int id, ChangeCaseStatusRequest? request = null, CancellationToken cancellationToken = default) =>
        ManageAsync(id, request, "Put on hold", WorkflowPermissions.CanManage, engine.Hold, cancellationToken);

    public Task<CaseDetailDto> CancelAsync(int id, ChangeCaseStatusRequest? request = null, CancellationToken cancellationToken = default) =>
        ManageAsync(id, request, "Cancelled", WorkflowPermissions.CanManage, engine.Cancel, cancellationToken);

    public Task<CaseDetailDto> ReopenAsync(int id, ChangeCaseStatusRequest? request = null, CancellationToken cancellationToken = default) =>
        ManageAsync(id, request, "Reopened", WorkflowPermissions.CanReopen, engine.Reopen, cancellationToken);

    /// <summary>Applies a status change. A reason, if given, is saved with it as an internal comment.</summary>
    private async Task<CaseDetailDto> ManageAsync(
        int id,
        ChangeCaseStatusRequest? request,
        string reasonLabel,
        Func<Actor, Case, bool> isAllowed,
        Action<Case> transition,
        CancellationToken cancellationToken)
    {
        request ??= new ChangeCaseStatusRequest(null);
        await statusChangeValidator.ValidateAndThrowAsync(request, cancellationToken);
        var actor = currentUser.RequireActor();
        var @case = await db.LoadCaseForWorkflowAsync(id, cancellationToken);
        if (!isAllowed(actor, @case))
        {
            throw new ForbiddenException("Only a supervisor of a department this case involves, or an admin, can change its status.");
        }

        transition(@case);
        if (Validation.Clean(request.Reason) is { } reason)
        {
            db.Comments.Add(new Comment
            {
                CaseId = id,
                AuthorId = actor.UserId,
                Body = $"{reasonLabel}: {reason}",
                IsInternal = true,
                CreatedAt = timeProvider.GetUtcNow(),
            });
        }

        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(id, cancellationToken);
    }

    private static IQueryable<Case> Sort(IQueryable<Case> cases, CaseSortField sort, bool descending)
    {
        var ordered = sort switch
        {
            CaseSortField.DueDate => descending ? cases.OrderByDescending(c => c.DueDate) : cases.OrderBy(c => c.DueDate),
            CaseSortField.CaseNumber => descending ? cases.OrderByDescending(c => c.CaseNumber) : cases.OrderBy(c => c.CaseNumber),
            // Priorities are stored by name, so sort by rank rather than alphabetically.
            CaseSortField.Priority => descending
                ? cases.OrderByDescending(c => c.Priority == CasePriority.Urgent ? 3 : c.Priority == CasePriority.High ? 2 : c.Priority == CasePriority.Normal ? 1 : 0)
                : cases.OrderBy(c => c.Priority == CasePriority.Urgent ? 3 : c.Priority == CasePriority.High ? 2 : c.Priority == CasePriority.Normal ? 1 : 0),
            _ => descending ? cases.OrderByDescending(c => c.CreatedAt) : cases.OrderBy(c => c.CreatedAt),
        };

        // A unique tiebreaker keeps paging stable.
        return descending ? ordered.ThenByDescending(c => c.Id) : ordered.ThenBy(c => c.Id);
    }

    private static DateTimeOffset StartOfDay(DateOnly date) => new(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

    private static bool IsOverdue(CaseStatus status, DateOnly? dueDate, DateOnly today) =>
        status is not (CaseStatus.Closed or CaseStatus.Cancelled) && dueDate < today;

    private static CaseDetailDto ToDetail(Case @case, Actor actor, DateOnly today)
    {
        var values = @case.FieldValues.ToDictionary(v => v.FieldId, v => v.Value);
        var canManage = WorkflowPermissions.CanManage(actor, @case);

        return new CaseDetailDto(
            @case.Id,
            @case.CaseNumber,
            @case.Title,
            @case.Description,
            new CaseTypeSummaryDto(@case.CaseType.Id, @case.CaseType.Name, @case.CaseType.Prefix),
            @case.Status,
            @case.Resolution,
            @case.Priority,
            new RequesterDto(@case.RequesterName, @case.RequesterEmail, @case.RequesterPhone, @case.RequesterAddress),
            new UserSummaryDto(@case.CreatedBy.Id, @case.CreatedBy.FullName),
            @case.CreatedAt,
            @case.DueDate,
            @case.ClosedAt,
            IsOverdue(@case.Status, @case.DueDate, today),
            @case.CaseType.Fields
                .OrderBy(f => f.SortOrder)
                .Select(f => new CaseFieldDto(f.Id, f.Key, f.Label, f.DataType, f.IsRequired, values.GetValueOrDefault(f.Id)))
                .ToList(),
            @case.Tasks
                .OrderBy(t => t.Sequence)
                .ThenBy(t => t.Id)
                .Select(t => ToDto(@case, t, actor, today))
                .ToList(),
            new CaseActionsDto(
                CanHold: canManage && WorkflowEngine.CanHold(@case),
                CanCancel: canManage && WorkflowEngine.CanCancel(@case),
                CanReopen: WorkflowEngine.CanReopen(@case) && WorkflowPermissions.CanReopen(actor, @case)));
    }

    private static WorkflowTaskDto ToDto(Case @case, WorkflowTask task, Actor actor, DateOnly today)
    {
        var isActive = task.Status == WorkflowTaskStatus.Active;

        return new WorkflowTaskDto(
            task.Id,
            task.Name,
            task.Sequence,
            task.DepartmentId,
            task.Department.Name,
            task.AssigneeId,
            task.Assignee?.FullName,
            task.Status,
            task.Outcome,
            TaskOutcomes.Split(task.StepTemplate.AllowedOutcomes),
            task.Notes,
            task.DueDate,
            task.StartedAt,
            task.CompletedAt,
            IsOverdue: isActive && task.DueDate < today,
            new TaskActionsDto(
                CanClaim: isActive && task.AssigneeId is null && WorkflowEngine.AcceptsWork(@case) && WorkflowPermissions.CanClaim(actor, task),
                CanAssign: isActive && WorkflowEngine.AcceptsAssignment(@case) && WorkflowPermissions.CanAssign(actor, task),
                CanComplete: isActive && WorkflowEngine.AcceptsWork(@case) && WorkflowPermissions.CanComplete(actor, task)));
    }
}
