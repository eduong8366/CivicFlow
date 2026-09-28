using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Auth;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;

namespace CivicFlow.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AuthEndpointTests(CivicFlowApiFactory factory)
{
    [Fact]
    public async Task Login_with_seeded_credentials_returns_token_and_user()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest("pz.staff1@civicflow.test", CivicFlowApiFactory.DemoPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var login = await response.Content.ReadFromJsonAsync<LoginResponse>(TestJson.Options);
        Assert.NotNull(login);
        Assert.Equal(UserRole.Staff, login.User.Role);
        Assert.Equal("Planning & Zoning", login.User.DepartmentName);
        Assert.True(login.ExpiresAt > DateTimeOffset.UtcNow);

        var token = new JsonWebToken(login.AccessToken);
        Assert.Equal(login.User.Id.ToString(), token.Subject);
        Assert.Equal("Staff", token.GetClaim(CivicFlowClaimTypes.Role).Value);
        Assert.Equal(login.User.DepartmentId.ToString(), token.GetClaim(CivicFlowClaimTypes.DepartmentId).Value);
    }

    [Fact]
    public async Task Login_ignores_surrounding_whitespace_in_email()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest("  admin@civicflow.test ", CivicFlowApiFactory.DemoPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("admin@civicflow.test", "wrong-password")]
    [InlineData("nobody@civicflow.test", CivicFlowApiFactory.DemoPassword)]
    public async Task Login_failure_is_401_problem_without_saying_why(string email, string password)
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal("The email or password is incorrect.", problem!.Detail);
    }

    [Fact]
    public async Task Login_is_refused_for_a_deactivated_account()
    {
        var email = await CreateUserAsync(isActive: false);
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, CivicFlowApiFactory.DemoPassword));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_login_request_is_400_validation_problem()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("not-an-email", ""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains("Email", problem!.Errors.Keys);
        Assert.Contains("Password", problem.Errors.Keys);
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user()
    {
        var client = await factory.CreateClientAsAsync("ce.supervisor@civicflow.test");

        var me = await client.GetFromJsonAsync<CurrentUserDto>("/api/auth/me", TestJson.Options);

        Assert.NotNull(me);
        Assert.Equal("ce.supervisor@civicflow.test", me.Email);
        Assert.Equal(UserRole.Supervisor, me.Role);
        Assert.Equal("Code Enforcement", me.DepartmentName);
    }

    [Fact]
    public async Task Me_without_a_token_is_401_problem()
    {
        var response = await factory.CreateClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Me_with_a_tampered_token_is_401()
    {
        var client = await factory.CreateClientAsAsync("pw.staff1@civicflow.test");
        var token = client.DefaultRequestHeaders.Authorization!.Parameter!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token[..^4] + "AAAA");

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_is_401_once_the_account_is_deactivated()
    {
        var email = await CreateUserAsync(isActive: true);
        var client = await factory.CreateClientAsAsync(email);

        await using (var db = factory.CreateDbContext())
        {
            await db.Users.Where(u => u.Email == email).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false));
        }
        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Health_check_stays_anonymous()
    {
        var response = await factory.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task OpenApi_document_declares_bearer_auth()
    {
        var json = await factory.CreateClient().GetStringAsync("/openapi/v1.json");

        Assert.Contains("\"bearer\"", json);
        Assert.Contains("/api/auth/login", json);
    }

    /// <summary>Adds a Staff user with the demo password and returns its (unique) email.</summary>
    private async Task<string> CreateUserAsync(bool isActive)
    {
        using var scope = factory.Services.CreateScope();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var db = scope.ServiceProvider.GetRequiredService<ICivicFlowDbContext>();

        var user = new User
        {
            Email = $"test-{Guid.NewGuid():N}@civicflow.test",
            FullName = "Test User",
            Role = UserRole.Staff,
            DepartmentId = await db.Departments.Select(d => d.Id).FirstAsync(),
            IsActive = isActive,
        };
        user.PasswordHash = hasher.Hash(user, CivicFlowApiFactory.DemoPassword);
        db.Users.Add(user);
        await db.SaveChangesAsync();

        return user.Email;
    }
}
