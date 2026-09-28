using System.Net;
using System.Net.Http.Json;
using CivicFlow.Application.Common;
using CivicFlow.Application.Tasks;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using static CivicFlow.Tests.Integration.CaseApi;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class TaskEndpointTests(CivicFlowApiFactory factory)
{
    [Fact]
    public async Task Building_permit_runs_through_every_step_across_departments_to_closed()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var planningSupervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var inspector = await factory.CreateClientAsAsync("pw.staff1@civicflow.test");
        var created = await CreateBuildingPermitAsync(planner);

        // Intake: claimed from the Planning queue, then completed by the claimer.
        var @case = await ReadCaseAsync(await ClaimAsync(planner, ActiveTask(created).Id));
        Assert.Equal(CaseStatus.InProgress, @case.Status);
        Assert.Equal("Luis Ortega", ActiveTask(@case).AssigneeName);
        Assert.True(ActiveTask(@case).Actions.CanComplete);
        @case = await ReadCaseAsync(await CompleteAsync(planner, ActiveTask(@case).Id, TaskOutcome.Complete, "Application complete."));

        // Plan Review: a supervisor may complete an unassigned task in their department.
        Assert.Equal("Plan Review", ActiveTask(@case).Name);
        @case = await ReadCaseAsync(await CompleteAsync(planningSupervisor, ActiveTask(@case).Id, TaskOutcome.Approve));
        Assert.Equal("Dana Whitfield", @case.Tasks.Single(t => t.Name == "Plan Review").AssigneeName);

        // Inspection moves to Public Works.
        var inspection = ActiveTask(@case);
        Assert.Equal("Public Works", inspection.DepartmentName);
        await ReadCaseAsync(await ClaimAsync(inspector, inspection.Id));
        @case = await ReadCaseAsync(await CompleteAsync(inspector, inspection.Id, TaskOutcome.Approve, "Passed on site."));

        // Issuance, back in Planning, is the last step.
        Assert.Equal("Issuance", ActiveTask(@case).Name);
        @case = await ReadCaseAsync(await CompleteAsync(planningSupervisor, ActiveTask(@case).Id, TaskOutcome.Complete));

        Assert.Equal(CaseStatus.Closed, @case.Status);
        Assert.Equal(CaseResolution.Completed, @case.Resolution);
        Assert.NotNull(@case.ClosedAt);
        Assert.All(@case.Tasks, t => Assert.Equal(WorkflowTaskStatus.Completed, t.Status));
        Assert.Equal(new[] { TaskOutcome.Complete, TaskOutcome.Approve, TaskOutcome.Approve, TaskOutcome.Complete },
            @case.Tasks.Select(t => t.Outcome!.Value));
    }

    [Fact]
    public async Task Claiming_moves_a_task_from_the_queue_to_my_work()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff2@civicflow.test");
        var created = await CreateBuildingPermitAsync(planner);
        var taskId = ActiveTask(created).Id;

        var queueBefore = await planner.GetFromJsonAsync<PagedResult<TaskListItemDto>>("/api/tasks/queue?pageSize=100", TestJson.Options);
        var queued = Assert.Single(queueBefore!.Items, t => t.Id == taskId);
        Assert.Equal(created.CaseNumber, queued.CaseNumber);
        Assert.Equal(CasePriority.High, queued.CasePriority);
        Assert.All(queueBefore.Items, t => Assert.Equal("Planning & Zoning", t.DepartmentName));

        await ReadCaseAsync(await ClaimAsync(planner, taskId));

        var queueAfter = await planner.GetFromJsonAsync<PagedResult<TaskListItemDto>>("/api/tasks/queue?pageSize=100", TestJson.Options);
        var mine = await planner.GetFromJsonAsync<PagedResult<TaskListItemDto>>("/api/tasks/mine?pageSize=100", TestJson.Options);
        Assert.DoesNotContain(queueAfter!.Items, t => t.Id == taskId);
        Assert.Contains(mine!.Items, t => t.Id == taskId);
        Assert.All(mine.Items, t => Assert.Equal("Priya Raman", t.AssigneeName));
        Assert.Equal(mine.Items.Select(t => t.DueDate).Order(), mine.Items.Select(t => t.DueDate));
    }

    [Fact]
    public async Task Claiming_an_already_claimed_task_is_409()
    {
        var created = await CreateBuildingPermitAsync(await factory.CreateClientAsAsync("pz.staff1@civicflow.test"));
        var taskId = ActiveTask(created).Id;
        await ReadCaseAsync(await ClaimAsync(await factory.CreateClientAsAsync("pz.staff1@civicflow.test"), taskId));

        var response = await ClaimAsync(await factory.CreateClientAsAsync("pz.staff2@civicflow.test"), taskId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Tasks_outside_your_department_cannot_be_claimed()
    {
        var created = await CreateBuildingPermitAsync(await factory.CreateClientAsAsync("pz.staff1@civicflow.test"));

        var response = await ClaimAsync(await factory.CreateClientAsAsync("pw.staff1@civicflow.test"), ActiveTask(created).Id);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Only_the_assignee_completes_a_staff_task()
    {
        var owner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var created = await CreateBuildingPermitAsync(owner);
        var taskId = ActiveTask(created).Id;
        await ReadCaseAsync(await ClaimAsync(owner, taskId));

        var colleague = await CompleteAsync(await factory.CreateClientAsAsync("pz.staff2@civicflow.test"), taskId, TaskOutcome.Complete);
        var unknownTask = await CompleteAsync(owner, 999_999, TaskOutcome.Complete);

        Assert.Equal(HttpStatusCode.Forbidden, colleague.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknownTask.StatusCode);
    }

    [Fact]
    public async Task Staff_cannot_assign_tasks()
    {
        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var created = await CreateBuildingPermitAsync(staff);

        var response = await AssignAsync(staff, ActiveTask(created).Id, await UserIdAsync(factory, "pz.staff2@civicflow.test"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Supervisors_assign_within_their_own_department_only()
    {
        var created = await CreateBuildingPermitAsync(await factory.CreateClientAsAsync("pz.staff1@civicflow.test"));
        var taskId = ActiveTask(created).Id;
        var planningSupervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var planner = await UserIdAsync(factory, "pz.staff2@civicflow.test");

        var otherSupervisor = await AssignAsync(await factory.CreateClientAsAsync("ce.supervisor@civicflow.test"), taskId, planner);
        var outsideAssignee = await AssignAsync(planningSupervisor, taskId, await UserIdAsync(factory, "pw.staff1@civicflow.test"));
        var assigned = await ReadCaseAsync(await AssignAsync(planningSupervisor, taskId, planner));

        Assert.Equal(HttpStatusCode.Forbidden, otherSupervisor.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, outsideAssignee.StatusCode);
        Assert.Contains("AssigneeId", (await outsideAssignee.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors.Keys);
        Assert.Equal(planner, ActiveTask(assigned).AssigneeId);
        Assert.Equal(CaseStatus.InProgress, assigned.Status);

        // Unassigning returns the task to the queue.
        var unassigned = await ReadCaseAsync(await AssignAsync(planningSupervisor, taskId, null));
        Assert.Null(ActiveTask(unassigned).AssigneeId);
        Assert.Equal(CaseStatus.Open, unassigned.Status);
    }

    [Fact]
    public async Task Return_sends_the_case_back_to_whoever_did_the_previous_step()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var reviewer = await factory.CreateClientAsAsync("pz.staff2@civicflow.test");
        var created = await CreateBuildingPermitAsync(planner);
        var intakeId = ActiveTask(created).Id;
        await ReadCaseAsync(await ClaimAsync(planner, intakeId));
        var @case = await ReadCaseAsync(await CompleteAsync(planner, intakeId, TaskOutcome.Complete));
        var reviewId = ActiveTask(@case).Id;
        await ReadCaseAsync(await ClaimAsync(reviewer, reviewId));

        var withoutNotes = await CompleteAsync(reviewer, reviewId, TaskOutcome.Return);
        @case = await ReadCaseAsync(await CompleteAsync(reviewer, reviewId, TaskOutcome.Return, "Site plan is missing."));

        Assert.Equal(HttpStatusCode.BadRequest, withoutNotes.StatusCode);
        var intakeAgain = ActiveTask(@case);
        Assert.Equal("Intake", intakeAgain.Name);
        Assert.NotEqual(intakeId, intakeAgain.Id);
        Assert.Equal("Luis Ortega", intakeAgain.AssigneeName);
        var returned = @case.Tasks.Single(t => t.Id == reviewId);
        Assert.Equal(TaskOutcome.Return, returned.Outcome);
        Assert.Equal("Site plan is missing.", returned.Notes);
    }

    [Fact]
    public async Task Reject_closes_the_case_as_rejected()
    {
        var supervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var created = await CreateBuildingPermitAsync(supervisor);

        var @case = await ReadCaseAsync(await CompleteAsync(supervisor, ActiveTask(created).Id, TaskOutcome.Reject, "Outside city limits."));

        Assert.Equal(CaseStatus.Closed, @case.Status);
        Assert.Equal(CaseResolution.Rejected, @case.Resolution);
        Assert.Equal(3, @case.Tasks.Count(t => t.Status == WorkflowTaskStatus.Skipped));
    }

    [Fact]
    public async Task An_outcome_the_step_does_not_allow_is_400()
    {
        var supervisor = await factory.CreateClientAsAsync("pz.supervisor@civicflow.test");
        var created = await CreateBuildingPermitAsync(supervisor);

        // Intake allows Complete, Reject and Request Info, not Approve.
        var response = await CompleteAsync(supervisor, ActiveTask(created).Id, TaskOutcome.Approve);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Outcome", (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors.Keys);
    }

    [Fact]
    public async Task Request_info_holds_the_case_and_its_assignee_can_resume_it()
    {
        var planner = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var created = await CreateBuildingPermitAsync(planner);
        var taskId = ActiveTask(created).Id;
        await ReadCaseAsync(await ClaimAsync(planner, taskId));

        var held = await ReadCaseAsync(await CompleteAsync(planner, taskId, TaskOutcome.RequestInfo, "Need the contractor license."));
        Assert.Equal(CaseStatus.OnHold, held.Status);
        Assert.True(held.Actions.CanReopen);

        var resumed = await ReadCaseAsync(await planner.PostAsync($"/api/cases/{created.Id}/reopen", null));
        Assert.Equal(CaseStatus.InProgress, resumed.Status);
        Assert.Equal(taskId, ActiveTask(resumed).Id);
    }

    [Fact]
    public async Task Queues_of_other_departments_are_for_admins_only()
    {
        int publicWorksId;
        await using (var db = factory.CreateDbContext())
        {
            publicWorksId = db.Departments.Single(d => d.Code == "PW").Id;
        }

        var staff = await factory.CreateClientAsAsync("pz.staff1@civicflow.test");
        var admin = await factory.CreateClientAsAsync("admin@civicflow.test");

        var staffResponse = await staff.GetAsync($"/api/tasks/queue?departmentId={publicWorksId}");
        var adminQueue = await admin.GetFromJsonAsync<PagedResult<TaskListItemDto>>(
            $"/api/tasks/queue?departmentId={publicWorksId}&pageSize=100", TestJson.Options);
        var allQueues = await admin.GetFromJsonAsync<PagedResult<TaskListItemDto>>("/api/tasks/queue?pageSize=100", TestJson.Options);

        Assert.Equal(HttpStatusCode.Forbidden, staffResponse.StatusCode);
        Assert.All(adminQueue!.Items, t => Assert.Equal(publicWorksId, t.DepartmentId));
        Assert.True(allQueues!.Items.Select(t => t.DepartmentId).Distinct().Count() > 1);
        Assert.All(allQueues.Items, t =>
        {
            Assert.Null(t.AssigneeId);
            Assert.Contains(t.CaseStatus, new[] { CaseStatus.Open, CaseStatus.InProgress });
        });
    }
}
