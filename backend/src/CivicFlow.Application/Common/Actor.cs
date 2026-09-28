using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Common;

/// <summary>The signed-in user a service is acting for. Permission rules take this, not the HTTP context.</summary>
public sealed record Actor(int UserId, UserRole Role, int? DepartmentId)
{
    public bool IsAdmin => Role == UserRole.Admin;

    public bool IsSupervisorOf(int departmentId) => Role == UserRole.Supervisor && DepartmentId == departmentId;
}

public static class CurrentUserExtensions
{
    /// <summary>
    /// The caller as an <see cref="Actor"/>. Every endpoint except login requires a signed-in user,
    /// so this only fails for a token without the expected claims.
    /// </summary>
    public static Actor RequireActor(this ICurrentUser currentUser) =>
        currentUser is { UserId: { } userId, Role: { } role }
            ? new Actor(userId, role, currentUser.DepartmentId)
            : throw new ForbiddenException("The access token does not identify a user.");
}
