using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Workflow;

/// <summary>
/// Moves cases and their tasks through the workflow. It works on loaded entities only (a case with
/// its tasks, and each task's step template) and never touches the database, so the services decide
/// what to load and save, and the rules here are unit-testable on their own.
/// </summary>
/// <remarks>
/// Tasks are step <em>instances</em>. Returning a step, or reopening a case, adds a new instance
/// instead of rewinding a completed one, so every completed task keeps its outcome and notes.
/// A case's current step is its single Active task; the next step is its lowest Pending one.
/// </remarks>
public sealed class WorkflowEngine(TimeProvider timeProvider)
{
    /// <summary>Task actions (claim, complete) need a case that's open or in progress.</summary>
    public static bool AcceptsWork(Case @case) => @case.Status is CaseStatus.Open or CaseStatus.InProgress;

    /// <summary>Assignment also works while a case is on hold, so supervisors can rebalance.</summary>
    public static bool AcceptsAssignment(Case @case) => AcceptsWork(@case) || @case.Status == CaseStatus.OnHold;

    public static bool CanHold(Case @case) => AcceptsWork(@case);

    public static bool CanCancel(Case @case) => AcceptsAssignment(@case);

    public static bool CanReopen(Case @case) => @case.Status is CaseStatus.OnHold or CaseStatus.Closed or CaseStatus.Cancelled;

    /// <summary>
    /// Starts a new case: a task per step, with the first one active in its department's queue.
    /// The case is due when every step's SLA has run.
    /// </summary>
    public void Start(Case @case, IEnumerable<WorkflowStepTemplate> steps)
    {
        var ordered = steps.OrderBy(s => s.SortOrder).ToList();
        if (ordered.Count == 0)
        {
            throw new ConflictException("This case type has no workflow steps, so a case can't be started.");
        }

        @case.Status = CaseStatus.Open;
        @case.Resolution = null;
        @case.CreatedAt = timeProvider.GetUtcNow();
        @case.DueDate = timeProvider.GetToday().AddDays(ordered.Sum(s => s.SlaDays));
        @case.Tasks = ordered
            .Select(step => new WorkflowTask
            {
                StepTemplate = step,
                StepTemplateId = step.Id,
                Name = step.Name,
                Sequence = step.SortOrder,
                DepartmentId = step.DepartmentId,
                Status = WorkflowTaskStatus.Pending,
            })
            .ToList();

        Activate(@case.Tasks.First(), assigneeId: null);
    }

    /// <summary>Takes an unassigned active task from the queue.</summary>
    public void Claim(Case @case, WorkflowTask task, int userId)
    {
        EnsureAcceptsWork(@case);
        EnsureActive(task);
        if (task.AssigneeId is not null)
        {
            throw new ConflictException(task.AssigneeId == userId
                ? "You have already claimed this task."
                : "This task has already been claimed by someone else.");
        }

        task.AssigneeId = userId;
        @case.Status = ProgressStatus(@case);
    }

    /// <summary>Assigns an active task to someone, or returns it to the queue when <paramref name="assigneeId"/> is null.</summary>
    public void Assign(Case @case, WorkflowTask task, int? assigneeId)
    {
        if (!AcceptsAssignment(@case))
        {
            throw new ConflictException($"Tasks on a {Describe(@case.Status)} case can't be reassigned.");
        }

        EnsureActive(task);
        task.AssigneeId = assigneeId;
        if (@case.Status != CaseStatus.OnHold)
        {
            @case.Status = ProgressStatus(@case);
        }
    }

    /// <summary>
    /// Records an outcome for the active task and moves the case on:
    /// <list type="bullet">
    /// <item>Complete / Approve activate the next step, or close the case (Completed) after the last one.</item>
    /// <item>Return sends the case back to the previous step, to whoever completed it.</item>
    /// <item>Reject closes the case (Rejected).</item>
    /// <item>Request Info leaves the task active and puts the case on hold until it's resumed.</item>
    /// </list>
    /// </summary>
    /// <param name="completedById">Recorded as the assignee if the task was still unassigned.</param>
    public void Complete(Case @case, WorkflowTask task, TaskOutcome outcome, string? notes, int completedById)
    {
        EnsureAcceptsWork(@case);
        EnsureActive(task);
        if (!TaskOutcomes.IsSingle(outcome) || !task.StepTemplate.AllowedOutcomes.HasFlag(outcome))
        {
            var allowed = string.Join(", ", TaskOutcomes.Split(task.StepTemplate.AllowedOutcomes));
            throw Validation.Fail("Outcome", $"The '{task.Name}' step allows these outcomes: {allowed}.");
        }

        WorkflowTask? previous = null;
        if (outcome == TaskOutcome.Return)
        {
            previous = LatestCompletedBefore(@case, task)
                ?? throw Validation.Fail("Outcome", "The first step has no previous step to return to.");
        }

        task.AssigneeId ??= completedById;
        task.Notes = notes;

        if (outcome == TaskOutcome.RequestInfo)
        {
            @case.Status = CaseStatus.OnHold;
            return;
        }

        var now = timeProvider.GetUtcNow();
        task.Status = WorkflowTaskStatus.Completed;
        task.Outcome = outcome;
        task.CompletedAt = now;
        @case.Status = CaseStatus.InProgress;

        switch (outcome)
        {
            case TaskOutcome.Reject:
                Close(@case, CaseStatus.Closed, CaseResolution.Rejected, now);
                break;

            case TaskOutcome.Return:
                ResumeAt(@case, previous!, previous!.AssigneeId);
                break;

            default:
                var next = @case.Tasks
                    .Where(t => t.Status == WorkflowTaskStatus.Pending)
                    .MinBy(t => t.Sequence);
                if (next is null)
                {
                    Close(@case, CaseStatus.Closed, CaseResolution.Completed, now);
                }
                else
                {
                    Activate(next, assigneeId: null);
                }

                break;
        }
    }

    /// <summary>Pauses an open or in-progress case. Its active task keeps its assignee.</summary>
    public void Hold(Case @case)
    {
        if (!CanHold(@case))
        {
            throw new ConflictException($"A {Describe(@case.Status)} case can't be put on hold.");
        }

        @case.Status = CaseStatus.OnHold;
    }

    /// <summary>Cancels a case that isn't finished yet; its remaining tasks are skipped.</summary>
    public void Cancel(Case @case)
    {
        if (!CanCancel(@case))
        {
            throw new ConflictException($"A {Describe(@case.Status)} case can't be cancelled.");
        }

        Close(@case, CaseStatus.Cancelled, resolution: null, timeProvider.GetUtcNow());
    }

    /// <summary>
    /// Resumes an on-hold case, or reopens a closed or cancelled one at the step it last reached.
    /// A reopened step goes back to its department's queue, and later steps run again after it.
    /// </summary>
    public void Reopen(Case @case)
    {
        if (!CanReopen(@case))
        {
            throw new ConflictException($"A {Describe(@case.Status)} case is already open.");
        }

        if (@case.Status != CaseStatus.OnHold)
        {
            // Steps started in the same instant (the same transition) tie-break on step order.
            var lastReached = @case.Tasks
                .Where(t => t.StartedAt is not null)
                .OrderBy(t => t.StartedAt)
                .ThenBy(t => t.Sequence)
                .LastOrDefault()
                ?? throw new InvalidOperationException($"Case {@case.Id} was closed without ever starting a step.");

            @case.Resolution = null;
            @case.ClosedAt = null;
            ResumeAt(@case, lastReached, assigneeId: null);
        }

        @case.Status = ProgressStatus(@case);
    }

    private void Activate(WorkflowTask task, int? assigneeId)
    {
        task.Status = WorkflowTaskStatus.Active;
        task.AssigneeId = assigneeId;
        task.Outcome = null;
        task.StartedAt = timeProvider.GetUtcNow();
        task.CompletedAt = null;
        task.DueDate = timeProvider.GetToday().AddDays(task.StepTemplate.SlaDays);
    }

    /// <summary>
    /// Activates a fresh instance of <paramref name="step"/>'s step, and makes sure every later step
    /// has a pending instance to run after it.
    /// </summary>
    private void ResumeAt(Case @case, WorkflowTask step, int? assigneeId)
    {
        var laterSteps = @case.Tasks
            .Where(t => t.Sequence > step.Sequence)
            .GroupBy(t => t.Sequence)
            .ToList();

        var resumed = NewInstanceOf(step);
        @case.Tasks.Add(resumed);
        Activate(resumed, assigneeId);

        foreach (var instances in laterSteps)
        {
            if (!instances.Any(t => t.Status is WorkflowTaskStatus.Pending or WorkflowTaskStatus.Active))
            {
                @case.Tasks.Add(NewInstanceOf(instances.First()));
            }
        }
    }

    private static WorkflowTask NewInstanceOf(WorkflowTask task) => new()
    {
        CaseId = task.CaseId,
        StepTemplate = task.StepTemplate,
        StepTemplateId = task.StepTemplateId,
        Name = task.Name,
        Sequence = task.Sequence,
        DepartmentId = task.DepartmentId,
        Status = WorkflowTaskStatus.Pending,
    };

    /// <summary>The most recently completed instance of the step before <paramref name="task"/>'s.</summary>
    private static WorkflowTask? LatestCompletedBefore(Case @case, WorkflowTask task) =>
        @case.Tasks
            .Where(t => t.Sequence < task.Sequence && t.Status == WorkflowTaskStatus.Completed)
            .OrderBy(t => t.Sequence)
            .ThenBy(t => t.CompletedAt)
            .LastOrDefault();

    private static void Close(Case @case, CaseStatus status, CaseResolution? resolution, DateTimeOffset closedAt)
    {
        @case.Status = status;
        @case.Resolution = resolution;
        @case.ClosedAt = closedAt;

        foreach (var task in @case.Tasks.Where(t => t.Status is WorkflowTaskStatus.Pending or WorkflowTaskStatus.Active))
        {
            task.Status = WorkflowTaskStatus.Skipped;
        }
    }

    /// <summary>Open until someone picks up the work; in progress once anyone has.</summary>
    private static CaseStatus ProgressStatus(Case @case) =>
        @case.Tasks.Any(t => t.Status == WorkflowTaskStatus.Completed
            || (t.Status == WorkflowTaskStatus.Active && t.AssigneeId is not null))
            ? CaseStatus.InProgress
            : CaseStatus.Open;

    private static void EnsureAcceptsWork(Case @case)
    {
        if (!AcceptsWork(@case))
        {
            throw new ConflictException($"Work can't be done on a {Describe(@case.Status)} case.");
        }
    }

    private static void EnsureActive(WorkflowTask task)
    {
        if (task.Status != WorkflowTaskStatus.Active)
        {
            throw new ConflictException($"The '{task.Name}' task is {task.Status.ToString().ToLowerInvariant()}, not active.");
        }
    }

    private static string Describe(CaseStatus status) => status switch
    {
        CaseStatus.InProgress => "in-progress",
        CaseStatus.OnHold => "on-hold",
        _ => status.ToString().ToLowerInvariant(),
    };
}
