using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Lookups;

public sealed record DepartmentLookupDto(int Id, string Name, string Code, bool IsActive);

/// <summary>A colleague as the UI shows them: no email or account details.</summary>
public sealed record UserLookupDto(int Id, string FullName, UserRole Role, int? DepartmentId, string? DepartmentName, bool IsActive);

/// <summary>Filters for the user lookup.</summary>
public sealed class UserLookupQuery
{
    public int? DepartmentId { get; set; }

    /// <summary>Include deactivated accounts, e.g. to put names to old audit entries.</summary>
    public bool IncludeInactive { get; set; }
}

/// <summary>
/// Small, unpaged reference lists for any signed-in user: departments for filters, and colleagues
/// for the assign dialog and for putting names to user ids (the audit log stores ids only).
/// </summary>
public sealed class LookupService(ICivicFlowDbContext db)
{
    public async Task<IReadOnlyList<DepartmentLookupDto>> GetDepartmentsAsync(
        bool includeInactive, CancellationToken cancellationToken = default) =>
        await db.Departments
            .AsNoTracking()
            .Where(d => includeInactive || d.IsActive)
            .OrderBy(d => d.Name)
            .Select(d => new DepartmentLookupDto(d.Id, d.Name, d.Code, d.IsActive))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<UserLookupDto>> GetUsersAsync(UserLookupQuery query, CancellationToken cancellationToken = default)
    {
        var users = db.Users.AsNoTracking().Where(u => query.IncludeInactive || u.IsActive);
        if (query.DepartmentId is { } departmentId)
        {
            users = users.Where(u => u.DepartmentId == departmentId);
        }

        return await users
            .OrderBy(u => u.FullName)
            .ThenBy(u => u.Id)
            .Select(u => new UserLookupDto(
                u.Id, u.FullName, u.Role, u.DepartmentId, u.Department == null ? null : u.Department.Name, u.IsActive))
            .ToListAsync(cancellationToken);
    }
}
