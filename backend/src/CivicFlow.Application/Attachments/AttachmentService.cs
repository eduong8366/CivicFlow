using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Cases;
using CivicFlow.Application.Common;
using CivicFlow.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Attachments;

/// <summary>
/// Case attachments. Anyone who can view a case can list, upload and download its files. The bytes
/// go to <see cref="IFileStorage"/>; the database holds the metadata.
/// </summary>
public sealed class AttachmentService(
    ICivicFlowDbContext db,
    ICurrentUser currentUser,
    IFileStorage storage,
    TimeProvider timeProvider,
    IValidator<PageQuery> pageValidator,
    IValidator<AttachmentUpload> uploadValidator)
{
    /// <summary>A case's attachments, newest first.</summary>
    public async Task<PagedResult<AttachmentDto>> ListAsync(int caseId, PageQuery query, CancellationToken cancellationToken = default)
    {
        await pageValidator.ValidateAndThrowAsync(query, cancellationToken);
        var actor = currentUser.RequireActor();
        await db.EnsureCanViewCaseAsync(caseId, actor, cancellationToken);

        return await db.Attachments
            .AsNoTracking()
            .Where(a => a.CaseId == caseId)
            .OrderByDescending(a => a.UploadedAt)
            .ThenByDescending(a => a.Id)
            .Select(a => new AttachmentDto(
                a.Id, a.CaseId, a.FileName, a.ContentType, a.Size,
                new UserSummaryDto(a.UploadedBy.Id, a.UploadedBy.FullName), a.UploadedAt))
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<AttachmentDto> UploadAsync(int caseId, AttachmentUpload upload, CancellationToken cancellationToken = default)
    {
        await uploadValidator.ValidateAndThrowAsync(upload, cancellationToken);
        var actor = currentUser.RequireActor();
        await db.EnsureCanViewCaseAsync(caseId, actor, cancellationToken);

        var fileName = AttachmentRules.CleanFileName(upload.FileName);
        var storagePath = await storage.SaveAsync(upload.Content, cancellationToken);

        var attachment = new Attachment
        {
            CaseId = caseId,
            FileName = fileName,
            ContentType = AttachmentRules.ContentTypes[Path.GetExtension(fileName)],
            Size = upload.Length,
            StoragePath = storagePath,
            UploadedById = actor.UserId,
            UploadedAt = timeProvider.GetUtcNow(),
        };
        db.Attachments.Add(attachment);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Don't leave a file behind that no record points to.
            storage.Delete(storagePath);
            throw;
        }

        var uploader = await db.Users.AsNoTracking()
            .Where(u => u.Id == actor.UserId)
            .Select(u => new UserSummaryDto(u.Id, u.FullName))
            .SingleAsync(cancellationToken);

        return new AttachmentDto(
            attachment.Id, caseId, attachment.FileName, attachment.ContentType, attachment.Size, uploader, attachment.UploadedAt);
    }

    /// <summary>Opens an attachment's file for download, if the caller may view its case.</summary>
    public async Task<AttachmentContent> OpenAsync(int id, CancellationToken cancellationToken = default)
    {
        var actor = currentUser.RequireActor();
        var attachment = await db.Attachments.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id, cancellationToken)
            ?? throw new NotFoundException("Attachment", id);
        await db.EnsureCanViewCaseAsync(attachment.CaseId, actor, cancellationToken);

        var content = storage.OpenRead(attachment.StoragePath)
            ?? throw new NotFoundException("Attachment file", id);

        return new AttachmentContent(attachment.FileName, attachment.ContentType, content);
    }
}
