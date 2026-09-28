using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Enums;
using FluentValidation;

namespace CivicFlow.Application.Admin;

public sealed record AdminCaseTypeListItemDto(
    int Id,
    string Name,
    string Prefix,
    string? Description,
    bool IsActive,
    int FieldCount,
    int StepCount,
    int CaseCount,
    int OpenCaseCount);

/// <summary>
/// A case type as the designer edits it, active or not. <c>InUse</c> marks fields with values on
/// existing cases and steps with tasks on them: those can't be removed, and a used field's data
/// type can't change.
/// </summary>
public sealed record AdminCaseTypeDto(
    int Id,
    string Name,
    string Prefix,
    string? Description,
    bool IsActive,
    int CaseCount,
    IReadOnlyList<AdminCaseTypeFieldDto> Fields,
    IReadOnlyList<AdminWorkflowStepDto> Steps);

public sealed record AdminCaseTypeFieldDto(
    int Id, string Key, string Label, FieldDataType DataType, bool IsRequired, IReadOnlyList<string> Options, int SortOrder, bool InUse);

public sealed record AdminWorkflowStepDto(
    int Id,
    string Name,
    int SortOrder,
    int DepartmentId,
    string DepartmentName,
    bool DepartmentIsActive,
    int SlaDays,
    IReadOnlyList<TaskOutcome> AllowedOutcomes,
    bool InUse);

/// <summary>
/// A case type's whole definition. Fields and steps are listed in form and workflow order, so a
/// drag-and-drop reorder is just a new order here. Items with an <c>Id</c> update that field or
/// step; items without one are added; existing ones left out are removed.
/// </summary>
/// <remarks>
/// Cases already open keep the steps they started with (tasks copy each step's name, order and
/// department), but pick up edits to a step's SLA and allowed outcomes when a step next runs.
/// Renaming the prefix doesn't renumber existing cases.
/// </remarks>
public sealed record SaveCaseTypeRequest(
    string Name,
    string Prefix,
    string? Description,
    IReadOnlyList<CaseTypeFieldInput> Fields,
    IReadOnlyList<WorkflowStepInput> Steps,
    bool IsActive = true);

/// <summary><see cref="Options"/> are the choices of a Select field, and must be empty for other types.</summary>
public sealed record CaseTypeFieldInput(
    int? Id, string Key, string Label, FieldDataType DataType, bool IsRequired, IReadOnlyList<string>? Options);

public sealed record WorkflowStepInput(
    int? Id, string Name, int DepartmentId, int SlaDays, IReadOnlyList<TaskOutcome> AllowedOutcomes);

public sealed class SaveCaseTypeRequestValidator : AbstractValidator<SaveCaseTypeRequest>
{
    public const int MaxFields = 50;
    public const int MaxSteps = 20;

    public SaveCaseTypeRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(100);
        RuleFor(r => r.Prefix).NotEmpty().MaximumLength(10)
            .Matches("^[A-Za-z][A-Za-z0-9]*$")
            .WithMessage("'Prefix' must be letters and digits, starting with a letter.");
        RuleFor(r => r.Description).MaximumLength(500);

        RuleFor(r => r.Fields).Cascade(CascadeMode.Stop).NotNull()
            .Must(f => f.Count <= MaxFields).WithMessage($"A case type can have at most {MaxFields} fields.");
        RuleForEach(r => r.Fields).NotNull().SetValidator(new CaseTypeFieldInputValidator());
        RuleFor(r => r.Fields)
            .Must(f => AreDistinct(f.Where(x => x is not null).Select(x => x.Key?.Trim())))
            .WithMessage("Each field needs a different key.")
            .Must(f => AreDistinct(f.Where(x => x?.Id is not null).Select(x => x.Id.ToString())))
            .WithMessage("Each field can appear only once.")
            .When(r => r.Fields is not null);

        RuleFor(r => r.Steps).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("A case type needs at least one workflow step.")
            .Must(s => s.Count <= MaxSteps).WithMessage($"A case type can have at most {MaxSteps} steps.");
        RuleForEach(r => r.Steps).NotNull().SetValidator(new WorkflowStepInputValidator());
        RuleFor(r => r.Steps)
            .Must(s => AreDistinct(s.Where(x => x is not null).Select(x => x.Name?.Trim())))
            .WithMessage("Each step needs a different name.")
            .Must(s => AreDistinct(s.Where(x => x?.Id is not null).Select(x => x.Id.ToString())))
            .WithMessage("Each step can appear only once.")
            .Must(s => s.Count == 0 || s[0]?.AllowedOutcomes?.Contains(TaskOutcome.Return) != true)
            .WithMessage("The first step can't allow Return, because there is no earlier step to return to.")
            .When(r => r.Steps is not null);
    }

    /// <summary>Case-insensitive, like the database's unique indexes. Blanks are left to the item rules.</summary>
    private static bool AreDistinct(IEnumerable<string?> values)
    {
        var present = values.Where(v => !string.IsNullOrEmpty(v)).ToList();
        return present.Distinct(StringComparer.OrdinalIgnoreCase).Count() == present.Count;
    }
}

public sealed class CaseTypeFieldInputValidator : AbstractValidator<CaseTypeFieldInput>
{
    public const int MaxOptions = 50;

    public CaseTypeFieldInputValidator()
    {
        RuleFor(f => f.Key).NotEmpty().MaximumLength(50)
            .Matches("^[a-z][A-Za-z0-9]*$")
            .WithMessage("'Key' must be camelCase: letters and digits, starting with a lower-case letter.");
        RuleFor(f => f.Label).NotEmpty().MaximumLength(100);
        RuleFor(f => f.DataType).IsInEnum();

        When(f => f.DataType == FieldDataType.Select, () =>
        {
            RuleFor(f => f.Options).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("A select field needs at least one option.")
                .Must(o => o is null || o.Count <= MaxOptions).WithMessage($"A select field can have at most {MaxOptions} options.")
                .Must(o => o is null || o.Select(x => x?.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() == o.Count)
                .WithMessage("Each option must be different.");
            RuleForEach(f => f.Options).NotEmpty().MaximumLength(100);
        }).Otherwise(() =>
        {
            RuleFor(f => f.Options).Must(o => o is null || o.Count == 0).WithMessage("Only select fields have options.");
        });
    }
}

public sealed class WorkflowStepInputValidator : AbstractValidator<WorkflowStepInput>
{
    public const int MaxSlaDays = 365;

    public WorkflowStepInputValidator()
    {
        RuleFor(s => s.Name).NotEmpty().MaximumLength(100);
        RuleFor(s => s.DepartmentId).GreaterThan(0).WithMessage("Choose a department.");
        RuleFor(s => s.SlaDays).InclusiveBetween(0, MaxSlaDays);
        RuleFor(s => s.AllowedOutcomes).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Choose the outcomes this step allows.")
            .Must(o => o.Contains(TaskOutcome.Complete) || o.Contains(TaskOutcome.Approve))
            .WithMessage("Each step must allow Complete or Approve, so work can move forward.");
        RuleForEach(s => s.AllowedOutcomes)
            .Must(TaskOutcomes.IsSingle).WithMessage("'{PropertyValue}' is not a single outcome.");
    }
}
