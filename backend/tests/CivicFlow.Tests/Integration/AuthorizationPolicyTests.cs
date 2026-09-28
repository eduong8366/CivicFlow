using System.Security.Claims;
using CivicFlow.Api.Auth;
using CivicFlow.Application.Auth;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

namespace CivicFlow.Tests.Integration;

/// <summary>Checks the role policies as registered in the real host, before any endpoint uses them.</summary>
[Collection(ApiCollection.Name)]
public class AuthorizationPolicyTests(CivicFlowApiFactory factory)
{
    [Theory]
    [InlineData(Policies.Admin, UserRole.Staff, false)]
    [InlineData(Policies.Admin, UserRole.Supervisor, false)]
    [InlineData(Policies.Admin, UserRole.Admin, true)]
    [InlineData(Policies.SupervisorOrAdmin, UserRole.Staff, false)]
    [InlineData(Policies.SupervisorOrAdmin, UserRole.Supervisor, true)]
    [InlineData(Policies.SupervisorOrAdmin, UserRole.Admin, true)]
    public async Task Role_policies_follow_the_permission_matrix(string policy, UserRole role, bool allowed)
    {
        var authorization = factory.Services.GetRequiredService<IAuthorizationService>();
        var user = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(CivicFlowClaimTypes.UserId, "1"), new Claim(CivicFlowClaimTypes.Role, role.ToString())],
            authenticationType: "Test",
            nameType: CivicFlowClaimTypes.Name,
            roleType: CivicFlowClaimTypes.Role));

        var result = await authorization.AuthorizeAsync(user, policy);

        Assert.Equal(allowed, result.Succeeded);
    }
}
