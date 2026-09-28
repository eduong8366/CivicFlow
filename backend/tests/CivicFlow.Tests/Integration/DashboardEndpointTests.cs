using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Dashboard;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using static CivicFlow.Tests.Integration.AdminApi;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

/// <summary>
/// The API tests share one collection, so they run one at a time and the database holds still
/// while a test compares the dashboard with it.
/// </summary>
[Collection(ApiCollection.Name)]
public class DashboardEndpointTests(CivicFlowApiFactory factory)
{
    private static readonly CaseStatus[] OpenStatuses = [CaseStatus.Open, CaseStatus.InProgress, CaseStatus.OnHold];

    [Fact]
    public async Task The_agency_dashboard_matches_the_database()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);

        var summary = await GetSummaryAsync(admin);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await using var db = factory.CreateDbContext();
        Assert.Equal(DashboardScope.Agency, summary.Scope);
        Assert.Null(summary.DepartmentId);
        Assert.Equal(await db.Cases.CountAsync(), summary.CasesByStatus.Sum(s => s.Count));
        Assert.Equal(Enum.GetValues<CaseStatus>(), summary.CasesByStatus.Select(s => s.Status));
        Assert.Equal(await db.Cases.CountAsync(c => OpenStatuses.Contains(c.Status)), summary.Kpis.OpenCases);
        Assert.Equal(await db.Cases.CountAsync(c => OpenStatuses.Contains(c.Status) && c.DueDate < today), summary.Kpis.OverdueCases);
        Assert.Equal(
            await db.WorkflowTasks.CountAsync(t => t.Status == WorkflowTaskStatus.Active && t.AssigneeId == null
                && (t.Case.Status == CaseStatus.Open || t.Case.Status == CaseStatus.InProgress)),
            summary.Kpis.QueuedTasks);

        var since = DateTimeOffset.UtcNow.AddDays(-DashboardService.CycleTimeWindowDays);
        Assert.Equal(
            await db.Cases.CountAsync(c => c.Status == CaseStatus.Closed && c.ClosedAt >= since),
            summary.CycleTimes.Sum(c => c.ClosedCount));
        Assert.All(summary.CycleTimes, c => Assert.True(c.AverageDays > 0 && c.MedianDays > 0));

        Assert.Equal(DashboardService.VolumeWeeks, summary.WeeklyVolume.Count);
        Assert.Equal(DashboardService.StartOfWeek(today), summary.WeeklyVolume[^1].WeekStart);
        Assert.True(summary.WeeklyVolume.Sum(w => w.Opened) > 0, "The seed opens cases over the last 60 days.");

        Assert.NotNull(summary.Workload);
        Assert.Contains(summary.Workload, w => w.FullName == "Luis Ortega");
        Assert.DoesNotContain(summary.Workload, w => w.Role == UserRole.Admin && w.ActiveTasks == 0);
    }

    [Fact]
    public async Task Supervisors_see_their_department()
    {
        var supervisor = await factory.CreateClientAsAsync("ce.supervisor@civicflow.test");
        var ce = await DepartmentIdAsync(factory, "CE");

        var summary = await GetSummaryAsync(supervisor);

        await using var db = factory.CreateDbContext();
        Assert.Equal(DashboardScope.Department, summary.Scope);
        Assert.Equal(ce, summary.DepartmentId);
        Assert.Equal("Code Enforcement", summary.DepartmentName);
        Assert.Equal(await db.Cases.CountAsync(c => c.Tasks.Any(t => t.DepartmentId == ce)), summary.CasesByStatus.Sum(s => s.Count));
        Assert.NotNull(summary.Workload);
        Assert.All(summary.Workload, w => Assert.Equal("Code Enforcement", w.DepartmentName));
        Assert.Contains(summary.Workload, w => w.FullName == "Marcus Bell");
    }

    [Fact]
    public async Task Assigning_work_shows_in_the_workload()
    {
        var supervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var assigneeId = await UserIdAsync(factory, "pz.staff2@civicflow.test");
        var before = Workload(await GetSummaryAsync(supervisor), assigneeId);
        var @case = await CreateBuildingPermitAsync(supervisor);

        await ReadCaseAsync(await AssignAsync(supervisor, ActiveTask(@case).Id, assigneeId));

        var after = await GetSummaryAsync(supervisor);
        Assert.Equal(before.ActiveTasks + 1, Workload(after, assigneeId).ActiveTasks);
    }

    [Fact]
    public async Task Staff_see_a_personal_dashboard_that_counts_their_cases()
    {
        var staff = await factory.CreateClientAsAsync("clk.staff1@civicflow.test");
        var before = await GetSummaryAsync(staff);

        var @case = await CreateBuildingPermitAsync(staff);
        var after = await GetSummaryAsync(staff);

        Assert.Equal(DashboardScope.Personal, after.Scope);
        Assert.Null(after.Workload);
        Assert.Equal(before.Kpis.OpenCases + 1, after.Kpis.OpenCases);
        Assert.Equal(before.WeeklyVolume[^1].Opened + 1, after.WeeklyVolume[^1].Opened);
        Assert.Equal(CaseStatus.Open, @case.Status);
    }

    [Fact]
    public async Task Admins_can_narrow_to_one_department()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var pw = await DepartmentIdAsync(factory, "PW");

        var summary = await GetSummaryAsync(admin, pw);
        var unknown = await admin.GetAsync("/api/dashboard/summary?departmentId=999999");

        Assert.Equal(DashboardScope.Department, summary.Scope);
        Assert.Equal("Public Works", summary.DepartmentName);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Theory]
    [InlineData("pz.staff1@civicflow.test", "PZ")]
    [InlineData("pz.supervisor@civicflow.test", "CE")]
    public async Task Other_scopes_are_403(string email, string departmentCode)
    {
        var client = await factory.CreateClientAsAsync(email);
        var departmentId = await DepartmentIdAsync(factory, departmentCode);

        var response = await client.GetAsync($"/api/dashboard/summary?departmentId={departmentId}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static async Task<DashboardSummaryDto> GetSummaryAsync(HttpClient client, int? departmentId = null) =>
        (await client.GetFromJsonAsync<DashboardSummaryDto>(
            departmentId is null ? "/api/dashboard/summary" : $"/api/dashboard/summary?departmentId={departmentId}",
            TestJson.Options))!;

    private static WorkloadDto Workload(DashboardSummaryDto summary, int userId) =>
        summary.Workload!.Single(w => w.UserId == userId);
}
