using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Auth;

public sealed class AuthService(
    ICivicFlowDbContext db,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IValidator<LoginRequest> validator)
{
    /// <summary>Returns null for any failed login, without saying whether the email exists.</summary>
    public async Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var email = request.Email.Trim();
        var user = await db.Users
            .Include(u => u.Department)
            .SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null)
        {
            // Spend the same hashing time as a real check, so response times don't reveal
            // which emails have accounts.
            passwordHasher.Hash(new User(), request.Password);
            return null;
        }

        var check = passwordHasher.Verify(user, user.PasswordHash, request.Password);
        if (check == PasswordCheck.Failed || !user.IsActive)
        {
            return null;
        }

        if (check == PasswordCheck.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.Hash(user, request.Password);
            await db.SaveChangesAsync(cancellationToken);
        }

        var token = tokenService.CreateAccessToken(user);
        return new LoginResponse(token.Token, token.ExpiresAt, ToDto(user));
    }

    /// <summary>Returns null when the caller's account no longer exists or has been deactivated.</summary>
    public async Task<CurrentUserDto?> GetCurrentUserAsync(ICurrentUser currentUser, CancellationToken cancellationToken = default)
    {
        if (currentUser.UserId is not { } userId)
        {
            return null;
        }

        return await db.Users
            .Where(u => u.Id == userId && u.IsActive)
            .Select(u => new CurrentUserDto(
                u.Id, u.Email, u.FullName, u.Role, u.DepartmentId, u.Department == null ? null : u.Department.Name))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static CurrentUserDto ToDto(User user) =>
        new(user.Id, user.Email, user.FullName, user.Role, user.DepartmentId, user.Department?.Name);
}
