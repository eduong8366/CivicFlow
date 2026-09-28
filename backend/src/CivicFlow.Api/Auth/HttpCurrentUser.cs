using System.Globalization;
using System.Security.Claims;
using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Auth;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Api.Auth;

internal sealed class HttpCurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public int? UserId => ParseInt(CivicFlowClaimTypes.UserId);

    public UserRole? Role =>
        Enum.TryParse<UserRole>(Principal?.FindFirstValue(CivicFlowClaimTypes.Role), out var role) ? role : null;

    public int? DepartmentId => ParseInt(CivicFlowClaimTypes.DepartmentId);

    private int? ParseInt(string claimType) =>
        int.TryParse(Principal?.FindFirstValue(claimType), NumberStyles.None, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
}
