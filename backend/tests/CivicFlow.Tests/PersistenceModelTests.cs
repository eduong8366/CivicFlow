using CivicFlow.Domain.Entities;
using CivicFlow.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Tests;

public class PersistenceModelTests
{
    // Builds the model only; nothing connects to this server.
    private static CivicFlowDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<CivicFlowDbContext>()
            .UseSqlServer("Server=unused;Database=unused")
            .Options);

    [Fact]
    public void Model_matches_the_latest_migration()
    {
        using var db = CreateContext();

        Assert.False(
            db.Database.HasPendingModelChanges(),
            "The EF model has changed since the last migration. Run `dotnet ef migrations add <Name>`.");
    }

    [Fact]
    public void Enums_are_stored_as_strings()
    {
        using var db = CreateContext();
        var status = db.Model.FindEntityType(typeof(Case))!.FindProperty(nameof(Case.Status))!;

        Assert.Equal(typeof(string), status.GetProviderClrType());
    }

    [Theory]
    [InlineData("BLD", 2026, 42, "BLD-2026-000042")]
    [InlineData("PRR", 2027, 1234567, "PRR-2027-1234567")]
    public void Case_numbers_are_prefix_year_and_padded_sequence(string prefix, int year, long sequence, string expected)
    {
        Assert.Equal(expected, Case.FormatCaseNumber(prefix, year, sequence));
    }
}
