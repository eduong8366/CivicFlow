using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Cases;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Comments;

/// <summary>
/// Case comments. Anyone who can view a case can read and add them, whatever the case's status.
/// There's no public portal yet, so staff see internal and public comments alike.
/// </summary>
public sealed class CommentService(
    ICivicFlowDbContext db,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    IValidator<PageQuery> pageValidator,
    IValidator<CreateCommentRequest> createValidator)
{
    /// <summary>A case's comments, oldest first, so they read as a conversation.</summary>
    public async Task<PagedResult<CommentDto>> ListAsync(int caseId, PageQuery query, CancellationToken cancellationToken = default)
    {
        await pageValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();
        await db.EnsureCanViewCaseAsync(caseId, actor, cancellationToken);

        return await db.Comments
            .AsNoTracking()
            .Where(c => c.CaseId == caseId)
            .OrderBy(c => c.CreatedAt)
            .ThenBy(c => c.Id)
            .Select(c => new CommentDto(
                c.Id, c.CaseId, c.Body, c.IsInternal, new UserSummaryDto(c.Author.Id, c.Author.FullName), c.CreatedAt))
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<CommentDto> CreateAsync(int caseId, CreateCommentRequest request, CancellationToken cancellationToken = default)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);
        var actor = currentUser.RequireActor();
        await db.EnsureCanViewCaseAsync(caseId, actor, cancellationToken);

        var comment = new Comment
        {
            CaseId = caseId,
            AuthorId = actor.UserId,
            Body = request.Body.Trim(),
            IsInternal = request.IsInternal,
            CreatedAt = timeProvider.GetUtcNow(),
        };
        db.Comments.Add(comment);
        await db.SaveChangesAsync(cancellationToken);

        var author = await db.Users.AsNoTracking()
            .Where(u => u.Id == actor.UserId)
            .Select(u => new UserSummaryDto(u.Id, u.FullName))
            .SingleAsync(cancellationToken);

        return new CommentDto(comment.Id, caseId, comment.Body, comment.IsInternal, author, comment.CreatedAt);
    }
}
