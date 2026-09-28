using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CivicFlow.Infrastructure.Persistence.Configurations;

internal sealed class DepartmentConfiguration : IEntityTypeConfiguration<Department>
{
    public void Configure(EntityTypeBuilder<Department> builder)
    {
        builder.Property(d => d.Name).HasMaxLength(100);
        builder.Property(d => d.Code).HasMaxLength(10);
        builder.HasIndex(d => d.Name).IsUnique();
        builder.HasIndex(d => d.Code).IsUnique();
    }
}

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.Property(u => u.Email).HasMaxLength(256);
        builder.Property(u => u.FullName).HasMaxLength(150);
        builder.Property(u => u.PasswordHash).HasMaxLength(256);
        builder.HasIndex(u => u.Email).IsUnique();

        builder.HasOne(u => u.Department)
            .WithMany(d => d.Users)
            .HasForeignKey(u => u.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
