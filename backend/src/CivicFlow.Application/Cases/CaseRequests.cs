using CivicFlow.Application.Common;
using CivicFlow.Domain.Enums;
using FluentValidation;

namespace CivicFlow.Application.Cases;

/// <summary>
/// A new case. <see cref="Fields"/> maps each custom field's key to its value as a string:
/// numbers in invariant form, dates as yyyy-MM-dd and checkboxes as "true"/"false".
/// </summary>
public sealed record CreateCaseRequest(
    int CaseTypeId,
    string Title,
    string? Description,
    CasePriority Priority,
    string RequesterName,
    string? RequesterEmail,
    string? RequesterPhone,
    string? RequesterAddress,
    Dictionary<string, string?>? Fields);

public sealed class CreateCaseRequestValidator : AbstractValidator<CreateCaseRequest>
{
    public CreateCaseRequestValidator()
    {
        RuleFor(r => r.CaseTypeId).GreaterThan(0);
        RuleFor(r => r.Title).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Description).MaximumLength(4000);
        RuleFor(r => r.Priority).IsInEnum();
        RuleFor(r => r.RequesterName).NotEmpty().MaximumLength(150);
        RuleFor(r => r.RequesterEmail).MaximumLength(256).EmailAddress()
            .When(r => !string.IsNullOrWhiteSpace(r.RequesterEmail));
        RuleFor(r => r.RequesterPhone).MaximumLength(30);
        RuleFor(r => r.RequesterAddress).MaximumLength(300);
    }
}

/// <summary>An optional reason for putting a case on hold, cancelling or reopening it, kept as an internal comment.</summary>
public sealed record ChangeCaseStatusRequest(string? Reason);

public sealed class ChangeCaseStatusRequestValidator : AbstractValidator<ChangeCaseStatusRequest>
{
    public ChangeCaseStatusRequestValidator()
    {
        RuleFor(r => r.Reason).MaximumLength(2000);
    }
}

public enum CaseSortField
{
    CreatedAt,
    DueDate,
    Priority,
    CaseNumber,
}

/// <summary>Case search filters, all optional. Results are limited to the cases the caller may view.</summary>
public sealed class CaseSearchQuery : PageQuery
{
    public int? CaseTypeId { get; set; }
    public CaseStatus? Status { get; set; }
    public CasePriority? Priority { get; set; }

    /// <summary>Cases with any task, past or future, routed to this department.</summary>
    public int? DepartmentId { get; set; }

    /// <summary>Cases whose active task is assigned to this user.</summary>
    public int? AssigneeId { get; set; }

    /// <summary>Created on or after this date (Pacific time).</summary>
    public DateOnly? CreatedFrom { get; set; }

    /// <summary>Created on or before this date (Pacific time).</summary>
    public DateOnly? CreatedTo { get; set; }

    /// <summary>Unfinished cases past their due date (true) or not (false).</summary>
    public bool? Overdue { get; set; }

    /// <summary>Matches part of the case number, title or requester name.</summary>
    public string? Search { get; set; }

    public CaseSortField Sort { get; set; } = CaseSortField.CreatedAt;
    public bool Descending { get; set; } = true;
}

public sealed class CaseSearchQueryValidator : PageQueryValidator<CaseSearchQuery>
{
    public CaseSearchQueryValidator()
    {
        RuleFor(q => q.Status).IsInEnum();
        RuleFor(q => q.Priority).IsInEnum();
        RuleFor(q => q.Sort).IsInEnum();
        RuleFor(q => q.Search).MaximumLength(100);
        RuleFor(q => q.CreatedTo).GreaterThanOrEqualTo(q => q.CreatedFrom)
            .When(q => q.CreatedFrom is not null && q.CreatedTo is not null)
            .WithMessage("'Created To' must not be before 'Created From'.");
    }
}
