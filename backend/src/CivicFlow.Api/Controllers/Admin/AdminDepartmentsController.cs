using CivicFlow.Api.Auth;
using CivicFlow.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers.Admin;

/// <summary>Departments, active and inactive. A department is deactivated only once nothing depends on it.</summary>
[ApiController]
[Route("api/admin/departments")]
[Authorize(Policy = Policies.Admin)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class AdminDepartmentsController(AdminDepartmentService departmentService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<AdminDepartmentDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<AdminDepartmentDto>> List(CancellationToken cancellationToken) =>
        await departmentService.ListAsync(cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<AdminDepartmentDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<AdminDepartmentDto> Get(int id, CancellationToken cancellationToken) =>
        await departmentService.GetAsync(id, cancellationToken);

    [HttpPost]
    [ProducesResponseType<AdminDepartmentDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(SaveDepartmentRequest request, CancellationToken cancellationToken)
    {
        var created = await departmentService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    /// <summary>Renames or (de)activates a department. Deactivating one with active users, steps or tasks is 409.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType<AdminDepartmentDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<AdminDepartmentDto> Update(int id, SaveDepartmentRequest request, CancellationToken cancellationToken) =>
        await departmentService.UpdateAsync(id, request, cancellationToken);
}
