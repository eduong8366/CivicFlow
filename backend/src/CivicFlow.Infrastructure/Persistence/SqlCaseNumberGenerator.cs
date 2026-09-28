using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Infrastructure.Persistence;

/// <summary>
/// Draws numbers from a SQL Server sequence, which is safe under concurrent case creation.
/// The sequence is shared by all case types, so numbers are unique but not contiguous per type.
/// </summary>
internal sealed class SqlCaseNumberGenerator(CivicFlowDbContext db) : ICaseNumberGenerator
{
    private const string NextValueSql =
        "SELECT NEXT VALUE FOR dbo." + CivicFlowDbContext.CaseNumberSequence + " AS [Value]";

    public async Task<string> NextAsync(string prefix, int year, CancellationToken cancellationToken = default)
    {
        // Materialize without composing: SQL Server forbids NEXT VALUE FOR inside a subquery.
        var values = await db.Database.SqlQueryRaw<long>(NextValueSql).ToListAsync(cancellationToken);

        return Case.FormatCaseNumber(prefix, year, values.Single());
    }
}
