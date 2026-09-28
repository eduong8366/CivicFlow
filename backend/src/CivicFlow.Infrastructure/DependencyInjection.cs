using System.Text;
using CivicFlow.Application.Abstractions;
using CivicFlow.Infrastructure.Identity;
using CivicFlow.Infrastructure.Persistence;
using CivicFlow.Infrastructure.Persistence.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace CivicFlow.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IHostEnvironment environment)
    {
        // The connection string is read when the DbContext is first built, not here, so hosts that
        // add configuration late (WebApplicationFactory in the integration tests) can override it.
        services.AddDbContext<CivicFlowDbContext>((serviceProvider, options) =>
        {
            var connectionString = serviceProvider.GetRequiredService<IConfiguration>().GetConnectionString("CivicFlow")
                ?? throw new InvalidOperationException("Connection string 'CivicFlow' is not configured.");
            // Split queries by default: loading a case with its tasks, fields and values in one JOIN
            // would multiply the rows. Application code stays provider-neutral, so it's set here.
            options.UseSqlServer(connectionString, sql => sql.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery));

            // Demo data only ever goes into development databases. EF runs these hooks after
            // Migrate()/MigrateAsync() and after `dotnet ef database update`.
            if (environment.IsDevelopment())
            {
                options.UseSeeding((context, storeManagementPerformed) =>
                    DevDataSeeder.SeedAsync(context, storeManagementPerformed, CancellationToken.None).GetAwaiter().GetResult());
                options.UseAsyncSeeding(DevDataSeeder.SeedAsync);
            }
        });

        services.AddScoped<ICivicFlowDbContext>(sp => sp.GetRequiredService<CivicFlowDbContext>());
        services.AddScoped<ICaseNumberGenerator, SqlCaseNumberGenerator>();

        services.AddOptions<JwtOptions>()
            .BindConfiguration(JwtOptions.SectionName)
            .Validate(o => !string.IsNullOrWhiteSpace(o.Issuer) && !string.IsNullOrWhiteSpace(o.Audience),
                "Jwt:Issuer and Jwt:Audience must be configured.")
            .Validate(o => Encoding.UTF8.GetByteCount(o.SigningKey) >= JwtOptions.MinimumSigningKeyBytes,
                $"Jwt:SigningKey must be at least {JwtOptions.MinimumSigningKeyBytes} bytes. Outside Development, set it with user secrets or the Jwt__SigningKey environment variable.")
            .Validate(o => o.AccessTokenMinutes > 0, "Jwt:AccessTokenMinutes must be positive.")
            .ValidateOnStart();
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddSingleton<IPasswordHasher, IdentityPasswordHasher>();

        return services;
    }

    /// <summary>Applies pending migrations (and, in Development, the demo seed).</summary>
    public static async Task MigrateDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CivicFlowDbContext>();
        await db.Database.MigrateAsync(cancellationToken);
    }
}
