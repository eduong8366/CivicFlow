using CivicFlow.Application.CaseTypes;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

/// <summary>Active case types and their form fields, for opening cases. Admin editing lives under /api/admin.</summary>
[ApiController]
[Route("api/case-types")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class CaseTypesController(CaseTypeService caseTypeService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CaseTypeDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<CaseTypeDto>> List(CancellationToken cancellationToken) =>
        await caseTypeService.GetActiveAsync(cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<CaseTypeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<CaseTypeDto> Get(int id, CancellationToken cancellationToken) =>
        await caseTypeService.GetAsync(id, cancellationToken);
}
