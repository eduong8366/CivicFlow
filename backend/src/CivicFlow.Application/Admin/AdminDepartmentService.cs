using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Admin;

/// <summary>
/// Department administration (admins only). Departments are deactivated, never deleted, and only
/// once nothing depends on them, so no work is routed to a queue nobody watches.
/// </summary>
public sealed class AdminDepartmentService(ICivicFlowDbContext db, IValidator<SaveDepartmentRequest> validator)
{
    public async Task<IReadOnlyList<AdminDepartmentDto>> ListAsync(CancellationToken cancellationToken = default) =>
        await Project(db.Departments.AsNoTracking().OrderBy(d => d.Name)).ToListAsync(cancellationToken);

    public async Task<AdminDepartmentDto> GetAsync(int id, CancellationToken cancellationToken = default) =>
        await Project(db.Departments.AsNoTracking().Where(d => d.Id == id)).SingleOrDefaultAsync(cancellationToken)
        ?? throw new NotFoundException("Department", id);

    public async Task<AdminDepartmentDto> CreateAsync(SaveDepartmentRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        var (name, code) = Normalize(request);
        await EnsureUniqueAsync(name, code, exceptId: null, cancellationToken);

        var department = new Department { Name = name, Code = code, IsActive = request.IsActive };
        db.Departments.Add(department);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(department.Id, cancellationToken);
    }

    public async Task<AdminDepartmentDto> UpdateAsync(int id, SaveDepartmentRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        var department = await db.Departments.SingleOrDefaultAsync(d => d.Id == id, cancellationToken)
            ?? throw new NotFoundException("Department", id);

        var (name, code) = Normalize(request);
        await EnsureUniqueAsync(name, code, exceptId: id, cancellationToken);

        if (department.IsActive && !request.IsActive)
        {
            EnsureNothingDependsOn(await GetAsync(id, cancellationToken));
        }

        department.Name = name;
        department.Code = code;
        department.IsActive = request.IsActive;
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(id, cancellationToken);
    }

    private static (string Name, string Code) Normalize(SaveDepartmentRequest request) =>
        (request.Name.Trim(), request.Code.Trim().ToUpperInvariant());

    private async Task EnsureUniqueAsync(string name, string code, int? exceptId, CancellationToken cancellationToken)
    {
        if (await db.Departments.AnyAsync(d => d.Name == name && d.Id != exceptId, cancellationToken))
        {
            throw Validation.Fail(nameof(SaveDepartmentRequest.Name), "Another department already has this name.");
        }

        if (await db.Departments.AnyAsync(d => d.Code == code && d.Id != exceptId, cancellationToken))
        {
            throw Validation.Fail(nameof(SaveDepartmentRequest.Code), "Another department already has this code.");
        }
    }

    private static void EnsureNothingDependsOn(AdminDepartmentDto department)
    {
        var blockers = new List<string>();
        if (department.ActiveUserCount > 0)
        {
            blockers.Add($"{department.ActiveUserCount} active user(s)");
        }

        if (department.ActiveStepCount > 0)
        {
            blockers.Add($"{department.ActiveStepCount} workflow step(s) of active case types");
        }

        if (department.ActiveTaskCount > 0)
        {
            blockers.Add($"{department.ActiveTaskCount} active task(s)");
        }

        if (blockers.Count > 0)
        {
            throw new ConflictException(
                $"{department.Name} can't be deactivated while it has {string.Join(", ", blockers)}. Move or finish those first.");
        }
    }

    private IQueryable<AdminDepartmentDto> Project(IQueryable<Department> departments) =>
        departments.Select(d => new AdminDepartmentDto(
            d.Id,
            d.Name,
            d.Code,
            d.IsActive,
            d.Users.Count(u => u.IsActive),
            db.WorkflowStepTemplates.Count(s => s.DepartmentId == d.Id && s.CaseType.IsActive),
            db.WorkflowTasks.Count(t => t.DepartmentId == d.Id && t.Status == WorkflowTaskStatus.Active)));
}
