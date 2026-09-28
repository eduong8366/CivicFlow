using CivicFlow.Application.Abstractions;
using CivicFlow.Infrastructure.Persistence;
using CivicFlow.Infrastructure.Persistence.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CivicFlow.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString("CivicFlow")
            ?? throw new InvalidOperationException("Connection string 'CivicFlow' is not configured.");

        services.AddDbContext<CivicFlowDbContext>(options =>
        {
            options.UseSqlServer(connectionString);

            // Demo data only ever goes into development databases. EF runs these hooks after
            // Migrate()/MigrateAsync() and after `dotnet ef database update`.
            if (environment.IsDevelopment())
            {
                options.UseSeeding((context, storeManagementPerformed) =>
                    DevDataSeeder.SeedAsync(context, storeManagementPerformed, CancellationToken.None).GetAwaiter().GetResult());
                options.UseAsyncSeeding(DevDataSeeder.SeedAsync);
            }
        });

        services.AddScoped<ICaseNumberGenerator, SqlCaseNumberGenerator>();

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
