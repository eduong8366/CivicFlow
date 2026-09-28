using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CivicFlow.Infrastructure.Persistence.Configurations;

internal sealed class CaseTypeConfiguration : IEntityTypeConfiguration<CaseType>
{
    public void Configure(EntityTypeBuilder<CaseType> builder)
    {
        builder.Property(t => t.Name).HasMaxLength(100);
        builder.Property(t => t.Prefix).HasMaxLength(10);
        builder.Property(t => t.Description).HasMaxLength(500);
        builder.HasIndex(t => t.Name).IsUnique();
        builder.HasIndex(t => t.Prefix).IsUnique();

        builder.HasMany(t => t.Fields)
            .WithOne(f => f.CaseType)
            .HasForeignKey(f => f.CaseTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(t => t.Steps)
            .WithOne(s => s.CaseType)
            .HasForeignKey(s => s.CaseTypeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class CaseTypeFieldConfiguration : IEntityTypeConfiguration<CaseTypeField>
{
    public void Configure(EntityTypeBuilder<CaseTypeField> builder)
    {
        builder.Property(f => f.Label).HasMaxLength(100);
        builder.Property(f => f.Key).HasMaxLength(50);
        builder.HasIndex(f => new { f.CaseTypeId, f.Key }).IsUnique();
    }
}

internal sealed class WorkflowStepTemplateConfiguration : IEntityTypeConfiguration<WorkflowStepTemplate>
{
    public void Configure(EntityTypeBuilder<WorkflowStepTemplate> builder)
    {
        builder.Property(s => s.Name).HasMaxLength(100);

        // Not unique: drag-and-drop reordering rewrites several SortOrders in one save.
        builder.HasIndex(s => new { s.CaseTypeId, s.SortOrder });

        builder.HasOne(s => s.Department)
            .WithMany()
            .HasForeignKey(s => s.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
