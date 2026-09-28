using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Admin;

/// <summary>
/// User administration (admins only, enforced by the API's policy). Accounts are deactivated, never
/// deleted, so their history stays attributable. Role and department changes reach the user's
/// access token at their next sign-in.
/// </summary>
public sealed class AdminUserService(
    ICivicFlowDbContext db,
    ICurrentUser currentUser,
    IPasswordHasher passwordHasher,
    WorkflowEngine engine,
    IValidator<AdminUserQuery> queryValidator,
    IValidator<CreateUserRequest> createValidator,
    IValidator<UpdateUserRequest> updateValidator,
    IValidator<ResetPasswordRequest> passwordValidator)
{
    public async Task<PagedResult<AdminUserDto>> ListAsync(AdminUserQuery query, CancellationToken cancellationToken = default)
    {
        await queryValidator.ValidateAndThrowAsync(query, cancellationToken);

        var users = db.Users.AsNoTracking();
        if (Validation.Clean(query.Search) is { } search)
        {
            users = users.Where(u => u.FullName.Contains(search) || u.Email.Contains(search));
        }

        if (query.Role is { } role)
        {
            users = users.Where(u => u.Role == role);
        }

        if (query.DepartmentId is { } departmentId)
        {
            users = users.Where(u => u.DepartmentId == departmentId);
        }

        if (query.IsActive is { } isActive)
        {
            users = users.Where(u => u.IsActive == isActive);
        }

        return await Project(users.OrderBy(u => u.FullName).ThenBy(u => u.Id)).ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<AdminUserDto> GetAsync(int id, CancellationToken cancellationToken = default) =>
        await Project(db.Users.AsNoTracking().Where(u => u.Id == id)).SingleOrDefaultAsync(cancellationToken)
        ?? throw new NotFoundException("User", id);

    public async Task<AdminUserDto> CreateAsync(CreateUserRequest request, CancellationToken cancellationToken = default)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var email = request.Email.Trim();
        await EnsureEmailIsFreeAsync(email, exceptUserId: null, cancellationToken);
        await EnsureActiveDepartmentAsync(request.DepartmentId, cancellationToken);

        var user = new User
        {
            Email = email,
            FullName = request.FullName.Trim(),
            Role = request.Role,
            DepartmentId = request.DepartmentId,
        };
        user.PasswordHash = passwordHasher.Hash(user, request.Password);

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user.Id, cancellationToken);
    }

    public async Task<AdminUserDto> UpdateAsync(int id, UpdateUserRequest request, CancellationToken cancellationToken = default)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);
        var actor = currentUser.RequireActor();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id, cancellationToken)
            ?? throw new NotFoundException("User", id);

        // An admin can't lock themselves out; as the actor is an active admin, one always remains.
        if (user.Id == actor.UserId)
        {
            if (!request.IsActive)
            {
                throw Validation.Fail(nameof(request.IsActive), "You can't deactivate your own account.");
            }

            if (request.Role != UserRole.Admin)
            {
                throw Validation.Fail(nameof(request.Role), "You can't remove your own admin role.");
            }
        }

        var email = request.Email.Trim();
        await EnsureEmailIsFreeAsync(email, exceptUserId: id, cancellationToken);
        if (request.IsActive)
        {
            await EnsureActiveDepartmentAsync(request.DepartmentId, cancellationToken);
        }

        await ReleaseTasksAsync(user.Id, keepDepartmentId: request.IsActive ? request.DepartmentId : null, cancellationToken);

        user.Email = email;
        user.FullName = request.FullName.Trim();
        user.Role = request.Role;
        user.DepartmentId = request.DepartmentId;
        user.IsActive = request.IsActive;
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(id, cancellationToken);
    }

    public async Task ResetPasswordAsync(int id, ResetPasswordRequest request, CancellationToken cancellationToken = default)
    {
        await passwordValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id, cancellationToken)
            ?? throw new NotFoundException("User", id);

        user.PasswordHash = passwordHasher.Hash(user, request.Password);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Sends the user's active tasks back to their department queues, except those in
    /// <paramref name="keepDepartmentId"/>: all of them when the account is deactivated, or the
    /// old department's when the user moves. Nobody is left holding work they can no longer do.
    /// </summary>
    private async Task ReleaseTasksAsync(int userId, int? keepDepartmentId, CancellationToken cancellationToken)
    {
        var tasks = await db.WorkflowTasks
            .Where(t => t.AssigneeId == userId && t.Status == WorkflowTaskStatus.Active && t.DepartmentId != keepDepartmentId)
            .Select(t => new { t.Id, t.CaseId })
            .ToListAsync(cancellationToken);

        foreach (var task in tasks)
        {
            var @case = await db.LoadCaseForWorkflowAsync(task.CaseId, cancellationToken);
            engine.Assign(@case, @case.Tasks.Single(t => t.Id == task.Id), assigneeId: null);
        }
    }

    private async Task EnsureEmailIsFreeAsync(string email, int? exceptUserId, CancellationToken cancellationToken)
    {
        if (await db.Users.AnyAsync(u => u.Email == email && u.Id != exceptUserId, cancellationToken))
        {
            throw Validation.Fail("Email", "Another account already uses this email.");
        }
    }

    private async Task EnsureActiveDepartmentAsync(int? departmentId, CancellationToken cancellationToken)
    {
        if (departmentId is { } id && !await db.Departments.AnyAsync(d => d.Id == id && d.IsActive, cancellationToken))
        {
            throw Validation.Fail("DepartmentId", "Choose an active department.");
        }
    }

    private IQueryable<AdminUserDto> Project(IQueryable<User> users) =>
        users.Select(u => new AdminUserDto(
            u.Id,
            u.Email,
            u.FullName,
            u.Role,
            u.DepartmentId,
            u.Department == null ? null : u.Department.Name,
            u.IsActive,
            db.WorkflowTasks.Count(t => t.AssigneeId == u.Id && t.Status == WorkflowTaskStatus.Active)));
}
