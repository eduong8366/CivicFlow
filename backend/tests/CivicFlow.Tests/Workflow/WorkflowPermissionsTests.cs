using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Tests.Workflow;

public class WorkflowPermissionsTests
{
    private const int Planning = 1;
    private const int PublicWorks = 2;
    private const int Clerk = 3;

    private const int Creator = 100;
    private const int PlanningWorker = 101;
    private const int ClerkBorrowedWorker = 102;

    /// <summary>
    /// Created by a Clerk's Office user; Intake (Planning, done by a planner) is complete, Inspection
    /// (Public Works) is active and assigned to someone from the Clerk's Office.
    /// </summary>
    private static Case SampleCase() => new()
    {
        CreatedById = Creator,
        Status = CaseStatus.InProgress,
        Tasks =
        [
            new() { DepartmentId = Planning, AssigneeId = PlanningWorker, Status = WorkflowTaskStatus.Completed },
            new() { DepartmentId = PublicWorks, AssigneeId = ClerkBorrowedWorker, Status = WorkflowTaskStatus.Active },
        ],
    };

    private static WorkflowTask ActiveTask(Case @case) => @case.Tasks.Single(t => t.Status == WorkflowTaskStatus.Active);

    public static TheoryData<string, Actor, bool> ViewCases => new()
    {
        { "admin anywhere", new Actor(1, UserRole.Admin, null), true },
        { "supervisor of a department on the case", new Actor(2, UserRole.Supervisor, Planning), true },
        { "supervisor of another department", new Actor(3, UserRole.Supervisor, Clerk), false },
        { "staff of a department on the case", new Actor(4, UserRole.Staff, PublicWorks), true },
        { "staff of another department", new Actor(5, UserRole.Staff, Clerk), false },
        { "staff assigned from another department", new Actor(ClerkBorrowedWorker, UserRole.Staff, Clerk), true },
        { "creator from another department", new Actor(Creator, UserRole.Staff, Clerk), true },
    };

    [Theory]
    [MemberData(nameof(ViewCases))]
    public void Case_visibility_follows_the_permission_matrix(string who, Actor actor, bool expected)
    {
        var canView = WorkflowPermissions.CanView(actor).Compile();

        Assert.True(expected == canView(SampleCase()), who);
    }

    [Theory]
    [InlineData(UserRole.Staff, PublicWorks, true)]
    [InlineData(UserRole.Supervisor, PublicWorks, true)]
    [InlineData(UserRole.Staff, Planning, false)]
    [InlineData(UserRole.Admin, Clerk, true)]
    public void Claiming_is_limited_to_the_task_department(UserRole role, int department, bool expected)
    {
        var @case = SampleCase();

        Assert.Equal(expected, WorkflowPermissions.CanClaim(new Actor(50, role, department), ActiveTask(@case)));
    }

    [Theory]
    [InlineData(UserRole.Staff, PublicWorks, false)]
    [InlineData(UserRole.Supervisor, PublicWorks, true)]
    [InlineData(UserRole.Supervisor, Planning, false)]
    [InlineData(UserRole.Admin, Clerk, true)]
    public void Only_department_supervisors_and_admins_assign(UserRole role, int department, bool expected)
    {
        var @case = SampleCase();

        Assert.Equal(expected, WorkflowPermissions.CanAssign(new Actor(50, role, department), ActiveTask(@case)));
    }

    [Theory]
    [InlineData(ClerkBorrowedWorker, UserRole.Staff, Clerk, true)] // the assignee
    [InlineData(50, UserRole.Staff, PublicWorks, false)] // a colleague in the same department
    [InlineData(50, UserRole.Supervisor, PublicWorks, true)]
    [InlineData(50, UserRole.Supervisor, Planning, false)]
    [InlineData(50, UserRole.Admin, null, true)]
    public void Only_the_assignee_a_department_supervisor_or_an_admin_completes(int userId, UserRole role, int? department, bool expected)
    {
        var @case = SampleCase();

        Assert.Equal(expected, WorkflowPermissions.CanComplete(new Actor(userId, role, department), ActiveTask(@case)));
    }

    [Theory]
    [InlineData(UserRole.Staff, PublicWorks, false)]
    [InlineData(UserRole.Supervisor, Planning, true)] // any department the case involves, not only the current one
    [InlineData(UserRole.Supervisor, Clerk, false)]
    [InlineData(UserRole.Admin, null, true)]
    public void Case_status_changes_need_an_involved_supervisor_or_an_admin(UserRole role, int? department, bool expected)
    {
        Assert.Equal(expected, WorkflowPermissions.CanManage(new Actor(50, role, department), SampleCase()));
    }

    [Fact]
    public void The_active_task_assignee_may_resume_an_on_hold_case_but_not_reopen_a_closed_one()
    {
        var assignee = new Actor(ClerkBorrowedWorker, UserRole.Staff, Clerk);
        var @case = SampleCase();

        @case.Status = CaseStatus.OnHold;
        Assert.True(WorkflowPermissions.CanReopen(assignee, @case));

        @case.Status = CaseStatus.Cancelled;
        Assert.False(WorkflowPermissions.CanReopen(assignee, @case));
    }
}
