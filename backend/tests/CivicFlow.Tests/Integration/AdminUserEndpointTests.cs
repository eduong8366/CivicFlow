using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Admin;
using CivicFlow.Application.Audit;
using CivicFlow.Application.Auth;
using CivicFlow.Application.Common;
using CivicFlow.Application.Lookups;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using static CivicFlow.Tests.Integration.AdminApi;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AdminUserEndpointTests(CivicFlowApiFactory factory)
{
    [Theory]
    [InlineData("pz.staff1@civicflow.test", "/api/admin/users")]
    [InlineData("pz.supervisor@civicflow.test", "/api/admin/users")]
    [InlineData("pz.supervisor@civicflow.test", "/api/admin/departments")]
    [InlineData("pz.supervisor@civicflow.test", "/api/admin/case-types")]
    public async Task Admin_endpoints_are_for_admins_only(string email, string url)
    {
        var client = await factory.CreateClientAsAsync(email);

        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_creates_an_account_that_can_sign_in()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var pz = await DepartmentIdAsync(factory, "PZ");

        var response = await admin.PostAsJsonAsync("/api/admin/users",
            new CreateUserRequest("  new.planner@civicflow.test ", " Nia Planner ", NewUserPassword, UserRole.Staff, pz), TestJson.Options);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var user = (await response.Content.ReadFromJsonAsync<AdminUserDto>(TestJson.Options))!;
        Assert.Equal("new.planner@civicflow.test", user.Email);
        Assert.Equal("Nia Planner", user.FullName);
        Assert.Equal("Planning & Zoning", user.DepartmentName);
        Assert.True(user.IsActive);
        Assert.Equal($"/api/admin/users/{user.Id}", response.Headers.Location?.AbsolutePath);

        var login = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(user.Email, NewUserPassword));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Account_rules_are_400s()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var pz = await DepartmentIdAsync(factory, "PZ");

        var takenEmail = await admin.PostAsJsonAsync("/api/admin/users",
            new CreateUserRequest("PZ.STAFF1@civicflow.test", "Copy Cat", NewUserPassword, UserRole.Staff, pz), TestJson.Options);
        var shortPassword = await admin.PostAsJsonAsync("/api/admin/users",
            new CreateUserRequest("short.pw@civicflow.test", "Short Password", "Abc!2026", UserRole.Staff, pz), TestJson.Options);
        var noDepartment = await admin.PostAsJsonAsync("/api/admin/users",
            new CreateUserRequest("no.dept@civicflow.test", "No Department", NewUserPassword, UserRole.Supervisor, null), TestJson.Options);
        var unknownDepartment = await admin.PostAsJsonAsync("/api/admin/users",
            new CreateUserRequest("bad.dept@civicflow.test", "Bad Department", NewUserPassword, UserRole.Staff, 999999), TestJson.Options);

        await AssertValidationErrorAsync(takenEmail, "Email");
        await AssertValidationErrorAsync(shortPassword, "Password");
        await AssertValidationErrorAsync(noDepartment, "DepartmentId");
        await AssertValidationErrorAsync(unknownDepartment, "DepartmentId");
    }

    [Fact]
    public async Task An_admin_account_may_be_agency_wide()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);

        var user = await CreateUserAsync(admin, UserRole.Admin, departmentId: null);

        Assert.Null(user.DepartmentId);
    }

    [Fact]
    public async Task Deactivating_an_account_returns_its_work_to_the_queue_and_blocks_sign_in()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var worker = await CreateUserAsync(admin, UserRole.Staff, await DepartmentIdAsync(factory, "PZ"));
        var workerClient = await factory.CreateClientAsAsync(worker.Email, NewUserPassword);
        var @case = await CreateBuildingPermitAsync(workerClient);
        var claimed = await ReadCaseAsync(await ClaimAsync(workerClient, ActiveTask(@case).Id));
        Assert.Equal(CaseStatus.InProgress, claimed.Status);

        var updated = await ReadAsync<AdminUserDto>(await UpdateUserAsync(admin, worker, u => u with { IsActive = false }));

        Assert.False(updated.IsActive);
        Assert.Equal(0, updated.ActiveTaskCount);
        var after = await admin.GetFromJsonAsync<Application.Cases.CaseDetailDto>($"/api/cases/{@case.Id}", TestJson.Options);
        Assert.Null(ActiveTask(after!).AssigneeId);
        Assert.Equal(CaseStatus.Open, after!.Status);

        var login = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(worker.Email, NewUserPassword));
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        var history = await admin.GetFromJsonAsync<PagedResult<AuditEntryDto>>($"/api/cases/{@case.Id}/audit", TestJson.Options);
        Assert.Contains(history!.Items, a => a.EntityType == "WorkflowTask" && a.Action == "Unassigned");
    }

    [Fact]
    public async Task Moving_to_another_department_returns_only_that_departments_work()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var worker = await CreateUserAsync(admin, UserRole.Staff, await DepartmentIdAsync(factory, "PZ"));
        var workerClient = await factory.CreateClientAsAsync(worker.Email, NewUserPassword);
        var @case = await CreateBuildingPermitAsync(workerClient);
        await ReadCaseAsync(await ClaimAsync(workerClient, ActiveTask(@case).Id));
        var pw = await DepartmentIdAsync(factory, "PW");

        var moved = await ReadAsync<AdminUserDto>(await UpdateUserAsync(admin, worker, u => u with { DepartmentId = pw }));

        Assert.Equal("Public Works", moved.DepartmentName);
        Assert.Equal(0, moved.ActiveTaskCount);
        var after = await admin.GetFromJsonAsync<Application.Cases.CaseDetailDto>($"/api/cases/{@case.Id}", TestJson.Options);
        Assert.Null(ActiveTask(after!).AssigneeId);
    }

    [Fact]
    public async Task Admins_cannot_lock_themselves_out()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var self = (await admin.GetFromJsonAsync<PagedResult<AdminUserDto>>(
            $"/api/admin/users?search={AdminEmail}", TestJson.Options))!.Items.Single();

        var deactivate = await UpdateUserAsync(admin, self, u => u with { IsActive = false });
        var demote = await UpdateUserAsync(admin, self, u => u with { Role = UserRole.Supervisor });

        await AssertValidationErrorAsync(deactivate, "IsActive");
        await AssertValidationErrorAsync(demote, "Role");
    }

    [Fact]
    public async Task A_password_reset_replaces_the_old_password()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var user = await CreateUserAsync(admin, UserRole.Staff, await DepartmentIdAsync(factory, "CE"));

        var reset = await admin.PostAsJsonAsync($"/api/admin/users/{user.Id}/password", new ResetPasswordRequest("a brand new passphrase"));

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/auth/login", new LoginRequest(user.Email, NewUserPassword))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await anonymous.PostAsJsonAsync("/api/auth/login", new LoginRequest(user.Email, "a brand new passphrase"))).StatusCode);
    }

    [Fact]
    public async Task The_user_list_filters_and_pages()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var ce = await DepartmentIdAsync(factory, "CE");

        var supervisors = await admin.GetFromJsonAsync<PagedResult<AdminUserDto>>(
            $"/api/admin/users?departmentId={ce}&role=Supervisor", TestJson.Options);
        var page = await admin.GetFromJsonAsync<PagedResult<AdminUserDto>>("/api/admin/users?pageSize=5&page=2", TestJson.Options);

        var supervisor = Assert.Single(supervisors!.Items);
        Assert.Equal("Marcus Bell", supervisor.FullName);
        Assert.Equal(5, page!.Items.Count);
        Assert.True(page.TotalCount >= 16);
    }

    [Fact]
    public async Task Anyone_signed_in_can_look_up_colleagues_by_department()
    {
        var staff = await factory.CreateClientAsAsync("ce.staff1@civicflow.test");
        var ce = await DepartmentIdAsync(factory, "CE");

        var users = await staff.GetFromJsonAsync<List<UserLookupDto>>($"/api/users?departmentId={ce}", TestJson.Options);
        var departments = await staff.GetFromJsonAsync<List<DepartmentLookupDto>>("/api/departments", TestJson.Options);

        Assert.Contains(users!, u => u.FullName == "Marcus Bell" && u.Role == UserRole.Supervisor);
        Assert.All(users!, u => Assert.Equal(ce, u.DepartmentId));
        Assert.All(users!, u => Assert.True(u.IsActive));
        Assert.Contains(departments!, d => d.Code == "PZ");
    }

    private static async Task AssertValidationErrorAsync(HttpResponseMessage response, string key)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains(key, problem!.Errors.Keys);
    }
}
