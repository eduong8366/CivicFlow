using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Admin;
using CivicFlow.Application.Audit;
using CivicFlow.Application.Cases;
using CivicFlow.Application.CaseTypes;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using static CivicFlow.Tests.Integration.AdminApi;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AdminCaseTypeEndpointTests(CivicFlowApiFactory factory)
{
    [Fact]
    public async Task An_admin_designs_a_case_type_that_staff_can_open_cases_of()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var created = await CreateAsync(admin, await NewRequestAsync());

        Assert.Equal(["treeCount", "species", "hazard"], created.Fields.Select(f => f.Key));
        Assert.Equal([1, 2, 3], created.Fields.Select(f => f.SortOrder));
        Assert.Equal(["Assessment", "Removal"], created.Steps.Select(s => s.Name));
        Assert.Equal([TaskOutcome.Approve, TaskOutcome.Reject, TaskOutcome.Return], created.Steps[1].AllowedOutcomes);
        Assert.All(created.Fields, f => Assert.False(f.InUse));

        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var caseTypes = await staff.GetFromJsonAsync<List<CaseTypeDto>>("/api/case-types", TestJson.Options);
        Assert.Contains(caseTypes!, t => t.Id == created.Id);

        var response = await staff.PostAsJsonAsync("/api/cases", new CreateCaseRequest(
            created.Id, "Leaning oak on Elm St", null, CasePriority.Normal, "Pat Tester", null, null, "4 Elm St",
            new() { ["treeCount"] = "2", ["species"] = "Oak", ["hazard"] = "true" }), TestJson.Options);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var @case = (await response.Content.ReadFromJsonAsync<CaseDetailDto>(TestJson.Options))!;
        Assert.StartsWith(created.Prefix + "-", @case.CaseNumber);
        Assert.Equal(["Assessment", "Removal"], @case.Tasks.Select(t => t.Name));
        Assert.Equal("Planning & Zoning", ActiveTask(@case).DepartmentName);
    }

    [Fact]
    public async Task Saving_reorders_edits_adds_and_removes_fields_and_steps()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var created = await CreateAsync(admin, await NewRequestAsync());
        var ce = await DepartmentIdAsync(factory, "CE");
        var (count, species, hazard) = (created.Fields[0], created.Fields[1], created.Fields[2]);
        var (assessment, removal) = (created.Steps[0], created.Steps[1]);

        var updated = await ReadAsync<AdminCaseTypeDto>(await admin.PutAsJsonAsync($"/api/admin/case-types/{created.Id}",
            new SaveCaseTypeRequest(
                created.Name,
                created.Prefix,
                "Now with a notes field.",
                [
                    Field(hazard) with { Label = "Immediate hazard?" },
                    Field(species) with { Options = ["Oak", "Maple", "Pine", "Other"] },
                    new CaseTypeFieldInput(null, "notes", "Notes", FieldDataType.Text, false, null),
                ],
                [
                    new WorkflowStepInput(null, "Intake", ce, 1, [TaskOutcome.Complete]),
                    Step(assessment),
                    Step(removal) with { SlaDays = 20 },
                ]),
            TestJson.Options));

        Assert.Equal("Now with a notes field.", updated.Description);
        Assert.Equal(["hazard", "species", "notes"], updated.Fields.Select(f => f.Key));
        Assert.Equal([hazard.Id, species.Id], updated.Fields.Take(2).Select(f => f.Id));
        Assert.Equal("Immediate hazard?", updated.Fields[0].Label);
        Assert.Equal(["Oak", "Maple", "Pine", "Other"], updated.Fields[1].Options);
        Assert.DoesNotContain(updated.Fields, f => f.Id == count.Id);
        Assert.Equal(["Intake", "Assessment", "Removal"], updated.Steps.Select(s => s.Name));
        Assert.Equal([1, 2, 3], updated.Steps.Select(s => s.SortOrder));
        Assert.Equal(20, updated.Steps[2].SlaDays);
        Assert.Equal("Code Enforcement", updated.Steps[0].DepartmentName);
    }

    [Fact]
    public async Task A_field_can_be_replaced_by_a_new_one_with_the_same_key()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var created = await CreateAsync(admin, await NewRequestAsync());

        var request = ToRequest(created) with
        {
            Fields = [new CaseTypeFieldInput(null, "treeCount", "Number of trees", FieldDataType.Text, true, null)],
        };
        var updated = await ReadAsync<AdminCaseTypeDto>(
            await admin.PutAsJsonAsync($"/api/admin/case-types/{created.Id}", request, TestJson.Options));

        var field = Assert.Single(updated.Fields);
        Assert.NotEqual(created.Fields[0].Id, field.Id);
        Assert.Equal(FieldDataType.Text, field.DataType);
    }

    [Fact]
    public async Task What_existing_cases_use_is_protected()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var created = await CreateAsync(admin, await NewRequestAsync());
        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var opened = await staff.PostAsJsonAsync("/api/cases", new CreateCaseRequest(
            created.Id, "Dead pine", null, CasePriority.Low, "Pat Tester", null, null, null,
            new() { ["treeCount"] = "1", ["species"] = "Pine" }), TestJson.Options);
        Assert.Equal(HttpStatusCode.Created, opened.StatusCode);

        var current = await admin.GetFromJsonAsync<AdminCaseTypeDto>($"/api/admin/case-types/{created.Id}", TestJson.Options);
        Assert.Equal(1, current!.CaseCount);
        Assert.True(current.Fields.Single(f => f.Key == "treeCount").InUse);
        Assert.All(current.Steps, s => Assert.True(s.InUse, "A new case has a task for every step."));

        var removeField = await Put(admin, current, r => r with { Fields = r.Fields.Skip(1).ToList() });
        var retypeField = await Put(admin, current, r => r with
        {
            Fields = [r.Fields[0] with { DataType = FieldDataType.Text }, .. r.Fields.Skip(1)],
        });
        var removeStep = await Put(admin, current, r => r with { Steps = r.Steps.Take(1).ToList() });
        var removeUnusedField = await Put(admin, current, r => r with { Fields = r.Fields.Take(2).ToList() });

        await AssertValidationErrorAsync(removeField, "Fields");
        await AssertValidationErrorAsync(retypeField, "Fields[0].DataType");
        await AssertValidationErrorAsync(removeStep, "Steps");
        Assert.Equal(HttpStatusCode.OK, removeUnusedField.StatusCode);
    }

    [Fact]
    public async Task Definitions_are_validated()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var valid = await NewRequestAsync();

        async Task<HttpResponseMessage> Post(SaveCaseTypeRequest request) =>
            await admin.PostAsJsonAsync("/api/admin/case-types", request, TestJson.Options);

        await AssertValidationErrorAsync(await Post(valid with { Prefix = "bld" }), "Prefix");
        await AssertValidationErrorAsync(await Post(valid with { Name = "Building Permit Application" }), "Name");
        await AssertValidationErrorAsync(await Post(valid with { Steps = [] }), "Steps");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Steps = [valid.Steps[0] with { AllowedOutcomes = [TaskOutcome.Complete, TaskOutcome.Return] }],
        }), "Steps");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Steps = [valid.Steps[0] with { AllowedOutcomes = [TaskOutcome.Reject] }],
        }), "Steps[0].AllowedOutcomes");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Steps = [valid.Steps[0] with { DepartmentId = 999999 }],
        }), "Steps[0].DepartmentId");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Fields = [valid.Fields[1] with { Options = [] }],
        }), "Fields[0].Options");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Fields = [valid.Fields[0] with { Options = ["1", "2"] }],
        }), "Fields[0].Options");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Fields = [valid.Fields[0], valid.Fields[1] with { Key = "TreeCount" }],
        }), "Fields");
        await AssertValidationErrorAsync(await Post(valid with
        {
            Fields = [valid.Fields[0] with { Key = "tree count" }],
        }), "Fields[0].Key");
    }

    [Fact]
    public async Task A_deactivated_case_type_takes_no_new_cases()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var created = await CreateAsync(admin, await NewRequestAsync());

        var updated = await ReadAsync<AdminCaseTypeDto>(await Put(admin, created, r => r with { IsActive = false }));

        Assert.False(updated.IsActive);
        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var caseTypes = await staff.GetFromJsonAsync<List<CaseTypeDto>>("/api/case-types", TestJson.Options);
        Assert.DoesNotContain(caseTypes!, t => t.Id == created.Id);
        var opened = await staff.PostAsJsonAsync("/api/cases", new CreateCaseRequest(
            created.Id, "Too late", null, CasePriority.Low, "Pat Tester", null, null, null,
            new() { ["treeCount"] = "1", ["species"] = "Oak" }), TestJson.Options);
        await AssertValidationErrorAsync(opened, "CaseTypeId");

        var list = await admin.GetFromJsonAsync<List<AdminCaseTypeListItemDto>>("/api/admin/case-types", TestJson.Options);
        Assert.Contains(list!, t => t.Id == created.Id && !t.IsActive);
    }

    [Fact]
    public async Task Case_type_changes_are_in_the_admin_audit_log_only()
    {
        var admin = await factory.CreateClientAsAsync(AdminEmail);
        var created = await CreateAsync(admin, await NewRequestAsync());
        await ReadAsync<AdminCaseTypeDto>(await Put(admin, created, r => r with { Name = r.Name + " (renamed)" }));
        var url = $"/api/audit?entityType=CaseType&entityId={created.Id}";

        var adminView = await admin.GetFromJsonAsync<PagedResult<AuditEntryDto>>(url, TestJson.Options);
        var supervisorView = await (await factory.CreateClientAsAsync("pz.supervisor@civicflow.test"))
            .GetFromJsonAsync<PagedResult<AuditEntryDto>>(url, TestJson.Options);

        Assert.Equal(["Updated", "Created"], adminView!.Items.Select(a => a.Action));
        Assert.Equal(created.Name + " (renamed)", adminView.Items[0].Changes["Name"].New);
        Assert.Empty(supervisorView!.Items);
    }

    /// <summary>A tree removal case type: three fields, Assessment (PZ) → Removal (PW).</summary>
    private async Task<SaveCaseTypeRequest> NewRequestAsync()
    {
        var code = UniqueCode();
        return new SaveCaseTypeRequest(
            $"Tree Removal {code}",
            code.ToLowerInvariant(),
            "Removal of hazardous trees on public land.",
            [
                new CaseTypeFieldInput(null, "treeCount", "Number of Trees", FieldDataType.Number, true, null),
                new CaseTypeFieldInput(null, "species", "Species", FieldDataType.Select, true, ["Oak", "Maple", "Pine"]),
                new CaseTypeFieldInput(null, "hazard", "Hazard", FieldDataType.Checkbox, false, null),
            ],
            [
                new WorkflowStepInput(null, "Assessment", await DepartmentIdAsync(factory, "PZ"), 5,
                    [TaskOutcome.Complete, TaskOutcome.Reject]),
                new WorkflowStepInput(null, "Removal", await DepartmentIdAsync(factory, "PW"), 10,
                    [TaskOutcome.Approve, TaskOutcome.Reject, TaskOutcome.Return]),
            ]);
    }

    private static async Task<AdminCaseTypeDto> CreateAsync(HttpClient admin, SaveCaseTypeRequest request)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/case-types", request, TestJson.Options);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AdminCaseTypeDto>(TestJson.Options))!;
    }

    private static Task<HttpResponseMessage> Put(
        HttpClient admin, AdminCaseTypeDto current, Func<SaveCaseTypeRequest, SaveCaseTypeRequest> change) =>
        admin.PutAsJsonAsync($"/api/admin/case-types/{current.Id}", change(ToRequest(current)), TestJson.Options);

    private static SaveCaseTypeRequest ToRequest(AdminCaseTypeDto caseType) => new(
        caseType.Name,
        caseType.Prefix,
        caseType.Description,
        caseType.Fields.Select(Field).ToList(),
        caseType.Steps.Select(Step).ToList(),
        caseType.IsActive);

    private static CaseTypeFieldInput Field(AdminCaseTypeFieldDto f) => new(f.Id, f.Key, f.Label, f.DataType, f.IsRequired, f.Options);

    private static WorkflowStepInput Step(AdminWorkflowStepDto s) => new(s.Id, s.Name, s.DepartmentId, s.SlaDays, s.AllowedOutcomes);

    private static async Task AssertValidationErrorAsync(HttpResponseMessage response, string key)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{(int)response.StatusCode}: {body}");
        var problem = System.Text.Json.JsonSerializer.Deserialize<ValidationProblemDetails>(body, TestJson.Options);
        Assert.True(problem!.Errors.ContainsKey(key), $"Expected an error for '{key}': {body}");
    }
}
