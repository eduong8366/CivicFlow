using CivicFlow.Application.Lookups;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

/// <summary>Reference lists for any signed-in user: departments, and colleagues' names and roles.</summary>
[ApiController]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class LookupsController(LookupService lookupService) : ControllerBase
{
    [HttpGet("api/departments")]
    [ProducesResponseType<IReadOnlyList<DepartmentLookupDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<DepartmentLookupDto>> Departments(bool includeInactive, CancellationToken cancellationToken) =>
        await lookupService.GetDepartmentsAsync(includeInactive, cancellationToken);

    /// <summary>Active users, optionally one department's (e.g. for the assign dialog).</summary>
    [HttpGet("api/users")]
    [ProducesResponseType<IReadOnlyList<UserLookupDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<UserLookupDto>> Users([FromQuery] UserLookupQuery query, CancellationToken cancellationToken) =>
        await lookupService.GetUsersAsync(query, cancellationToken);
}
