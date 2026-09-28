using CivicFlow.Application.Auth;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace CivicFlow.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, ServiceLifetime.Singleton);

        services.AddScoped<AuthService>();

        return services;
    }
}
