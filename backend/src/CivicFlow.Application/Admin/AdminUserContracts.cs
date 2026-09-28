using CivicFlow.Application.Common;
using CivicFlow.Domain.Enums;
using FluentValidation;

namespace CivicFlow.Application.Admin;

/// <summary>A user account as admins manage it. <see cref="ActiveTaskCount"/> is the user's current workload.</summary>
public sealed record AdminUserDto(
    int Id,
    string Email,
    string FullName,
    UserRole Role,
    int? DepartmentId,
    string? DepartmentName,
    bool IsActive,
    int ActiveTaskCount);

/// <summary>User list filters, all optional.</summary>
public sealed class AdminUserQuery : PageQuery
{
    /// <summary>Matches part of the name or email.</summary>
    public string? Search { get; set; }
    public UserRole? Role { get; set; }
    public int? DepartmentId { get; set; }
    public bool? IsActive { get; set; }
}

public sealed class AdminUserQueryValidator : PageQueryValidator<AdminUserQuery>
{
    public AdminUserQueryValidator()
    {
        RuleFor(q => q.Search).MaximumLength(100);
        RuleFor(q => q.Role).IsInEnum();
    }
}

/// <summary>A new account. Staff and supervisors must belong to a department; admins may be agency-wide.</summary>
public sealed record CreateUserRequest(string Email, string FullName, string Password, UserRole Role, int? DepartmentId);

/// <summary>
/// Replaces an account's details. Deactivating an account, or moving it to another department,
/// sends its active tasks back to their department queues. Passwords are changed separately.
/// </summary>
public sealed record UpdateUserRequest(string Email, string FullName, UserRole Role, int? DepartmentId, bool IsActive);

public sealed record ResetPasswordRequest(string Password);

public static class PasswordRules
{
    // Length rather than composition rules, following NIST SP 800-63B.
    public const int MinLength = 12;
    public const int MaxLength = 256;
}

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(r => r.Email).NotEmpty().MaximumLength(256).EmailAddress();
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(150);
        RuleFor(r => r.Password).NotEmpty().Length(PasswordRules.MinLength, PasswordRules.MaxLength);
        RuleFor(r => r.Role).IsInEnum();
        RuleFor(r => r.DepartmentId).NotNull()
            .When(r => r.Role != UserRole.Admin)
            .WithMessage("Staff and supervisors must belong to a department.");
    }
}

public sealed class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator()
    {
        RuleFor(r => r.Email).NotEmpty().MaximumLength(256).EmailAddress();
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(150);
        RuleFor(r => r.Role).IsInEnum();
        RuleFor(r => r.DepartmentId).NotNull()
            .When(r => r.Role != UserRole.Admin)
            .WithMessage("Staff and supervisors must belong to a department.");
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(r => r.Password).NotEmpty().Length(PasswordRules.MinLength, PasswordRules.MaxLength);
    }
}
