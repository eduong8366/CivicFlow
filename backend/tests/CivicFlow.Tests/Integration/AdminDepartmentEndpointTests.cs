using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Admin;
using CivicFlow.Application.Lookups;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using static CivicFlow.Tests.Integration.AdminApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AdminDepartmentEndpointTests(CivicFlowApiFactory factory)
{
    [Fact]
    public async Task An_admin_creates_a_department_with_an_upper_case_code()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var code = UniqueCode();

        var response = await admin.PostAsJsonAsync("/api/admin/departments", new SaveDepartmentRequest($" Parks {code} ", code.ToLowerInvariant()));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var department = (await response.Content.ReadFromJsonAsync<AdminDepartmentDto>(TestJson.Options))!;
        Assert.Equal($"Parks {code}", department.Name);
        Assert.Equal(code, department.Code);
        Assert.True(department.IsActive);

        var lookup = await admin.GetFromJsonAsync<List<DepartmentLookupDto>>("/api/departments", TestJson.Options);
        Assert.Contains(lookup!, d => d.Id == department.Id);
    }

    [Fact]
    public async Task Names_and_codes_are_unique()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);

        var duplicateCode = await admin.PostAsJsonAsync("/api/admin/departments", new SaveDepartmentRequest($"Other {UniqueCode()}", "pz"));
        var duplicateName = await admin.PostAsJsonAsync("/api/admin/departments", new SaveDepartmentRequest("public works", UniqueCode()));

        Assert.Equal(HttpStatusCode.BadRequest, duplicateCode.StatusCode);
        Assert.Contains("Code", (await duplicateCode.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors.Keys);
        Assert.Equal(HttpStatusCode.BadRequest, duplicateName.StatusCode);
        Assert.Contains("Name", (await duplicateName.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors.Keys);
    }

    [Fact]
    public async Task A_department_in_use_cannot_be_deactivated()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var pz = await admin.GetFromJsonAsync<AdminDepartmentDto>(
            $"/api/admin/departments/{await DepartmentIdAsync(factory, "PZ")}", TestJson.Options);

        var response = await admin.PutAsJsonAsync($"/api/admin/departments/{pz!.Id}", new SaveDepartmentRequest(pz.Name, pz.Code, IsActive: false));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.True(pz.ActiveUserCount >= 3);
        Assert.True(pz.ActiveStepCount >= 3);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("active user(s)", problem!.Detail);
    }

    [Fact]
    public async Task An_unused_department_is_deactivated_and_leaves_the_pickers()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var code = UniqueCode();
        var created = await ReadAsync<AdminDepartmentDto>(
            await admin.PostAsJsonAsync("/api/admin/departments", new SaveDepartmentRequest($"Temp {code}", code)));

        var updated = await ReadAsync<AdminDepartmentDto>(await admin.PutAsJsonAsync(
            $"/api/admin/departments/{created.Id}", new SaveDepartmentRequest($"Retired {code}", code, IsActive: false)));

        Assert.False(updated.IsActive);
        Assert.Equal($"Retired {code}", updated.Name);
        var active = await admin.GetFromJsonAsync<List<DepartmentLookupDto>>("/api/departments", TestJson.Options);
        var all = await admin.GetFromJsonAsync<List<DepartmentLookupDto>>("/api/departments?includeInactive=true", TestJson.Options);
        Assert.DoesNotContain(active!, d => d.Id == created.Id);
        Assert.Contains(all!, d => d.Id == created.Id && !d.IsActive);

        var newUser = await admin.PostAsJsonAsync("/api/admin/users",
            new CreateUserRequest($"{code.ToLowerInvariant()}@civicflow.test", "Retired Dept", NewUserPassword, UserRole.Staff, created.Id),
            TestJson.Options);
        Assert.Equal(HttpStatusCode.BadRequest, newUser.StatusCode);
    }

    [Fact]
    public async Task Unknown_department_is_404()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);

        var response = await admin.GetAsync("/api/admin/departments/999999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
