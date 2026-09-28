using FluentValidation;

namespace CivicFlow.Application.Auth;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(r => r.Email).NotEmpty().MaximumLength(256).EmailAddress();

        // No complexity rules here: those belong where passwords are set, not where they are checked.
        RuleFor(r => r.Password).NotEmpty().MaximumLength(256);
    }
}
