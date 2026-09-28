using System.Net.Http.Headers;
using System.Net.Http.Json;
using CivicFlow.Application.Auth;
using CivicFlow.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CivicFlow.Tests.Integration;

/// <summary>
/// Runs the real API in memory against its own LocalDB database, <c>CivicFlow_Tests</c>. The host
/// runs as Development so startup migrates and seeds that database with the demo data, exactly
/// as it does the dev database. The database is dropped once per test run so the seed is fresh.
/// </summary>
public sealed class CivicFlowApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string ConnectionString =
        @"Server=(localdb)\MSSQLLocalDB;Database=CivicFlow_Tests;Trusted_Connection=True;TrustServerCertificate=True";

    /// <summary>Every seeded account has this password.</summary>
    public const string DemoPassword = "CivicFlow!2026";

    /// <summary>Uploaded attachments go to a temporary directory, removed when the run ends.</summary>
    public string FileStorageRoot { get; } = Path.Combine(Path.GetTempPath(), $"civicflow-tests-{Guid.NewGuid():N}");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:CivicFlow"] = ConnectionString,
            ["FileStorage:RootPath"] = FileStorageRoot,
        }));
    }

    public async Task InitializeAsync()
    {
        await using (var db = CreateDbContext())
        {
            await db.Database.EnsureDeletedAsync();
        }

        // Starting the server runs Program's startup migration and seed.
        _ = Server;
    }

    Task IAsyncLifetime.DisposeAsync()
    {
        if (Directory.Exists(FileStorageRoot))
        {
            Directory.Delete(FileStorageRoot, recursive: true);
        }

        return Task.CompletedTask;
    }

    /// <summary>A context on the test database, for arranging and checking data directly.</summary>
    public CivicFlowDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<CivicFlowDbContext>().UseSqlServer(ConnectionString).Options);

    public async Task<HttpClient> CreateClientAsAsync(string email)
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, DemoPassword));
        response.EnsureSuccessStatusCode();
        var login = await response.Content.ReadFromJsonAsync<LoginResponse>(TestJson.Options);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login!.AccessToken);
        return client;
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<CivicFlowApiFactory>
{
    public const string Name = "API";
}
