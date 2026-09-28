using CivicFlow.Domain.Common;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Domain.Entities;

public class Case : Entity
{
    public string CaseNumber { get; set; } = string.Empty;

    public int CaseTypeId { get; set; }
    public CaseType CaseType { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public CasePriority Priority { get; set; } = CasePriority.Normal;
    public CaseStatus Status { get; set; } = CaseStatus.Open;
    public CaseResolution? Resolution { get; set; }

    public string RequesterName { get; set; } = string.Empty;
    public string? RequesterEmail { get; set; }
    public string? RequesterPhone { get; set; }
    public string? RequesterAddress { get; set; }

    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<CaseFieldValue> FieldValues { get; set; } = [];
    public ICollection<WorkflowTask> Tasks { get; set; } = [];
    public ICollection<Comment> Comments { get; set; } = [];
    public ICollection<Attachment> Attachments { get; set; } = [];

    /// <summary>Formats a case number such as <c>BLD-2026-000042</c>.</summary>
    public static string FormatCaseNumber(string prefix, int year, long sequence) =>
        $"{prefix}-{year}-{sequence:D6}";
}
