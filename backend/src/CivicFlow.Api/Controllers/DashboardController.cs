using CivicFlow.Application.Dashboard;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class DashboardController(DashboardService dashboardService) : ControllerBase
{
    /// <summary>
    /// KPI tiles and chart data: personal for staff, the department for supervisors, and agency-wide
    /// for admins, who may pass <c>departmentId</c> to see one department.
    /// </summary>
    [HttpGet("summary")]
    [ProducesResponseType<DashboardSummaryDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<DashboardSummaryDto> Summary([FromQuery] DashboardQuery query, CancellationToken cancellationToken) =>
        await dashboardService.GetSummaryAsync(query, cancellationToken);
}
