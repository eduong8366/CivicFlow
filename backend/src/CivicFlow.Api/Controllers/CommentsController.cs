using CivicFlow.Application.Comments;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

/// <summary>A case's comments. Anyone who can view the case can read and add them.</summary>
[ApiController]
[Route("api/cases/{caseId:int}/comments")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
public sealed class CommentsController(CommentService commentService) : ControllerBase
{
    /// <summary>The case's comments, oldest first.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResult<CommentDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResult<CommentDto>> List(int caseId, [FromQuery] PageQuery query, CancellationToken cancellationToken) =>
        await commentService.ListAsync(caseId, query, cancellationToken);

    /// <summary>Adds a comment. Comments are internal (staff only) unless <c>isInternal</c> is false.</summary>
    [HttpPost]
    [ProducesResponseType<CommentDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(int caseId, CreateCommentRequest request, CancellationToken cancellationToken)
    {
        var comment = await commentService.CreateAsync(caseId, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, comment);
    }
}
