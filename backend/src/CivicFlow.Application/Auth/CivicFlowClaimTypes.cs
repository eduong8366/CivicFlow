namespace CivicFlow.Application.Auth;

/// <summary>Claim names in CivicFlow access tokens. They are the short JWT names, not the WS-* URIs.</summary>
public static class CivicFlowClaimTypes
{
    public const string UserId = "sub";
    public const string Email = "email";
    public const string Name = "name";
    public const string Role = "role";
    public const string DepartmentId = "department_id";
}
