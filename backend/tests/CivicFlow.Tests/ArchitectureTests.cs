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
}
