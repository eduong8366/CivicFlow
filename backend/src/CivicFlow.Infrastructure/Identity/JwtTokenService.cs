using System.Globalization;
using System.Security.Claims;
using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Auth;
using CivicFlow.Domain.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CivicFlow.Infrastructure.Identity;

internal sealed class JwtTokenService(IOptions<JwtOptions> options, TimeProvider timeProvider) : ITokenService
{
    private readonly JsonWebTokenHandler _handler = new();

    public AccessToken CreateAccessToken(User user)
    {
        var jwt = options.Value;
        var now = timeProvider.GetUtcNow();
        var expiresAt = now.AddMinutes(jwt.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(CivicFlowClaimTypes.UserId, user.Id.ToString(CultureInfo.InvariantCulture)),
            new(CivicFlowClaimTypes.Email, user.Email),
            new(CivicFlowClaimTypes.Name, user.FullName),
            new(CivicFlowClaimTypes.Role, user.Role.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        if (user.DepartmentId is { } departmentId)
        {
            claims.Add(new(CivicFlowClaimTypes.DepartmentId, departmentId.ToString(CultureInfo.InvariantCulture)));
        }

        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(jwt.CreateSigningKey(), SecurityAlgorithms.HmacSha256),
        });

        return new AccessToken(token, expiresAt);
    }
}
