using CivicFlow.Application.Attachments;
using CivicFlow.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace CivicFlow.Api.Controllers;

/// <summary>Files attached to cases. Anyone who can view a case can list, upload and download its files.</summary>
[ApiController]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
public sealed class AttachmentsController(AttachmentService attachmentService) : ControllerBase
{
    // Room for the multipart framing around a maximum-size file; the service enforces the exact limit.
    private const long UploadRequestLimit = AttachmentRules.MaxSizeBytes + 64 * 1024;

    /// <summary>The case's attachments, newest first.</summary>
    [HttpGet("api/cases/{caseId:int}/attachments")]
    [ProducesResponseType<PagedResult<AttachmentDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResult<AttachmentDto>> List(int caseId, [FromQuery] PageQuery query, CancellationToken cancellationToken) =>
        await attachmentService.ListAsync(caseId, query, cancellationToken);

    /// <summary>Uploads a file (form field <c>file</c>), up to 10 MB, of an allowed type.</summary>
    [HttpPost("api/cases/{caseId:int}/attachments")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(UploadRequestLimit)]
    [RequestFormLimits(MultipartBodyLengthLimit = UploadRequestLimit)]
    [ProducesResponseType<AttachmentDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Upload(int caseId, IFormFile file, CancellationToken cancellationToken)
    {
        await using var content = file.OpenReadStream();
        var attachment = await attachmentService.UploadAsync(
            caseId, new AttachmentUpload(file.FileName, file.Length, content), cancellationToken);

        return Created($"/api/attachments/{attachment.Id}/download", attachment);
    }

    /// <summary>Downloads an attachment's file.</summary>
    [HttpGet("api/attachments/{id:int}/download")]
    [ProducesResponseType<FileStreamResult>(StatusCodes.Status200OK, "application/octet-stream")]
    public async Task<IActionResult> Download(int id, CancellationToken cancellationToken)
    {
        var attachment = await attachmentService.OpenAsync(id, cancellationToken);

        // Always a download, never rendered inline, and the browser mustn't second-guess the type.
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(attachment.Content, attachment.ContentType, attachment.FileName);
    }
}
