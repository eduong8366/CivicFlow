using CivicFlow.Application.Admin;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Tests.Admin;

public class SaveCaseTypeRequestValidatorTests
{
    private readonly SaveCaseTypeRequestValidator validator = new();

    private static readonly SaveCaseTypeRequest Valid = new(
        "Tree Removal",
        "TREE",
        null,
        [
            new CaseTypeFieldInput(null, "species", "Species", FieldDataType.Select, true, ["Oak", "Pine"]),
            new CaseTypeFieldInput(null, "hazard", "Hazard", FieldDataType.Checkbox, false, null),
        ],
        [
            new WorkflowStepInput(null, "Assessment", 1, 5, [TaskOutcome.Complete, TaskOutcome.Reject]),
            new WorkflowStepInput(null, "Removal", 2, 10, [TaskOutcome.Approve, TaskOutcome.Return]),
        ]);

    [Fact]
    public void A_complete_definition_is_valid()
    {
        Assert.True(validator.Validate(Valid).IsValid);
    }

    [Fact]
    public void Missing_lists_fail_cleanly()
    {
        var result = validator.Validate(Valid with { Fields = null!, Steps = null! });

        Assert.Contains(result.Errors, e => e.PropertyName == "Fields");
        Assert.Contains(result.Errors, e => e.PropertyName == "Steps");
    }

    [Theory]
    [InlineData(TaskOutcome.None)]
    [InlineData(TaskOutcome.Approve | TaskOutcome.Reject)]
    [InlineData((TaskOutcome)64)]
    public void Each_listed_outcome_is_one_defined_outcome(TaskOutcome outcome)
    {
        var result = validator.Validate(Valid with
        {
            Steps = [Valid.Steps[0] with { AllowedOutcomes = [TaskOutcome.Complete, outcome] }],
        });

        Assert.Contains(result.Errors, e => e.PropertyName == "Steps[0].AllowedOutcomes[1]");
    }

    [Fact]
    public void Step_names_and_ids_are_unique()
    {
        var result = validator.Validate(Valid with
        {
            Steps = [Valid.Steps[0] with { Id = 7 }, Valid.Steps[1] with { Id = 7, Name = "assessment" }],
        });

        Assert.Contains(result.Errors, e => e.ErrorMessage == "Each step needs a different name.");
        Assert.Contains(result.Errors, e => e.ErrorMessage == "Each step can appear only once.");
    }

    [Fact]
    public void Select_options_must_be_distinct()
    {
        var result = validator.Validate(Valid with
        {
            Fields = [Valid.Fields[0] with { Options = ["Oak", " oak "] }],
        });

        Assert.Contains(result.Errors, e => e.PropertyName == "Fields[0].Options");
    }

    [Fact]
    public void Sla_days_are_bounded()
    {
        var result = validator.Validate(Valid with
        {
            Steps = [Valid.Steps[0] with { SlaDays = -1 }, Valid.Steps[1] with { SlaDays = WorkflowStepInputValidator.MaxSlaDays + 1 }],
        });

        Assert.Contains(result.Errors, e => e.PropertyName == "Steps[0].SlaDays");
        Assert.Contains(result.Errors, e => e.PropertyName == "Steps[1].SlaDays");
    }
}
