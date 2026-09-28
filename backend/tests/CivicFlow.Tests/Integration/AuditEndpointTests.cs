using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Audit;
using CivicFlow.Application.Comments;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using CivicFlow.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AuditEndpointTests(CivicFlowApiFactory factory)
{
    private static async Task<List<AuditEntryDto>> CaseHistoryAsync(HttpClient client, int caseId)
    {
        var page = await client.GetFromJsonAsync<PagedResult<AuditEntryDto>>($"/api/cases/{caseId}/audit?pageSize=100", TestJson.Options);
        return [.. page!.Items];
    }

    [Fact]
    public async Task Workflow_transitions_are_audited_with_who_what_and_the_values_that_changed()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(client);
        var intake = ActiveTask(@case);
        await ReadCaseAsync(await ClaimAsync(client, intake.Id));
        var advanced = await ReadCaseAsync(await CompleteAsync(client, intake.Id, TaskOutcome.Complete, "Application complete."));
        var planReview = ActiveTask(advanced);

        var history = await CaseHistoryAsync(client, @case.Id);

        Assert.All(history, e => Assert.Equal(@case.Id, e.CaseId));
        Assert.All(history, e => Assert.Equal(@case.CaseNumber, e.CaseNumber));
        Assert.All(history, e => Assert.Equal("Luis Ortega", e.UserName));
        Assert.Equal(history.OrderByDescending(e => e.Timestamp).ThenByDescending(e => e.Id), history);

        var created = history.Single(e => e is { EntityType: "Case", Action: "Created" });
        Assert.Equal(@case.Id.ToString(), created.EntityId);
        Assert.Equal(new AuditChange(null, @case.CaseNumber), created.Changes["CaseNumber"]);
        Assert.Equal(new AuditChange(null, "Open"), created.Changes["Status"]);
        Assert.DoesNotContain("RowVersion", created.Changes.Keys);

        Assert.Equal(4, history.Count(e => e is { EntityType: "WorkflowTask", Action: "Created" }));
        Assert.Equal(4, history.Count(e => e is { EntityType: "CaseFieldValue", Action: "Created" }));

        var intakeEntries = history.Where(e => e.EntityType == "WorkflowTask" && e.EntityId == intake.Id.ToString()).ToList();
        var claimed = intakeEntries.Single(e => e.Action == "Claimed");
        Assert.Equal(new AuditChange(null, (await UserIdAsync(factory, "pz.staff1@civicflow.test")).ToString()), claimed.Changes["AssigneeId"]);
        var completed = intakeEntries.Single(e => e.Action == "Completed");
        Assert.Equal(new AuditChange("Active", "Completed"), completed.Changes["Status"]);
        Assert.Equal(new AuditChange(null, "Complete"), completed.Changes["Outcome"]);
        Assert.Equal(new AuditChange(null, "Application complete."), completed.Changes["Notes"]);

        var activated = history.Single(e => e.EntityType == "WorkflowTask" && e.EntityId == planReview.Id.ToString() && e.Action == "Activated");
        Assert.Equal(new AuditChange("Pending", "Active"), activated.Changes["Status"]);
    }

    [Fact]
    public async Task Status_changes_comments_and_attachments_are_in_the_case_history()
    {
        var supervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var @case = await CreateBuildingPermitAsync(supervisor);
        await supervisor.PostAsJsonAsync($"/api/cases/{@case.Id}/comments", new CreateCommentRequest("Checked zoning."), TestJson.Options);
        var form = new MultipartFormDataContent { { new ByteArrayContent([1, 2, 3]), "file", "plan.pdf" } };
        (await supervisor.PostAsync($"/api/cases/{@case.Id}/attachments", form)).EnsureSuccessStatusCode();
        await ReadCaseAsync(await supervisor.PostAsJsonAsync($"/api/cases/{@case.Id}/cancel", new { reason = "Withdrawn by applicant." }));
        await ReadCaseAsync(await supervisor.PostAsync($"/api/cases/{@case.Id}/reopen", null));

        var history = await CaseHistoryAsync(supervisor, @case.Id);

        var comments = history.Where(e => e is { EntityType: "Comment", Action: "Created" }).Select(e => e.Changes["Body"].New);
        Assert.Equal(["Cancelled: Withdrawn by applicant.", "Checked zoning."], comments);

        var attachment = history.Single(e => e.EntityType == "Attachment");
        Assert.Equal("plan.pdf", attachment.Changes["FileName"].New);
        Assert.DoesNotContain("StoragePath", attachment.Changes.Keys);

        var cancelled = history.Single(e => e is { EntityType: "Case", Action: "Cancelled" });
        Assert.Equal(new AuditChange("Open", "Cancelled"), cancelled.Changes["Status"]);
        Assert.Equal("Skipped", history.First(e => e is { EntityType: "WorkflowTask", Action: "Skipped" }).Changes["Status"].New);
        var reopened = history.Single(e => e is { EntityType: "Case", Action: "Reopened" });
        Assert.Equal(new AuditChange("Cancelled", "Open"), reopened.Changes["Status"]);
    }

    [Fact]
    public async Task Case_history_follows_the_cases_visibility()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(planner);

        var outsider = await (await factory.CreateClientAsAsync("ce.staff1@civicflow.test")).GetAsync($"/api/cases/{@case.Id}/audit");
        var missing = await planner.GetAsync("/api/cases/999999/audit");

        Assert.Equal(HttpStatusCode.Forbidden, outsider.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task The_audit_log_is_for_supervisors_of_involved_departments_and_admins()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var @case = await CreateBuildingPermitAsync(planner);
        var url = $"/api/audit?caseId={@case.Id}&pageSize=100";

        var staff = await planner.GetAsync(url);
        var ownSupervisor = await (await factory.CreateClientAsAsync("pz.supervisor@civicflow.test"))
            .GetFromJsonAsync<PagedResult<AuditEntryDto>>(url, TestJson.Options);
        var otherSupervisor = await (await factory.CreateClientAsAsync("ce.supervisor@civicflow.test"))
            .GetFromJsonAsync<PagedResult<AuditEntryDto>>(url, TestJson.Options);
        var admin = await (await factory.CreateClientAsAsync("admin@civicflow.test"))
            .GetFromJsonAsync<PagedResult<AuditEntryDto>>($"{url}&entityType=Case&action=Created", TestJson.Options);

        Assert.Equal(HttpStatusCode.Forbidden, staff.StatusCode);
        Assert.True(ownSupervisor!.TotalCount > 0);
        Assert.Equal(0, otherSupervisor!.TotalCount);
        var created = Assert.Single(admin!.Items);
        Assert.Equal(@case.Id.ToString(), created.EntityId);
    }

    [Fact]
    public async Task Supervisors_do_not_see_changes_outside_cases()
    {
        var user = await AddUserThroughTheAppAsync();

        var supervisor = await (await factory.CreateClientAsAsync("it.supervisor@civicflow.test"))
            .GetFromJsonAsync<PagedResult<AuditEntryDto>>($"/api/audit?entityType=User&entityId={user.Id}", TestJson.Options);
        var admin = await (await factory.CreateClientAsAsync("admin@civicflow.test"))
            .GetFromJsonAsync<PagedResult<AuditEntryDto>>($"/api/audit?entityType=User&entityId={user.Id}", TestJson.Options);

        Assert.Equal(0, supervisor!.TotalCount);
        var entry = Assert.Single(admin!.Items);
        Assert.Null(entry.CaseId);
    }

    [Fact]
    public async Task Password_hashes_never_reach_the_log_and_system_changes_have_no_user()
    {
        var user = await AddUserThroughTheAppAsync();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CivicFlowDbContext>();
            var tracked = await db.Users.SingleAsync(u => u.Id == user.Id);
            tracked.PasswordHash = "another-hash";
            tracked.FullName = "Audit Renamed";
            await db.SaveChangesAsync();
        }

        await using var check = factory.CreateDbContext();
        var entries = await check.AuditLogs.Where(a => a.EntityType == "User" && a.EntityId == user.Id.ToString()).OrderBy(a => a.Id).ToListAsync();

        Assert.Equal(["Created", "Updated"], entries.Select(e => e.Action));
        Assert.All(entries, e => Assert.Null(e.UserId));
        Assert.All(entries, e => Assert.DoesNotContain("some-hash", e.Changes));
        Assert.All(entries, e => Assert.DoesNotContain("another-hash", e.Changes));
        var created = AuditChanges.Deserialize(entries[0].Changes);
        Assert.Equal("[redacted]", created["PasswordHash"].New);
        Assert.Equal("Audit User", created["FullName"].New);
        var updated = AuditChanges.Deserialize(entries[1].Changes);
        Assert.Equal(new AuditChange("[redacted]", "[redacted]"), updated["PasswordHash"]);
        Assert.Equal(new AuditChange("Audit User", "Audit Renamed"), updated["FullName"]);
    }

    [Fact]
    public async Task A_failed_save_leaves_no_audit_rows()
    {
        const string body = "This comment points at a case that doesn't exist.";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CivicFlowDbContext>();
            var authorId = await db.Users.Select(u => u.Id).FirstAsync();
            db.Comments.Add(new Comment { CaseId = 999_999, AuthorId = authorId, Body = body, CreatedAt = DateTimeOffset.UtcNow });

            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }

        await using var check = factory.CreateDbContext();
        Assert.False(await check.AuditLogs.AnyAsync(a => a.EntityType == "Comment" && a.Changes!.Contains(body)));
    }

    [Fact]
    public async Task The_seed_includes_a_backdated_history()
    {
        var admin = await factory.CreateClientAsAsync("admin@civicflow.test");

        var closed = await admin.GetFromJsonAsync<PagedResult<AuditEntryDto>>("/api/audit?entityType=Case&action=Closed&pageSize=100", TestJson.Options);
        var seededClose = closed!.Items.MinBy(e => e.Timestamp)!;
        var history = await CaseHistoryAsync(admin, seededClose.CaseId!.Value);

        Assert.NotNull(seededClose.UserName);
        Assert.True(seededClose.Timestamp < DateTimeOffset.UtcNow.AddHours(-1));
        var created = history.Single(e => e is { EntityType: "Case", Action: "Created" });
        Assert.Equal(history.Min(e => e.Timestamp), created.Timestamp);
        Assert.Contains(history, e => e.Action is "Approved" or "Completed" or "Rejected");
    }

    /// <summary>Adds a user through the app's own DbContext (so it's audited) outside any request.</summary>
    private async Task<User> AddUserThroughTheAppAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CivicFlowDbContext>();
        var user = new User
        {
            Email = $"audit.{Guid.NewGuid():N}@civicflow.test",
            FullName = "Audit User",
            PasswordHash = "some-hash",
            Role = UserRole.Staff,
            DepartmentId = await db.Departments.Select(d => d.Id).FirstAsync(),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }
}
