using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Cases;
using CivicFlow.Application.CaseTypes;
using CivicFlow.Application.Tasks;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Tests.Integration;

/// <summary>Helpers for the case and task endpoint tests. Each test creates its own cases, so seeded data stays as seeded.</summary>
internal static class CaseApi
{
    public static async Task<CaseTypeDto> GetCaseTypeAsync(HttpClient client, string prefix)
    {
        var caseTypes = await client.GetFromJsonAsync<List<CaseTypeDto>>("/api/case-types", TestJson.Options);
        return caseTypes!.Single(t => t.Prefix == prefix);
    }

    /// <summary>A valid Building Permit request: Intake (PZ) → Plan Review (PZ) → Inspection (PW) → Issuance (PZ).</summary>
    public static async Task<CreateCaseRequest> BuildingPermitRequestAsync(HttpClient client) =>
        new(
            (await GetCaseTypeAsync(client, "BLD")).Id,
            "Deck addition at 12 Test St",
            "Rear deck, 300 sq ft.",
            CasePriority.High,
            "Pat Tester",
            "pat.tester@example.com",
            null,
            "12 Test St",
            new()
            {
                ["parcelNumber"] = "101-22-3333",
                ["projectType"] = "Addition",
                ["valuation"] = "18000",
                ["ownerOccupied"] = "true",
            });

    public static async Task<CaseDetailDto> CreateBuildingPermitAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/cases", await BuildingPermitRequestAsync(client), TestJson.Options);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CaseDetailDto>(TestJson.Options))!;
    }

    public static Task<HttpResponseMessage> ClaimAsync(HttpClient client, int taskId) =>
        client.PostAsync($"/api/tasks/{taskId}/claim", null);

    public static Task<HttpResponseMessage> AssignAsync(HttpClient client, int taskId, int? assigneeId) =>
        client.PostAsJsonAsync($"/api/tasks/{taskId}/assign", new AssignTaskRequest(assigneeId), TestJson.Options);

    public static Task<HttpResponseMessage> CompleteAsync(HttpClient client, int taskId, TaskOutcome outcome, string? notes = null) =>
        client.PostAsJsonAsync($"/api/tasks/{taskId}/complete", new CompleteTaskRequest(outcome, notes), TestJson.Options);

    /// <summary>Asserts success and returns the updated case the task and case actions respond with.</summary>
    public static async Task<CaseDetailDto> ReadCaseAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<CaseDetailDto>(TestJson.Options))!;
    }

    public static WorkflowTaskDto ActiveTask(CaseDetailDto @case) =>
        @case.Tasks.Single(t => t.Status == WorkflowTaskStatus.Active);

    public static async Task<int> UserIdAsync(CivicFlowApiFactory factory, string email)
    {
        await using var db = factory.CreateDbContext();
        return await db.Users.Where(u => u.Email == email).Select(u => u.Id).SingleAsync();
    }
}
