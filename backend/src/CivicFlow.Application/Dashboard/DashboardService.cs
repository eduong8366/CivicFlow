using System.Linq.Expressions;
using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Dashboard;

/// <summary>
/// Dashboard figures, scoped by role: personal for staff, the department for supervisors, and the
/// whole agency (or one department) for admins. Counts run in the database; cycle times and weekly
/// volumes are small date lists bucketed here, which keeps the queries provider-neutral.
/// </summary>
public sealed class DashboardService(ICivicFlowDbContext db, ICurrentUser currentUser, TimeProvider timeProvider)
{
    public const int CycleTimeWindowDays = 90;
    public const int VolumeWeeks = 12;

    public async Task<DashboardSummaryDto> GetSummaryAsync(DashboardQuery query, CancellationToken cancellationToken = default)
    {
        var actor = currentUser.RequireActor();
        var (scope, departmentId) = ResolveScope(actor, query.DepartmentId);

        string? departmentName = null;
        if (departmentId is { } id)
        {
            departmentName = await db.Departments.Where(d => d.Id == id).Select(d => d.Name).SingleOrDefaultAsync(cancellationToken)
                ?? throw new NotFoundException("Department", id);
        }

        var now = timeProvider.GetUtcNow();
        var today = timeProvider.GetToday();
        var cases = db.Cases.AsNoTracking().Where(CasesInScope(scope, actor.UserId, departmentId));

        var statusCounts = await cases
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Status, g => g.Count, cancellationToken);

        var open = cases.Where(c => c.Status == CaseStatus.Open || c.Status == CaseStatus.InProgress || c.Status == CaseStatus.OnHold);
        var weekAhead = today.AddDays(7);
        var monthStart = AgencyTime.StartOfDay(new DateOnly(today.Year, today.Month, 1));

        var kpis = new DashboardKpisDto(
            OpenCases: await open.CountAsync(cancellationToken),
            OverdueCases: await open.CountAsync(c => c.DueDate < today, cancellationToken),
            DueThisWeek: await open.CountAsync(c => c.DueDate >= today && c.DueDate < weekAhead, cancellationToken),
            ClosedThisMonth: await cases.CountAsync(c => c.Status == CaseStatus.Closed && c.ClosedAt >= monthStart, cancellationToken),
            QueuedTasks: await CountQueuedAsync(scope == DashboardScope.Personal ? actor.DepartmentId : departmentId, scope, cancellationToken));

        return new DashboardSummaryDto(
            scope,
            departmentId,
            departmentName,
            today,
            kpis,
            Enum.GetValues<CaseStatus>().Select(s => new StatusCountDto(s, statusCounts.GetValueOrDefault(s))).ToList(),
            scope == DashboardScope.Personal ? null : await GetWorkloadAsync(departmentId, today, cancellationToken),
            await GetCycleTimesAsync(cases, now, cancellationToken),
            await GetWeeklyVolumeAsync(cases, today, cancellationToken));
    }

    /// <summary>Monday of the week <paramref name="date"/> falls in.</summary>
    public static DateOnly StartOfWeek(DateOnly date) => date.AddDays(-(((int)date.DayOfWeek + 6) % 7));

    public static double Median(IReadOnlyList<double> values)
    {
        if (values.Count == 0)
        {
            throw new ArgumentException("There is no median of no values.", nameof(values));
        }

        var sorted = values.Order().ToList();
        var middle = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    private static (DashboardScope Scope, int? DepartmentId) ResolveScope(Actor actor, int? requestedDepartmentId)
    {
        switch (actor.Role)
        {
            case UserRole.Admin:
                return requestedDepartmentId is null ? (DashboardScope.Agency, null) : (DashboardScope.Department, requestedDepartmentId);

            case UserRole.Supervisor:
                if (requestedDepartmentId is not null && requestedDepartmentId != actor.DepartmentId)
                {
                    throw new ForbiddenException("Supervisors can only view their own department's dashboard.");
                }

                return actor.DepartmentId is { } own
                    ? (DashboardScope.Department, own)
                    : throw new ForbiddenException("You aren't in a department, so you have no department dashboard.");

            default:
                return requestedDepartmentId is null
                    ? (DashboardScope.Personal, null)
                    : throw new ForbiddenException("Staff have a personal dashboard only.");
        }
    }

    private static Expression<Func<Case, bool>> CasesInScope(DashboardScope scope, int userId, int? departmentId) => scope switch
    {
        DashboardScope.Agency => c => true,
        DashboardScope.Department => c => c.Tasks.Any(t => t.DepartmentId == departmentId),
        _ => c => c.CreatedById == userId || c.Tasks.Any(t => t.AssigneeId == userId),
    };

    /// <summary>Unclaimed active tasks that can be claimed now, i.e. on open or in-progress cases (as the queue shows them).</summary>
    private Task<int> CountQueuedAsync(int? departmentId, DashboardScope scope, CancellationToken cancellationToken)
    {
        if (scope != DashboardScope.Agency && departmentId is null)
        {
            return Task.FromResult(0);
        }

        var tasks = db.WorkflowTasks.Where(t =>
            t.Status == WorkflowTaskStatus.Active
            && t.AssigneeId == null
            && (t.Case.Status == CaseStatus.Open || t.Case.Status == CaseStatus.InProgress));

        return (departmentId is { } id ? tasks.Where(t => t.DepartmentId == id) : tasks).CountAsync(cancellationToken);
    }

    /// <summary>
    /// Active users of the department with their active tasks. Agency-wide, every staff member and
    /// supervisor, plus any admin who is holding tasks.
    /// </summary>
    private async Task<IReadOnlyList<WorkloadDto>> GetWorkloadAsync(int? departmentId, DateOnly today, CancellationToken cancellationToken)
    {
        var users = db.Users.AsNoTracking().Where(u => u.IsActive);
        users = departmentId is { } id
            ? users.Where(u => u.DepartmentId == id)
            : users.Where(u => u.Role != UserRole.Admin
                || db.WorkflowTasks.Any(t => t.AssigneeId == u.Id && t.Status == WorkflowTaskStatus.Active));

        var workload = await users
            .Select(u => new WorkloadDto(
                u.Id,
                u.FullName,
                u.Role,
                u.Department == null ? null : u.Department.Name,
                db.WorkflowTasks.Count(t => t.AssigneeId == u.Id && t.Status == WorkflowTaskStatus.Active),
                db.WorkflowTasks.Count(t => t.AssigneeId == u.Id && t.Status == WorkflowTaskStatus.Active && t.DueDate < today)))
            .ToListAsync(cancellationToken);

        return workload.OrderByDescending(w => w.ActiveTasks).ThenBy(w => w.FullName).ToList();
    }

    private static async Task<IReadOnlyList<CycleTimeDto>> GetCycleTimesAsync(
        IQueryable<Case> cases, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var since = now.AddDays(-CycleTimeWindowDays);
        var closed = await cases
            .Where(c => c.Status == CaseStatus.Closed && c.ClosedAt >= since)
            .Select(c => new { c.CaseTypeId, CaseTypeName = c.CaseType.Name, c.CreatedAt, c.ClosedAt })
            .ToListAsync(cancellationToken);

        return closed
            .GroupBy(c => (c.CaseTypeId, c.CaseTypeName))
            .Select(g =>
            {
                var days = g.Select(c => (c.ClosedAt!.Value - c.CreatedAt).TotalDays).ToList();
                return new CycleTimeDto(
                    g.Key.CaseTypeId, g.Key.CaseTypeName, days.Count, Math.Round(days.Average(), 1), Math.Round(Median(days), 1));
            })
            .OrderBy(c => c.CaseTypeName)
            .ToList();
    }

    private static async Task<IReadOnlyList<WeeklyVolumeDto>> GetWeeklyVolumeAsync(
        IQueryable<Case> cases, DateOnly today, CancellationToken cancellationToken)
    {
        var firstWeek = StartOfWeek(today).AddDays(-7 * (VolumeWeeks - 1));
        var from = AgencyTime.StartOfDay(firstWeek);

        var opened = await cases.Where(c => c.CreatedAt >= from).Select(c => c.CreatedAt).ToListAsync(cancellationToken);
        var closed = await cases
            .Where(c => c.Status == CaseStatus.Closed && c.ClosedAt >= from)
            .Select(c => c.ClosedAt!.Value)
            .ToListAsync(cancellationToken);

        var openedByWeek = opened.CountBy(WeekOf).ToDictionary();
        var closedByWeek = closed.CountBy(WeekOf).ToDictionary();

        return Enumerable.Range(0, VolumeWeeks)
            .Select(i => firstWeek.AddDays(7 * i))
            .Select(week => new WeeklyVolumeDto(week, openedByWeek.GetValueOrDefault(week), closedByWeek.GetValueOrDefault(week)))
            .ToList();

        static DateOnly WeekOf(DateTimeOffset instant) => StartOfWeek(AgencyTime.DateOf(instant));
    }
}
