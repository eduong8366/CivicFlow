using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;

namespace CivicFlow.Tests.Workflow;

public class WorkflowEngineTests
{
    private const int Planning = 1;
    private const int PublicWorks = 2;
    private const int Alice = 10;
    private const int Bob = 11;

    private static readonly DateTimeOffset Now = new(2026, 9, 27, 15, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 9, 27);

    private readonly FixedTimeProvider time = new(Now);
    private readonly WorkflowEngine engine;

    public WorkflowEngineTests() => engine = new WorkflowEngine(time);

    // Intake (PZ, 2 days) → Review (PZ, 10 days) → Inspection (PW, 5 days)
    private static List<WorkflowStepTemplate> Steps() =>
    [
        new() { Name = "Intake", SortOrder = 1, DepartmentId = Planning, SlaDays = 2,
            AllowedOutcomes = TaskOutcome.Complete | TaskOutcome.Reject | TaskOutcome.RequestInfo },
        new() { Name = "Review", SortOrder = 2, DepartmentId = Planning, SlaDays = 10,
            AllowedOutcomes = TaskOutcome.Approve | TaskOutcome.Reject | TaskOutcome.Return },
        new() { Name = "Inspection", SortOrder = 3, DepartmentId = PublicWorks, SlaDays = 5,
            AllowedOutcomes = TaskOutcome.Approve | TaskOutcome.Return },
    ];

    private Case StartCase()
    {
        var @case = new Case();
        // Out of order on purpose: the engine orders steps by SortOrder.
        engine.Start(@case, Steps().OrderByDescending(s => s.SortOrder));
        return @case;
    }

    private static WorkflowTask Active(Case @case) => @case.Tasks.Single(t => t.Status == WorkflowTaskStatus.Active);

    private static List<WorkflowTask> Instances(Case @case, string step) => @case.Tasks.Where(t => t.Name == step).ToList();

    [Fact]
    public void Start_creates_a_task_per_step_with_the_first_in_its_department_queue()
    {
        var @case = StartCase();

        Assert.Equal(CaseStatus.Open, @case.Status);
        Assert.Equal(Now, @case.CreatedAt);
        Assert.Equal(Today.AddDays(17), @case.DueDate);
        Assert.Equal(["Intake", "Review", "Inspection"], @case.Tasks.Select(t => t.Name));
        Assert.Equal([1, 2, 3], @case.Tasks.Select(t => t.Sequence));

        var intake = Active(@case);
        Assert.Equal("Intake", intake.Name);
        Assert.Equal(Planning, intake.DepartmentId);
        Assert.Null(intake.AssigneeId);
        Assert.Equal(Now, intake.StartedAt);
        Assert.Equal(Today.AddDays(2), intake.DueDate);

        Assert.All(@case.Tasks.Skip(1), t =>
        {
            Assert.Equal(WorkflowTaskStatus.Pending, t.Status);
            Assert.Null(t.DueDate);
            Assert.Null(t.StartedAt);
        });
    }

    [Fact]
    public void Start_refuses_a_case_type_without_steps()
    {
        Assert.Throws<ConflictException>(() => engine.Start(new Case(), []));
    }

    [Fact]
    public void Claim_assigns_the_task_and_puts_the_case_in_progress()
    {
        var @case = StartCase();

        engine.Claim(@case, Active(@case), Alice);

        Assert.Equal(Alice, Active(@case).AssigneeId);
        Assert.Equal(CaseStatus.InProgress, @case.Status);
    }

    [Fact]
    public void Claiming_a_claimed_task_conflicts()
    {
        var @case = StartCase();
        engine.Claim(@case, Active(@case), Alice);

        Assert.Throws<ConflictException>(() => engine.Claim(@case, Active(@case), Bob));
        Assert.Equal(Alice, Active(@case).AssigneeId);
    }

    [Fact]
    public void Unassigning_the_only_touched_task_returns_the_case_to_open()
    {
        var @case = StartCase();
        engine.Assign(@case, Active(@case), Alice);
        Assert.Equal(CaseStatus.InProgress, @case.Status);

        engine.Assign(@case, Active(@case), null);

        Assert.Null(Active(@case).AssigneeId);
        Assert.Equal(CaseStatus.Open, @case.Status);
    }

    [Fact]
    public void Completing_a_step_activates_the_next_one_in_its_queue()
    {
        var @case = StartCase();
        var intake = Active(@case);
        engine.Claim(@case, intake, Alice);
        time.Advance(TimeSpan.FromDays(1));

        engine.Complete(@case, intake, TaskOutcome.Complete, "Looks good.", Alice);

        Assert.Equal(WorkflowTaskStatus.Completed, intake.Status);
        Assert.Equal(TaskOutcome.Complete, intake.Outcome);
        Assert.Equal("Looks good.", intake.Notes);
        Assert.Equal(Now.AddDays(1), intake.CompletedAt);

        var review = Active(@case);
        Assert.Equal("Review", review.Name);
        Assert.Null(review.AssigneeId);
        Assert.Equal(Now.AddDays(1), review.StartedAt);
        Assert.Equal(Today.AddDays(1 + 10), review.DueDate);
        Assert.Equal(CaseStatus.InProgress, @case.Status);
    }

    [Fact]
    public void Completing_an_unassigned_task_records_who_completed_it()
    {
        var @case = StartCase();
        var intake = Active(@case);

        engine.Complete(@case, intake, TaskOutcome.Complete, null, Bob);

        Assert.Equal(Bob, intake.AssigneeId);
    }

    [Fact]
    public void Completing_the_last_step_closes_the_case_as_completed()
    {
        var @case = StartCase();
        engine.Complete(@case, Active(@case), TaskOutcome.Complete, null, Alice);
        engine.Complete(@case, Active(@case), TaskOutcome.Approve, null, Alice);
        time.Advance(TimeSpan.FromHours(3));

        engine.Complete(@case, Active(@case), TaskOutcome.Approve, null, Bob);

        Assert.Equal(CaseStatus.Closed, @case.Status);
        Assert.Equal(CaseResolution.Completed, @case.Resolution);
        Assert.Equal(Now.AddHours(3), @case.ClosedAt);
        Assert.All(@case.Tasks, t => Assert.Equal(WorkflowTaskStatus.Completed, t.Status));
    }

    [Fact]
    public void Return_reactivates_the_previous_step_for_its_worker_and_keeps_history()
    {
        var @case = StartCase();
        engine.Complete(@case, Active(@case), TaskOutcome.Complete, "Intake done.", Alice);
        var review = Active(@case);
        engine.Claim(@case, review, Bob);

        engine.Complete(@case, review, TaskOutcome.Return, "Missing site plan.", Bob);

        // The original instances keep their outcomes; new ones carry the work forward.
        var intakes = Instances(@case, "Intake");
        Assert.Equal(2, intakes.Count);
        Assert.Equal(TaskOutcome.Complete, intakes[0].Outcome);
        Assert.Equal(WorkflowTaskStatus.Active, intakes[1].Status);
        Assert.Equal(Alice, intakes[1].AssigneeId);

        var reviews = Instances(@case, "Review");
        Assert.Equal(2, reviews.Count);
        Assert.Equal(TaskOutcome.Return, reviews[0].Outcome);
        Assert.Equal("Missing site plan.", reviews[0].Notes);
        Assert.Equal(WorkflowTaskStatus.Pending, reviews[1].Status);

        Assert.Single(Instances(@case, "Inspection"));
        Assert.Equal(CaseStatus.InProgress, @case.Status);

        // Finishing intake again moves on to the fresh review instance.
        engine.Complete(@case, intakes[1], TaskOutcome.Complete, null, Alice);
        Assert.Same(reviews[1], Active(@case));
    }

    [Fact]
    public void Return_from_the_first_step_is_invalid()
    {
        var steps = Steps();
        steps[0].AllowedOutcomes |= TaskOutcome.Return;
        var @case = new Case();
        engine.Start(@case, steps);
        var intake = Active(@case);

        Assert.Throws<ValidationException>(() => engine.Complete(@case, intake, TaskOutcome.Return, "Back.", Alice));
        Assert.Equal(WorkflowTaskStatus.Active, intake.Status);
    }

    [Fact]
    public void Reject_closes_the_case_as_rejected_and_skips_the_remaining_steps()
    {
        var @case = StartCase();
        engine.Complete(@case, Active(@case), TaskOutcome.Complete, null, Alice);

        engine.Complete(@case, Active(@case), TaskOutcome.Reject, "Setback violation.", Bob);

        Assert.Equal(CaseStatus.Closed, @case.Status);
        Assert.Equal(CaseResolution.Rejected, @case.Resolution);
        Assert.Equal(Now, @case.ClosedAt);
        Assert.Equal(TaskOutcome.Reject, Instances(@case, "Review")[0].Outcome);
        Assert.Equal(WorkflowTaskStatus.Skipped, Instances(@case, "Inspection")[0].Status);
    }

    [Theory]
    [InlineData(TaskOutcome.Approve)] // Intake allows Complete, not Approve.
    [InlineData(TaskOutcome.None)]
    [InlineData(TaskOutcome.Complete | TaskOutcome.Reject)]
    public void Outcomes_the_step_does_not_allow_are_invalid(TaskOutcome outcome)
    {
        var @case = StartCase();

        Assert.Throws<ValidationException>(() => engine.Complete(@case, Active(@case), outcome, null, Alice));
        Assert.Equal(CaseStatus.Open, @case.Status);
    }

    [Fact]
    public void Completing_a_task_that_is_not_active_conflicts()
    {
        var @case = StartCase();
        var pendingReview = Instances(@case, "Review")[0];

        Assert.Throws<ConflictException>(() => engine.Complete(@case, pendingReview, TaskOutcome.Approve, null, Alice));
    }

    [Fact]
    public void Request_info_puts_the_case_on_hold_and_keeps_the_task_active_until_resumed()
    {
        var @case = StartCase();
        var intake = Active(@case);
        engine.Claim(@case, intake, Alice);

        engine.Complete(@case, intake, TaskOutcome.RequestInfo, "Need the parcel number.", Alice);

        Assert.Equal(CaseStatus.OnHold, @case.Status);
        Assert.Equal(WorkflowTaskStatus.Active, intake.Status);
        Assert.Null(intake.Outcome);
        Assert.Equal("Need the parcel number.", intake.Notes);
        Assert.Throws<ConflictException>(() => engine.Complete(@case, intake, TaskOutcome.Complete, null, Alice));

        engine.Reopen(@case);

        Assert.Equal(CaseStatus.InProgress, @case.Status);
        engine.Complete(@case, intake, TaskOutcome.Complete, null, Alice);
        Assert.Equal("Review", Active(@case).Name);
    }

    [Fact]
    public void Hold_blocks_claims_but_not_assignment()
    {
        var @case = StartCase();
        engine.Hold(@case);

        Assert.Equal(CaseStatus.OnHold, @case.Status);
        Assert.Throws<ConflictException>(() => engine.Claim(@case, Active(@case), Alice));

        engine.Assign(@case, Active(@case), Alice);
        Assert.Equal(Alice, Active(@case).AssigneeId);
        Assert.Equal(CaseStatus.OnHold, @case.Status);
    }

    [Fact]
    public void Cancel_skips_the_open_tasks_and_reopen_resumes_at_the_same_step()
    {
        var @case = StartCase();
        engine.Complete(@case, Active(@case), TaskOutcome.Complete, null, Alice);
        engine.Claim(@case, Active(@case), Bob);

        engine.Cancel(@case);

        Assert.Equal(CaseStatus.Cancelled, @case.Status);
        Assert.Null(@case.Resolution);
        Assert.Equal(Now, @case.ClosedAt);
        Assert.DoesNotContain(@case.Tasks, t => t.Status is WorkflowTaskStatus.Active or WorkflowTaskStatus.Pending);

        time.Advance(TimeSpan.FromDays(3));
        engine.Reopen(@case);

        Assert.Equal(CaseStatus.InProgress, @case.Status);
        Assert.Null(@case.ClosedAt);
        var review = Active(@case);
        Assert.Equal("Review", review.Name);
        Assert.Null(review.AssigneeId); // Back to the queue.
        Assert.Equal(Today.AddDays(3 + 10), review.DueDate);
        Assert.Equal(WorkflowTaskStatus.Pending, Instances(@case, "Inspection").Last().Status);
    }

    [Fact]
    public void Reopening_a_closed_case_reruns_its_last_step()
    {
        var @case = StartCase();
        engine.Complete(@case, Active(@case), TaskOutcome.Complete, null, Alice);
        engine.Complete(@case, Active(@case), TaskOutcome.Reject, "Incomplete.", Bob);

        engine.Reopen(@case);

        Assert.Equal(CaseStatus.InProgress, @case.Status);
        Assert.Null(@case.Resolution);
        Assert.Equal("Review", Active(@case).Name);
        Assert.Equal(WorkflowTaskStatus.Pending, Instances(@case, "Inspection").Last().Status);
    }

    [Fact]
    public void Status_changes_that_do_not_fit_the_current_status_conflict()
    {
        var @case = StartCase();
        Assert.Throws<ConflictException>(() => engine.Reopen(@case));

        engine.Cancel(@case);
        Assert.Throws<ConflictException>(() => engine.Hold(@case));
        Assert.Throws<ConflictException>(() => engine.Cancel(@case));
        Assert.Throws<ConflictException>(() => engine.Assign(@case, @case.Tasks.First(), Alice));
    }
}

internal sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset now = now;

    public override DateTimeOffset GetUtcNow() => now;

    public void Advance(TimeSpan by) => now += by;
}
