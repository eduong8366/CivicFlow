using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Abstractions;

/// <summary>The caller of the current request, as described by their access token.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>Null when the request is anonymous.</summary>
    int? UserId { get; }

    UserRole? Role { get; }

    int? DepartmentId { get; }
}
