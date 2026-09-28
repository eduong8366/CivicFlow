using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Workflow;

internal static class WorkflowLoading
{
    /// <summary>Loads a case, tracked, with what <see cref="WorkflowEngine"/> needs: its tasks and their step templates.</summary>
    public static async Task<Case> LoadCaseForWorkflowAsync(this ICivicFlowDbContext db, int caseId, CancellationToken cancellationToken)
    {
        return await db.Cases
            .Include(c => c.Tasks).ThenInclude(t => t.StepTemplate)
            .SingleOrDefaultAsync(c => c.Id == caseId, cancellationToken)
            ?? throw new NotFoundException("Case", caseId);
    }
}
