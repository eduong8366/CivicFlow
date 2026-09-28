using FluentValidation;

namespace CivicFlow.Application.Admin;

/// <summary>
/// A department with what depends on it: its active users, the workflow steps of active case types
/// routed to it, and the active tasks routed to it (queued or assigned).
/// </summary>
public sealed record AdminDepartmentDto(
    int Id,
    string Name,
    string Code,
    bool IsActive,
    int ActiveUserCount,
    int ActiveStepCount,
    int ActiveTaskCount);

/// <summary>Creates or replaces a department. <see cref="Code"/> is stored in upper case.</summary>
public sealed record SaveDepartmentRequest(string Name, string Code, bool IsActive = true);

public sealed class SaveDepartmentRequestValidator : AbstractValidator<SaveDepartmentRequest>
{
    public SaveDepartmentRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(100);
        RuleFor(r => r.Code).NotEmpty().MaximumLength(10)
            .Matches("^[A-Za-z][A-Za-z0-9]*$")
            .WithMessage("'Code' must be letters and digits, starting with a letter.");
    }
}
