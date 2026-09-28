using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Infrastructure.Persistence;

public class CivicFlowDbContext(DbContextOptions<CivicFlowDbContext> options) : DbContext(options), ICivicFlowDbContext
{
    public const string CaseNumberSequence = "CaseNumberSequence";

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<User> Users => Set<User>();
    public DbSet<CaseType> CaseTypes => Set<CaseType>();
    public DbSet<CaseTypeField> CaseTypeFields => Set<CaseTypeField>();
    public DbSet<WorkflowStepTemplate> WorkflowStepTemplates => Set<WorkflowStepTemplate>();
    public DbSet<Case> Cases => Set<Case>();
    public DbSet<CaseFieldValue> CaseFieldValues => Set<CaseFieldValue>();
    public DbSet<WorkflowTask> WorkflowTasks => Set<WorkflowTask>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Enums are stored by name so the tables stay readable in SQL and in reports.
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(64);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>(CaseNumberSequence);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CivicFlowDbContext).Assembly);
    }
}
