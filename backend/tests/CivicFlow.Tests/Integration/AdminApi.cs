using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Admin;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Tests.Integration;

/// <summary>Helpers for the admin endpoint tests. Each test creates its own users, departments and case types.</summary>
internal static class AdminApi
{
    public const string AdminEmail = "admin@civicflow.test";
    public const string NewUserPassword = "correct horse battery";

    /// <summary>A short upper-case token, unique enough to keep names, codes and prefixes apart within a run.</summary>
    public static string UniqueCode() => "T" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();

    public static async Task<int> DepartmentIdAsync(CivicFlowApiFactory factory, string code)
    {
        await using var db = factory.CreateDbContext();
        return await db.Departments.Where(d => d.Code == code).Select(d => d.Id).SingleAsync();
    }

    public static async Task<AdminUserDto> CreateUserAsync(HttpClient admin, UserRole role, int? departmentId)
    {
        var email = $"{UniqueCode().ToLowerInvariant()}@civicflow.test";
        var response = await admin.PostAsJsonAsync(
            "/api/admin/users", new CreateUserRequest(email, "Test User " + email[..7], NewUserPassword, role, departmentId), TestJson.Options);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AdminUserDto>(TestJson.Options))!;
    }

    public static Task<HttpResponseMessage> UpdateUserAsync(HttpClient admin, AdminUserDto user, Func<UpdateUserRequest, UpdateUserRequest> change) =>
        admin.PutAsJsonAsync(
            $"/api/admin/users/{user.Id}",
            change(new UpdateUserRequest(user.Email, user.FullName, user.Role, user.DepartmentId, user.IsActive)),
            TestJson.Options);

    public static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>(TestJson.Options))!;
    }
}
