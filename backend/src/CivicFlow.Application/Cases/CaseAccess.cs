using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Cases;

internal static class CaseAccess
{
    /// <summary>
    /// 404 if the case doesn't exist, 403 if it exists but the caller may not see it. Everything that
    /// hangs off a case (comments, attachments, its audit history) is visible exactly when the case is.
    /// </summary>
    public static async Task EnsureCanViewCaseAsync(
        this ICivicFlowDbContext db, int caseId, Actor actor, CancellationToken cancellationToken)
    {
        if (await db.Cases.Where(c => c.Id == caseId).Where(WorkflowPermissions.CanView(actor)).AnyAsync(cancellationToken))
        {
            return;
        }

        throw await db.Cases.AnyAsync(c => c.Id == caseId, cancellationToken)
            ? new ForbiddenException("You don't have access to this case.")
            : new NotFoundException("Case", caseId);
    }
}
