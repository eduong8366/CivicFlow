using CivicFlow.Application.Cases;
using FluentValidation;

namespace CivicFlow.Application.Comments;

public sealed record CommentDto(int Id, int CaseId, string Body, bool IsInternal, UserSummaryDto Author, DateTimeOffset CreatedAt);

/// <summary>
/// A comment on a case. Internal comments are for staff only; public ones may one day be shown to the
/// requester. Comments are internal unless marked otherwise, so nothing is made public by accident.
/// </summary>
public sealed record CreateCommentRequest(string Body, bool IsInternal = true);

public sealed class CreateCommentRequestValidator : AbstractValidator<CreateCommentRequest>
{
    public const int MaxBodyLength = 4000;

    public CreateCommentRequestValidator()
    {
        RuleFor(r => r.Body).NotEmpty().MaximumLength(MaxBodyLength);
    }
}
