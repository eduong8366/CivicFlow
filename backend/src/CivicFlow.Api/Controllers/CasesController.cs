using CivicFlow.Api.Auth;
using CivicFlow.Application.Cases;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

[ApiController]
[Route("api/cases")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class CasesController(CaseService caseService) : ControllerBase
{
    /// <summary>Searches the cases the caller may view.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResult<CaseListItemDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResult<CaseListItemDto>> Search([FromQuery] CaseSearchQuery query, CancellationToken cancellationToken) =>
        await caseService.SearchAsync(query, cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<CaseDetailDto> Get(int id, CancellationToken cancellationToken) =>
        await caseService.GetAsync(id, cancellationToken);

    /// <summary>Opens a case; its first workflow step lands in that step's department queue.</summary>
    [HttpPost]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(CreateCaseRequest request, CancellationToken cancellationToken)
    {
        var created = await caseService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPost("{id:int}/hold")]
    [Authorize(Policy = Policies.SupervisorOrAdmin)]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<CaseDetailDto> Hold(int id, CancellationToken cancellationToken) =>
        await caseService.HoldAsync(id, cancellationToken);

    [HttpPost("{id:int}/cancel")]
    [Authorize(Policy = Policies.SupervisorOrAdmin)]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<CaseDetailDto> Cancel(int id, CancellationToken cancellationToken) =>
        await caseService.CancelAsync(id, cancellationToken);

    /// <summary>
    /// Resumes an on-hold case or reopens a closed or cancelled one. No role policy here: the
    /// assignee of an on-hold case's active task may resume it too, which the service checks.
    /// </summary>
    [HttpPost("{id:int}/reopen")]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<CaseDetailDto> Reopen(int id, CancellationToken cancellationToken) =>
        await caseService.ReopenAsync(id, cancellationToken);
}
