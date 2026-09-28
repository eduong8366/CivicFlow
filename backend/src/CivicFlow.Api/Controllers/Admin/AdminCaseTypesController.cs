using CivicFlow.Api.Auth;
using CivicFlow.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers.Admin;

/// <summary>The case type designer: form fields and workflow steps, active and inactive types.</summary>
[ApiController]
[Route("api/admin/case-types")]
[Authorize(Policy = Policies.Admin)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class AdminCaseTypesController(AdminCaseTypeService caseTypeService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<AdminCaseTypeListItemDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<AdminCaseTypeListItemDto>> List(CancellationToken cancellationToken) =>
        await caseTypeService.ListAsync(cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<AdminCaseTypeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<AdminCaseTypeDto> Get(int id, CancellationToken cancellationToken) =>
        await caseTypeService.GetAsync(id, cancellationToken);

    [HttpPost]
    [ProducesResponseType<AdminCaseTypeDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(SaveCaseTypeRequest request, CancellationToken cancellationToken)
    {
        var created = await caseTypeService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    /// <summary>
    /// Replaces the definition. Fields and steps are matched by id and ordered as listed; ones left
    /// out are removed, unless existing cases use them (400).
    /// </summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType<AdminCaseTypeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<AdminCaseTypeDto> Update(int id, SaveCaseTypeRequest request, CancellationToken cancellationToken) =>
        await caseTypeService.UpdateAsync(id, request, cancellationToken);
}
