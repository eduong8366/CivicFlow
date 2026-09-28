using CivicFlow.Application.Audit;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Tests.Audit;

public class AuditActionsTests
{
    private const int Actor = 7;

    private static Dictionary<string, AuditChange> Changes(params (string Name, string? Old, string? New)[] changes) =>
        changes.ToDictionary(c => c.Name, c => new AuditChange(c.Old, c.New));

    [Theory]
    [InlineData(EntityState.Added, "Created")]
    [InlineData(EntityState.Deleted, "Deleted")]
    public void Inserts_and_deletes_are_created_and_deleted_whatever_the_type(EntityState state, string expected)
    {
        Assert.Equal(expected, AuditActions.Resolve("WorkflowTask", state, Changes(("Status", null, "Active")), Actor));
    }

    [Theory]
    [InlineData("Open", "OnHold", "PutOnHold")]
    [InlineData("InProgress", "Cancelled", "Cancelled")]
    [InlineData("InProgress", "Closed", "Closed")]
    [InlineData("OnHold", "InProgress", "Resumed")]
    [InlineData("Closed", "Open", "Reopened")]
    [InlineData("Cancelled", "InProgress", "Reopened")]
    [InlineData("Open", "InProgress", "Updated")]
    public void Case_updates_are_named_after_their_status_change(string from, string to, string expected)
    {
        Assert.Equal(expected, AuditActions.Resolve("Case", EntityState.Modified, Changes(("Status", from, to)), Actor));
    }

    [Fact]
    public void Case_updates_without_a_status_change_are_updates()
    {
        Assert.Equal("Updated", AuditActions.Resolve("Case", EntityState.Modified, Changes(("Title", "A", "B")), Actor));
    }

    [Theory]
    [InlineData("Approve", "Approved")]
    [InlineData("Reject", "Rejected")]
    [InlineData("Return", "Returned")]
    [InlineData("Complete", "Completed")]
    public void Completing_a_task_is_named_after_its_outcome(string outcome, string expected)
    {
        var changes = Changes(("Status", "Active", "Completed"), ("Outcome", null, outcome), ("AssigneeId", null, "7"));

        Assert.Equal(expected, AuditActions.Resolve("WorkflowTask", EntityState.Modified, changes, Actor));
    }

    [Theory]
    [InlineData("Pending", "Active", "Activated")]
    [InlineData("Active", "Skipped", "Skipped")]
    public void Other_task_status_changes(string from, string to, string expected)
    {
        Assert.Equal(expected, AuditActions.Resolve("WorkflowTask", EntityState.Modified, Changes(("Status", from, to)), Actor));
    }

    [Theory]
    [InlineData(null, "7", "Claimed")]
    [InlineData(null, "9", "Assigned")]
    [InlineData("9", "7", "Assigned")]
    [InlineData("7", null, "Unassigned")]
    public void Assignee_changes_distinguish_claims_from_assignments(string? from, string? to, string expected)
    {
        Assert.Equal(expected, AuditActions.Resolve("WorkflowTask", EntityState.Modified, Changes(("AssigneeId", from, to)), Actor));
    }

    [Fact]
    public void Notes_on_a_task_that_stays_active_are_an_info_request()
    {
        var changes = Changes(("Notes", null, "Need the site plan."), ("AssigneeId", null, "7"));

        Assert.Equal("InfoRequested", AuditActions.Resolve("WorkflowTask", EntityState.Modified, changes, Actor));
    }

    [Fact]
    public void Updates_to_other_types_are_updates()
    {
        Assert.Equal("Updated", AuditActions.Resolve("User", EntityState.Modified, Changes(("Status", "Open", "OnHold")), Actor));
    }
}
