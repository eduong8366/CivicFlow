using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CivicFlow.Infrastructure.Persistence.Configurations;

// A case owns its field values, tasks, comments and attachments, so those cascade from it.
// Every other required relationship is Restrict: reference data is deactivated, never deleted,
// and SQL Server rejects the multiple cascade paths that defaults would create.

internal sealed class CaseConfiguration : IEntityTypeConfiguration<Case>
{
    public void Configure(EntityTypeBuilder<Case> builder)
    {
        builder.ToTable("Cases");

        builder.Property(c => c.CaseNumber).HasMaxLength(30);
        builder.Property(c => c.Title).HasMaxLength(200);
        builder.Property(c => c.Description).HasMaxLength(4000);
        builder.Property(c => c.RequesterName).HasMaxLength(150);
        builder.Property(c => c.RequesterEmail).HasMaxLength(256);
        builder.Property(c => c.RequesterPhone).HasMaxLength(30);
        builder.Property(c => c.RequesterAddress).HasMaxLength(300);
        builder.Property(c => c.RowVersion).IsRowVersion();

        builder.HasIndex(c => c.CaseNumber).IsUnique();
        builder.HasIndex(c => c.Status);
        builder.HasIndex(c => c.CreatedAt);
        builder.HasIndex(c => c.DueDate);

        builder.HasOne(c => c.CaseType)
            .WithMany()
            .HasForeignKey(c => c.CaseTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(c => c.CreatedBy)
            .WithMany()
            .HasForeignKey(c => c.CreatedById)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(c => c.FieldValues)
            .WithOne(v => v.Case)
            .HasForeignKey(v => v.CaseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Tasks)
            .WithOne(t => t.Case)
            .HasForeignKey(t => t.CaseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Comments)
            .WithOne(m => m.Case)
            .HasForeignKey(m => m.CaseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Attachments)
            .WithOne(a => a.Case)
            .HasForeignKey(a => a.CaseId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class CaseFieldValueConfiguration : IEntityTypeConfiguration<CaseFieldValue>
{
    public void Configure(EntityTypeBuilder<CaseFieldValue> builder)
    {
        builder.Property(v => v.Value).HasMaxLength(2000);
        builder.HasIndex(v => new { v.CaseId, v.FieldId }).IsUnique();

        builder.HasOne(v => v.Field)
            .WithMany()
            .HasForeignKey(v => v.FieldId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class WorkflowTaskConfiguration : IEntityTypeConfiguration<WorkflowTask>
{
    public void Configure(EntityTypeBuilder<WorkflowTask> builder)
    {
        builder.Property(t => t.Name).HasMaxLength(100);
        builder.Property(t => t.Notes).HasMaxLength(2000);
        builder.Property(t => t.RowVersion).IsRowVersion();

        builder.HasIndex(t => new { t.CaseId, t.Sequence });
        builder.HasIndex(t => new { t.AssigneeId, t.Status });
        builder.HasIndex(t => new { t.DepartmentId, t.Status });

        builder.HasOne(t => t.StepTemplate)
            .WithMany()
            .HasForeignKey(t => t.StepTemplateId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.Department)
            .WithMany()
            .HasForeignKey(t => t.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.Assignee)
            .WithMany()
            .HasForeignKey(t => t.AssigneeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CommentConfiguration : IEntityTypeConfiguration<Comment>
{
    public void Configure(EntityTypeBuilder<Comment> builder)
    {
        builder.Property(c => c.Body).HasMaxLength(4000);
        builder.HasIndex(c => new { c.CaseId, c.CreatedAt });

        builder.HasOne(c => c.Author)
            .WithMany()
            .HasForeignKey(c => c.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AttachmentConfiguration : IEntityTypeConfiguration<Attachment>
{
    public void Configure(EntityTypeBuilder<Attachment> builder)
    {
        builder.Property(a => a.FileName).HasMaxLength(255);
        builder.Property(a => a.ContentType).HasMaxLength(100);
        builder.Property(a => a.StoragePath).HasMaxLength(500);

        builder.HasOne(a => a.UploadedBy)
            .WithMany()
            .HasForeignKey(a => a.UploadedById)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.Property(a => a.EntityType).HasMaxLength(100);
        builder.Property(a => a.EntityId).HasMaxLength(50);
        builder.Property(a => a.Action).HasMaxLength(50);

        builder.HasIndex(a => new { a.EntityType, a.EntityId });
        builder.HasIndex(a => a.CaseId);
        builder.HasIndex(a => a.Timestamp);
    }
}
