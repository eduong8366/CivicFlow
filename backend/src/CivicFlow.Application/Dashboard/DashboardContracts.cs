using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Dashboard;

/// <summary>Whose work a dashboard covers: follows the permission matrix's Dashboards row.</summary>
public enum DashboardScope
{
    /// <summary>Staff: cases they created or have worked a task on.</summary>
    Personal,

    /// <summary>Supervisors, or admins who pick a department: cases with any task routed to the department.</summary>
    Department,

    /// <summary>Admins: every case.</summary>
    Agency,
}

public sealed class DashboardQuery
{
    /// <summary>
    /// Admins may narrow the agency dashboard to one department. Supervisors always see their own
    /// department (passing another is 403); staff can't pass one.
    /// </summary>
    public int? DepartmentId { get; set; }
}

/// <summary>
/// The dashboard's tiles and charts. Dates are UTC days, like due dates. <see cref="Workload"/> is
/// null on a personal dashboard.
/// </summary>
public sealed record DashboardSummaryDto(
    DashboardScope Scope,
    int? DepartmentId,
    string? DepartmentName,
    DateOnly AsOf,
    DashboardKpisDto Kpis,
    IReadOnlyList<StatusCountDto> CasesByStatus,
    IReadOnlyList<WorkloadDto>? Workload,
    IReadOnlyList<CycleTimeDto> CycleTimes,
    IReadOnlyList<WeeklyVolumeDto> WeeklyVolume);

/// <param name="OpenCases">Open, in progress or on hold.</param>
/// <param name="OverdueCases">Open cases past their due date.</param>
/// <param name="DueThisWeek">Open cases due today or in the next six days.</param>
/// <param name="ClosedThisMonth">Closed (completed or rejected) since the first of this month; cancellations aren't counted.</param>
/// <param name="QueuedTasks">
/// Unclaimed tasks waiting in the queue: the department's, the caller's own on a personal
/// dashboard, or every queue on the agency one.
/// </param>
public sealed record DashboardKpisDto(int OpenCases, int OverdueCases, int DueThisWeek, int ClosedThisMonth, int QueuedTasks);

/// <summary>One bar per case status, zeros included, in the status's natural order.</summary>
public sealed record StatusCountDto(CaseStatus Status, int Count);

/// <summary>A person's active tasks (overdue ones too), busiest first.</summary>
public sealed record WorkloadDto(int UserId, string FullName, UserRole Role, string? DepartmentName, int ActiveTasks, int OverdueTasks);

/// <summary>Days from opening to closing, for cases closed in the last <see cref="DashboardService.CycleTimeWindowDays"/> days.</summary>
public sealed record CycleTimeDto(int CaseTypeId, string CaseTypeName, int ClosedCount, double AverageDays, double MedianDays);

/// <summary>Cases opened and closed per week (weeks start on Monday), oldest first.</summary>
public sealed record WeeklyVolumeDto(DateOnly WeekStart, int Opened, int Closed);
