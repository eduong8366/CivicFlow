using System.Reflection;

namespace CivicFlow.Tests;

public class ArchitectureTests
{
    [Theory]
    [InlineData("CivicFlow.Domain")]
    [InlineData("CivicFlow.Application", "CivicFlow.Domain")]
    [InlineData("CivicFlow.Infrastructure", "CivicFlow.Application", "CivicFlow.Domain")]
    public void Layer_only_references_allowed_inner_layers(string assemblyName, params string[] allowed)
    {
        var referenced = Assembly.Load(assemblyName)
            .GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(n => n.StartsWith("CivicFlow.", StringComparison.Ordinal));

        Assert.All(referenced, name => Assert.Contains(name, allowed));
    }

    [Fact]
    public void Domain_does_not_depend_on_EF_Core()
    {
        var referenced = Assembly.Load("CivicFlow.Domain")
            .GetReferencedAssemblies()
            .Select(a => a.Name!);

        Assert.DoesNotContain(referenced, n => n.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal));
    }

    [Fact]
    public void Application_uses_EF_Core_but_no_database_provider_or_web_framework()
    {
        // Application queries through ICivicFlowDbContext (EF Core's DbSet/LINQ); the SQL Server
        // provider, Identity and ASP.NET Core stay in the outer layers.
        var referenced = Assembly.Load("CivicFlow.Application")
            .GetReferencedAssemblies()
            .Select(a => a.Name!)
            .ToList();

        Assert.DoesNotContain(referenced, n => n.StartsWith("Microsoft.EntityFrameworkCore.SqlServer", StringComparison.Ordinal));
        Assert.DoesNotContain(referenced, n => n.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal));
        Assert.DoesNotContain(referenced, n => n.StartsWith("Microsoft.Extensions.Identity", StringComparison.Ordinal));
    }
}
