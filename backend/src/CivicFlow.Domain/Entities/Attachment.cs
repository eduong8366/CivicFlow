using CivicFlow.Domain.Common;

namespace CivicFlow.Domain.Entities;

/// <summary>Metadata for an uploaded file; the bytes live on disk outside the web root.</summary>
public class Attachment : Entity
{
    public int CaseId { get; set; }
    public Case Case { get; set; } = null!;

    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public string StoragePath { get; set; } = string.Empty;

    public int UploadedById { get; set; }
    public User UploadedBy { get; set; } = null!;
    public DateTimeOffset UploadedAt { get; set; }
}
