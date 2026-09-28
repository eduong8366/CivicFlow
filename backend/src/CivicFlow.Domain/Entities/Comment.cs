using CivicFlow.Domain.Common;

namespace CivicFlow.Domain.Entities;

public class Comment : Entity
{
    public int CaseId { get; set; }
    public Case Case { get; set; } = null!;

    public int AuthorId { get; set; }
    public User Author { get; set; } = null!;

    public string Body { get; set; } = string.Empty;

    /// <summary>Internal comments are for staff only and never shown to the requester.</summary>
    public bool IsInternal { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
