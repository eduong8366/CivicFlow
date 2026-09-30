using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Cases;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Audit;

/// <summary>
/// Reads the audit log, which <c>SaveChanges</c> writes automatically. A case's history is visible to
/// anyone who can view the case; the agency-wide log is for supervisors (cases involving their
/// department) and admins (everything, including changes outside cases such as user accounts).
/// </summary>
public sealed class AuditService(
    ICivicFlowDbContext db,
    ICurrentUser currentUser,
    IValidator<PageQuery> pageValidator,
    IValidator<AuditQuery> auditValidator)
{
    /// <summary>Everything that happened to a case, its tasks, comments and attachments, newest first.</summary>
    public async Task<PagedResult<AuditEntryDto>> GetCaseHistoryAsync(
        int caseId, PageQuery query, CancellationToken cancellationToken = default)
    {
        await pageValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();
        await db.EnsureCanViewCaseAsync(caseId, actor, cancellationToken);

        return await ToPagedListAsync(db.AuditLogs.Where(a => a.CaseId == caseId), query, cancellationToken);
    }

    public async Task<PagedResult<AuditEntryDto>> SearchAsync(AuditQuery query, CancellationToken cancellationToken = default)
    {
        await auditValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();

        var entries = db.AuditLogs.AsQueryable();
        if (!actor.IsAdmin)
        {
            if (actor.Role != UserRole.Supervisor)
            {
                throw new ForbiddenException("Only supervisors and admins can view the audit log.");
            }

            var visibleCaseIds = db.Cases.Where(WorkflowPermissions.CanView(actor)).Select(c => c.Id);
            entries = entries.Where(a => a.CaseId != null && visibleCaseIds.Contains(a.CaseId.Value));
        }

        if (Validation.Clean(query.EntityType) is { } entityType)
        {
            entries = entries.Where(a => a.EntityType == entityType);
        }

        if (Validation.Clean(query.EntityId) is { } entityId)
        {
            entries = entries.Where(a => a.EntityId == entityId);
        }

        if (query.CaseId is { } caseId)
        {
            entries = entries.Where(a => a.CaseId == caseId);
        }

        if (query.UserId is { } userId)
        {
            entries = entries.Where(a => a.UserId == userId);
        }

        if (Validation.Clean(query.Action) is { } action)
        {
            entries = entries.Where(a => a.Action == action);
        }

        if (query.From is { } from)
        {
            var start = AgencyTime.StartOfDay(from);
            entries = entries.Where(a => a.Timestamp >= start);
        }

        if (query.To is { } to)
        {
            var end = AgencyTime.StartOfDay(to.AddDays(1));
            entries = entries.Where(a => a.Timestamp < end);
        }

        return await ToPagedListAsync(entries, query, cancellationToken);
    }

    private async Task<PagedResult<AuditEntryDto>> ToPagedListAsync(
        IQueryable<AuditLog> entries, PageQuery query, CancellationToken cancellationToken)
    {
        // Audit rows have no foreign keys (history outlives the rows it describes), so names are left joins.
        var rows =
            from a in entries
            join u in db.Users on a.UserId equals (int?)u.Id into users
            from u in users.DefaultIfEmpty()
            join c in db.Cases on a.CaseId equals (int?)c.Id into cases
            from c in cases.DefaultIfEmpty()
            orderby a.Timestamp descending, a.Id descending
            select new
            {
                a.Id,
                a.Timestamp,
                a.EntityType,
                a.EntityId,
                a.Action,
                a.CaseId,
                CaseNumber = c == null ? null : c.CaseNumber,
                a.UserId,
                UserName = u == null ? null : u.FullName,
                a.Changes,
            };

        var page = await rows.AsNoTracking().ToPagedResultAsync(query, cancellationToken);

        return new PagedResult<AuditEntryDto>(
            page.Items
                .Select(a => new AuditEntryDto(
                    a.Id, a.Timestamp, a.EntityType, a.EntityId, a.Action, a.CaseId, a.CaseNumber,
                    a.UserId, a.UserName, AuditChanges.Deserialize(a.Changes)))
                .ToList(),
            page.Page, page.PageSize, page.TotalCount);
    }
}
