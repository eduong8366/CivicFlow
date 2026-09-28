using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace CivicFlow.Infrastructure.Identity;

/// <summary>ASP.NET Core Identity's PBKDF2 hasher, without the rest of Identity.</summary>
internal sealed class IdentityPasswordHasher : IPasswordHasher
{
    private readonly PasswordHasher<User> _inner = new();

    public string Hash(User user, string password) => _inner.HashPassword(user, password);

    public PasswordCheck Verify(User user, string hashedPassword, string providedPassword) =>
        _inner.VerifyHashedPassword(user, hashedPassword, providedPassword) switch
        {
            PasswordVerificationResult.Success => PasswordCheck.Success,
            PasswordVerificationResult.SuccessRehashNeeded => PasswordCheck.SuccessRehashNeeded,
            _ => PasswordCheck.Failed,
        };
}
