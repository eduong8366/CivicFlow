using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Abstractions;

/// <summary>
/// The Application layer's view of the database. Services query and save through EF Core
/// directly; only the provider (SQL Server), configurations and migrations stay in Infrastructure.
/// </summary>
public interface ICivicFlowDbContext
{
    DbSet<Department> Departments { get; }
    DbSet<User> Users { get; }
    DbSet<CaseType> CaseTypes { get; }
    DbSet<CaseTypeField> CaseTypeFields { get; }
    DbSet<WorkflowStepTemplate> WorkflowStepTemplates { get; }
    DbSet<Case> Cases { get; }
    DbSet<CaseFieldValue> CaseFieldValues { get; }
    DbSet<WorkflowTask> WorkflowTasks { get; }
    DbSet<Comment> Comments { get; }
    DbSet<Attachment> Attachments { get; }
    DbSet<AuditLog> AuditLogs { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
