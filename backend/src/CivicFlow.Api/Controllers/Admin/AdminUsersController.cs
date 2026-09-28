using CivicFlow.Api.Auth;
using CivicFlow.Application.Admin;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers.Admin;

/// <summary>User accounts. Accounts are deactivated rather than deleted.</summary>
[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = Policies.Admin)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class AdminUsersController(AdminUserService userService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PagedResult<AdminUserDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResult<AdminUserDto>> List([FromQuery] AdminUserQuery query, CancellationToken cancellationToken) =>
        await userService.ListAsync(query, cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<AdminUserDto> Get(int id, CancellationToken cancellationToken) =>
        await userService.GetAsync(id, cancellationToken);

    [HttpPost]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(CreateUserRequest request, CancellationToken cancellationToken)
    {
        var created = await userService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    /// <summary>
    /// Updates an account. Deactivating it, or moving it to another department, returns its active
    /// tasks to their department queues. Role and department changes apply at the user's next sign-in.
    /// </summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<AdminUserDto> Update(int id, UpdateUserRequest request, CancellationToken cancellationToken) =>
        await userService.UpdateAsync(id, request, cancellationToken);

    /// <summary>Sets a new password, e.g. for someone locked out. The hash change is audited; the password isn't.</summary>
    [HttpPost("{id:int}/password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ResetPassword(int id, ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        await userService.ResetPasswordAsync(id, request, cancellationToken);
        return NoContent();
    }
}
