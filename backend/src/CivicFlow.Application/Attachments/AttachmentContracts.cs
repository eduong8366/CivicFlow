using CivicFlow.Application.Cases;
using FluentValidation;

namespace CivicFlow.Application.Attachments;

public sealed record AttachmentDto(
    int Id,
    int CaseId,
    string FileName,
    string ContentType,
    long Size,
    UserSummaryDto UploadedBy,
    DateTimeOffset UploadedAt);

/// <summary>An uploaded file as the API received it. <see cref="Content"/> is read once, when it's stored.</summary>
public sealed record AttachmentUpload(string FileName, long Length, Stream Content);

/// <summary>A stored file ready to send back. The caller disposes <see cref="Content"/>.</summary>
public sealed record AttachmentContent(string FileName, string ContentType, Stream Content);

public static class AttachmentRules
{
    public const long MaxSizeBytes = 10 * 1024 * 1024;
    public const int MaxFileNameLength = 255;

    /// <summary>
    /// The file types that may be uploaded, and the content type each is served with. The type comes
    /// from this list, never from the client, so a file can't claim to be something else.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> ContentTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".pdf"] = "application/pdf",
            [".png"] = "image/png",
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".gif"] = "image/gif",
            [".txt"] = "text/plain",
            [".csv"] = "text/csv",
            [".doc"] = "application/msword",
            [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            [".xls"] = "application/vnd.ms-excel",
            [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };

    /// <summary>The name without any client-side directory, with characters Windows won't accept in a file name replaced.</summary>
    public static string CleanFileName(string fileName)
    {
        var name = Path.GetFileName(fileName.Replace('\\', '/')).Trim();
        var invalid = Path.GetInvalidFileNameChars();
        return new string(name.Select(c => invalid.Contains(c) || char.IsControl(c) ? '_' : c).ToArray());
    }
}

public sealed class AttachmentUploadValidator : AbstractValidator<AttachmentUpload>
{
    // Errors are keyed "File", after the multipart form field, so a form can show them by its file input.
    public AttachmentUploadValidator()
    {
        RuleFor(u => AttachmentRules.CleanFileName(u.FileName))
            .NotEmpty().WithMessage("The file needs a name.")
            .MaximumLength(AttachmentRules.MaxFileNameLength)
            .Must(name => AttachmentRules.ContentTypes.ContainsKey(Path.GetExtension(name)))
            .WithMessage($"Only these file types can be attached: {string.Join(", ", AttachmentRules.ContentTypes.Keys)}.")
            .OverridePropertyName("File");

        RuleFor(u => u.Length)
            .GreaterThan(0).WithMessage("The file is empty.")
            .LessThanOrEqualTo(AttachmentRules.MaxSizeBytes)
            .WithMessage($"Files can be at most {AttachmentRules.MaxSizeBytes / (1024 * 1024)} MB.")
            .OverridePropertyName("File");
    }
}
