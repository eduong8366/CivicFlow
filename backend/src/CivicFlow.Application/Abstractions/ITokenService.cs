using CivicFlow.Domain.Entities;

namespace CivicFlow.Application.Abstractions;

public interface ITokenService
{
    AccessToken CreateAccessToken(User user);
}

public sealed record AccessToken(string Token, DateTimeOffset ExpiresAt);
