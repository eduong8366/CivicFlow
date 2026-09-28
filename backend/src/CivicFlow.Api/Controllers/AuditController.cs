using CivicFlow.Api.Auth;
using CivicFlow.Application.Audit;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

/// <summary>The audit log, written automatically whenever data changes.</summary>
[ApiController]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class AuditController(AuditService auditService) : ControllerBase
{
    /// <summary>A case's history (its tasks, comments and attachments too), newest first. Visible with the case.</summary>
    [HttpGet("api/cases/{caseId:int}/audit")]
    [ProducesResponseType<PagedResult<AuditEntryDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<PagedResult<AuditEntryDto>> CaseHistory(int caseId, [FromQuery] PageQuery query, CancellationToken cancellationToken) =>
        await auditService.GetCaseHistoryAsync(caseId, query, cancellationToken);

    /// <summary>
    /// The agency audit log, newest first. Supervisors see entries for cases involving their
    /// department; admins see everything, including changes outside cases.
    /// </summary>
    [HttpGet("api/audit")]
    [Authorize(Policy = Policies.SupervisorOrAdmin)]
    [ProducesResponseType<PagedResult<AuditEntryDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResult<AuditEntryDto>> Search([FromQuery] AuditQuery query, CancellationToken cancellationToken) =>
        await auditService.SearchAsync(query, cancellationToken);
}
