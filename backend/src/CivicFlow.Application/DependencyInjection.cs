using CivicFlow.Application.Auth;
using CivicFlow.Application.Cases;
using CivicFlow.Application.CaseTypes;
using CivicFlow.Application.Tasks;
using CivicFlow.Application.Workflow;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CivicFlow.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, ServiceLifetime.Singleton);

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<WorkflowEngine>();

        services.AddScoped<AuthService>();
        services.AddScoped<CaseService>();
        services.AddScoped<CaseTypeService>();
        services.AddScoped<TaskService>();

        return services;
    }
}
