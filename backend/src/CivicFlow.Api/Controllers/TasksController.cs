using CivicFlow.Api.Auth;
using CivicFlow.Application.Cases;
using CivicFlow.Application.Common;
using CivicFlow.Application.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

/// <summary>Workflow task actions. Each action returns the updated case.</summary>
[ApiController]
[Route("api/tasks")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class TasksController(TaskService taskService) : ControllerBase
{
    /// <summary>The caller's active tasks, soonest due first.</summary>
    [HttpGet("mine")]
    [ProducesResponseType<PagedResult<TaskListItemDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResult<TaskListItemDto>> Mine([FromQuery] PageQuery query, CancellationToken cancellationToken) =>
        await taskService.GetMineAsync(query, cancellationToken);

    /// <summary>Unassigned tasks in the caller's department queue (admins: any department, or all).</summary>
    [HttpGet("queue")]
    [ProducesResponseType<PagedResult<TaskListItemDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<PagedResult<TaskListItemDto>> Queue([FromQuery] TaskQueueQuery query, CancellationToken cancellationToken) =>
        await taskService.GetQueueAsync(query, cancellationToken);

    [HttpPost("{id:int}/claim")]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<CaseDetailDto> Claim(int id, CancellationToken cancellationToken) =>
        await taskService.ClaimAsync(id, cancellationToken);

    [HttpPost("{id:int}/assign")]
    [Authorize(Policy = Policies.SupervisorOrAdmin)]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<CaseDetailDto> Assign(int id, AssignTaskRequest request, CancellationToken cancellationToken) =>
        await taskService.AssignAsync(id, request, cancellationToken);

    [HttpPost("{id:int}/complete")]
    [ProducesResponseType<CaseDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<CaseDetailDto> Complete(int id, CompleteTaskRequest request, CancellationToken cancellationToken) =>
        await taskService.CompleteAsync(id, request, cancellationToken);
}
