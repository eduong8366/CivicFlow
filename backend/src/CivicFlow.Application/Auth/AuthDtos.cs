using CivicFlow.Domain.Enums;

namespace CivicFlow.Application.Auth;

public sealed record LoginRequest(string Email, string Password);

public sealed record LoginResponse(string AccessToken, DateTimeOffset ExpiresAt, CurrentUserDto User);

public sealed record CurrentUserDto(
    int Id,
    string Email,
    string FullName,
    UserRole Role,
    int? DepartmentId,
    string? DepartmentName);
