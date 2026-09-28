using CivicFlow.Domain.Entities;

namespace CivicFlow.Application.Abstractions;

public interface IPasswordHasher
{
    string Hash(User user, string password);

    PasswordCheck Verify(User user, string hashedPassword, string providedPassword);
}

public enum PasswordCheck
{
    Failed,
    Success,

    /// <summary>The password matched, but the hash uses outdated parameters and should be replaced.</summary>
    SuccessRehashNeeded,
}
