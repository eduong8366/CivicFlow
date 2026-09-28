using System.Numerics;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Workflow;

public static class TaskOutcomes
{
    private static readonly TaskOutcome[] All = Enum.GetValues<TaskOutcome>().Where(o => o != TaskOutcome.None).ToArray();

    /// <summary>Splits a step's allowed-outcomes flags into a list, in declaration order.</summary>
    public static IReadOnlyList<TaskOutcome> Split(TaskOutcome outcomes) =>
        All.Where(o => outcomes.HasFlag(o)).ToList();

    /// <summary>True for exactly one defined outcome, which is what a completed task records.</summary>
    public static bool IsSingle(TaskOutcome outcome) =>
        outcome != TaskOutcome.None && BitOperations.IsPow2((uint)outcome) && Enum.IsDefined(outcome);
}
