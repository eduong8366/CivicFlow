using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Cases;
using CivicFlow.Application.CaseTypes;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class CaseEndpointTests(CivicFlowApiFactory factory)
{
    [Fact]
    public async Task Case_types_list_the_active_types_with_their_form_and_workflow()
    {
        var client = await factory.CreateClientAsAsync("ce.staff1@civicflow.test");

        var caseTypes = await client.GetFromJsonAsync<List<CaseTypeDto>>("/api/case-types", TestJson.Options);

        Assert.Equal(["BLD", "CE", "IT", "PRR"], caseTypes!.Select(t => t.Prefix).Order());
        var permit = caseTypes!.Single(t => t.Prefix == "BLD");
        Assert.Equal("parcelNumber", permit.Fields[0].Key);
        Assert.Equal(["New Construction", "Addition", "Alteration", "Demolition"], permit.Fields.Single(f => f.Key == "projectType").Options);
        Assert.Equal(["Intake", "Plan Review", "Inspection", "Issuance"], permit.Steps.Select(s => s.Name));
        Assert.Equal("Public Works", permit.Steps[2].DepartmentName);
        Assert.Equal([TaskOutcome.Approve, TaskOutcome.Reject, TaskOutcome.Return], permit.Steps[2].AllowedOutcomes);
    }

    [Fact]
    public async Task Creating_a_case_starts_its_workflow_in_the_first_department_queue()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var request = await BuildingPermitRequestAsync(client);

        var response = await client.PostAsJsonAsync("/api/cases", request, TestJson.Options);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CaseDetailDto>(TestJson.Options))!;
        Assert.Equal($"/api/cases/{created.Id}", response.Headers.Location!.AbsolutePath);
        Assert.Matches(@"^BLD-\d{4}-\d{6}$", created.CaseNumber);
        Assert.Equal(CaseStatus.Open, created.Status);
        Assert.Equal("Pat Tester", created.Requester.Name);
        Assert.Equal("Luis Ortega", created.CreatedBy.FullName);
        Assert.Equal("18000", created.Fields.Single(f => f.Key == "valuation").Value);
        Assert.Null(created.Fields.Single(f => f.Key == "squareFootage").Value);

        Assert.Equal(4, created.Tasks.Count);
        var intake = ActiveTask(created);
        Assert.Equal("Intake", intake.Name);
        Assert.Equal("Planning & Zoning", intake.DepartmentName);
        Assert.Null(intake.AssigneeId);
        Assert.Equal(new TaskActionsDto(CanClaim: true, CanAssign: false, CanComplete: false), intake.Actions);
        Assert.Equal(new CaseActionsDto(false, false, false), created.Actions);

        var fetched = await client.GetFromJsonAsync<CaseDetailDto>($"/api/cases/{created.Id}", TestJson.Options);
        Assert.Equal(created.CaseNumber, fetched!.CaseNumber);
    }

    [Fact]
    public async Task Invalid_custom_fields_are_400_with_an_error_per_field()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var request = await BuildingPermitRequestAsync(client) with
        {
            Fields = new() { ["projectType"] = "Treehouse", ["valuation"] = "lots", ["color"] = "red" },
        };

        var response = await client.PostAsJsonAsync("/api/cases", request, TestJson.Options);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equivalent(
            new[] { "Fields.parcelNumber", "Fields.projectType", "Fields.valuation", "Fields.color" },
            problem!.Errors.Keys);
    }

    [Fact]
    public async Task Creating_a_case_of_an_unknown_type_is_400()
    {
        var client = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var request = await BuildingPermitRequestAsync(client) with { CaseTypeId = 999_999 };

        var response = await client.PostAsJsonAsync("/api/cases", request, TestJson.Options);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains("CaseTypeId", problem!.Errors.Keys);
    }

    [Fact]
    public async Task Other_departments_cannot_view_a_case_but_its_creator_can()
    {
        // A Code Enforcement officer files a building permit, which only Planning and Public Works work on.
        var creator = await factory.CreateClientAsAsync("ce.staff1@civicflow.test");
        var created = await CreateBuildingPermitAsync(creator);

        var creatorView = await creator.GetAsync($"/api/cases/{created.Id}");
        var colleagueView = await (await factory.CreateClientAsAsync("ce.staff2@civicflow.test")).GetAsync($"/api/cases/{created.Id}");
        var inspectorView = await (await factory.CreateClientAsAsync("pw.staff1@civicflow.test")).GetAsync($"/api/cases/{created.Id}");
        var missing = await creator.GetAsync("/api/cases/999999");

        Assert.Equal(HttpStatusCode.OK, creatorView.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, colleagueView.StatusCode);
        Assert.Equal(HttpStatusCode.OK, inspectorView.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Search_only_returns_cases_the_caller_may_view()
    {
        var admin = await factory.CreateClientAsAsync("admin@civicflow.test");
        var itStaff = await factory.CreateClientAsAsync("it.staff1@civicflow.test");

        var all = await admin.GetFromJsonAsync<PagedResult<CaseListItemDto>>("/api/cases?pageSize=100", TestJson.Options);
        var visible = await itStaff.GetFromJsonAsync<PagedResult<CaseListItemDto>>("/api/cases?pageSize=100", TestJson.Options);

        Assert.True(all!.TotalCount >= 40);
        Assert.InRange(visible!.TotalCount, 1, all.TotalCount - 1);
        // IT works IT tickets and the Search step of records requests, never code complaints.
        Assert.Contains(visible.Items, c => c.CaseTypeName == "IT Service Request");
        Assert.Contains(visible.Items, c => c.CaseTypeName == "Public Records Request");
        Assert.DoesNotContain(visible.Items, c => c.CaseTypeName == "Code Violation Complaint");
    }

    [Fact]
    public async Task Search_filters_sorts_and_pages()
    {
        var admin = await factory.CreateClientAsAsync("admin@civicflow.test");
        var permitType = await GetCaseTypeAsync(admin, "BLD");

        var closedPermits = await admin.GetFromJsonAsync<PagedResult<CaseListItemDto>>(
            $"/api/cases?caseTypeId={permitType.Id}&status=Closed&pageSize=100", TestJson.Options);
        var page = await admin.GetFromJsonAsync<PagedResult<CaseListItemDto>>(
            "/api/cases?page=2&pageSize=5&sort=dueDate&descending=false", TestJson.Options);
        var overdue = await admin.GetFromJsonAsync<PagedResult<CaseListItemDto>>(
            "/api/cases?overdue=true&pageSize=100", TestJson.Options);

        Assert.NotEmpty(closedPermits!.Items);
        Assert.All(closedPermits.Items, c =>
        {
            Assert.Equal(CaseStatus.Closed, c.Status);
            Assert.Equal("Building Permit Application", c.CaseTypeName);
            Assert.Null(c.CurrentStep);
        });

        Assert.Equal(5, page!.Items.Count);
        Assert.Equal(2, page.Page);
        Assert.Equal((page.TotalCount + 4) / 5, page.TotalPages);
        Assert.Equal(page.Items.Select(c => c.DueDate).Order(), page.Items.Select(c => c.DueDate));

        Assert.All(overdue!.Items, c => Assert.True(c.IsOverdue));
    }

    [Fact]
    public async Task Search_by_case_number_finds_that_case()
    {
        var client = await factory.CreateClientAsAsync("pz.staff2@civicflow.test");
        var created = await CreateBuildingPermitAsync(client);

        var result = await client.GetFromJsonAsync<PagedResult<CaseListItemDto>>(
            $"/api/cases?search={created.CaseNumber}", TestJson.Options);

        var row = Assert.Single(result!.Items);
        Assert.Equal(created.Id, row.Id);
        Assert.Equal("Intake", row.CurrentStep);
        Assert.Equal("Planning & Zoning", row.CurrentDepartmentName);
        Assert.Null(row.CurrentAssigneeName);
    }

    [Fact]
    public async Task Invalid_search_parameters_are_400()
    {
        var client = await factory.CreateClientAsAsync("admin@civicflow.test");

        var response = await client.GetAsync("/api/cases?pageSize=500&createdFrom=2026-09-10&createdTo=2026-09-01");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains("PageSize", problem!.Errors.Keys);
        Assert.Contains("CreatedTo", problem.Errors.Keys);
    }

    [Fact]
    public async Task Staff_cannot_hold_cancel_or_reopen()
    {
        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var created = await CreateBuildingPermitAsync(staff);

        foreach (var action in new[] { "hold", "cancel", "reopen" })
        {
            var response = await staff.PostAsync($"/api/cases/{created.Id}/{action}", null);
            Assert.True(HttpStatusCode.Forbidden == response.StatusCode, $"{action}: {response.StatusCode}");
        }
    }

    [Fact]
    public async Task Supervisors_manage_only_cases_their_department_works_on()
    {
        var created = await CreateBuildingPermitAsync(await factory.CreateClientAsAsync("pz.staff1@civicflow.test"));
        var otherSupervisor = await factory.CreateClientAsAsync("clk.supervisor@civicflow.test");

        var response = await otherSupervisor.PostAsync($"/api/cases/{created.Id}/hold", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Hold_blocks_task_work_until_the_case_is_reopened()
    {
        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var supervisor = await factory.CreateClientAsAsync("pw.supervisor@civicflow.test"); // Inspection is Public Works'.
        var created = await CreateBuildingPermitAsync(staff);
        var intake = ActiveTask(created);

        var held = await ReadCaseAsync(await supervisor.PostAsync($"/api/cases/{created.Id}/hold", null));
        Assert.Equal(CaseStatus.OnHold, held.Status);
        Assert.Equal(new CaseActionsDto(CanHold: false, CanCancel: true, CanReopen: true), held.Actions);

        Assert.Equal(HttpStatusCode.Conflict, (await ClaimAsync(staff, intake.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await supervisor.PostAsync($"/api/cases/{created.Id}/hold", null)).StatusCode);

        var reopened = await ReadCaseAsync(await supervisor.PostAsync($"/api/cases/{created.Id}/reopen", null));
        Assert.Equal(CaseStatus.Open, reopened.Status);
        await ReadCaseAsync(await ClaimAsync(staff, intake.Id));
    }

    [Fact]
    public async Task Cancelled_cases_can_be_reopened_at_the_step_they_reached()
    {
        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var admin = await factory.CreateClientAsAsync("admin@civicflow.test");
        var created = await CreateBuildingPermitAsync(staff);
        var intakeId = ActiveTask(created).Id;
        await ReadCaseAsync(await ClaimAsync(staff, intakeId));
        await ReadCaseAsync(await CompleteAsync(staff, intakeId, TaskOutcome.Complete));

        var cancelled = await ReadCaseAsync(await admin.PostAsync($"/api/cases/{created.Id}/cancel", null));
        Assert.Equal(CaseStatus.Cancelled, cancelled.Status);
        Assert.NotNull(cancelled.ClosedAt);
        Assert.DoesNotContain(cancelled.Tasks, t => t.Status is WorkflowTaskStatus.Active or WorkflowTaskStatus.Pending);

        var reopened = await ReadCaseAsync(await admin.PostAsync($"/api/cases/{created.Id}/reopen", null));
        Assert.Equal(CaseStatus.InProgress, reopened.Status);
        Assert.Null(reopened.ClosedAt);
        Assert.Equal("Plan Review", ActiveTask(reopened).Name);
        // Fresh instances of Inspection and Issuance wait behind it; the skipped ones stay as history.
        Assert.Equal(["Inspection", "Issuance"], reopened.Tasks.Where(t => t.Status == WorkflowTaskStatus.Pending).Select(t => t.Name));
        Assert.Equal(3, reopened.Tasks.Count(t => t.Status == WorkflowTaskStatus.Skipped));
    }
}
