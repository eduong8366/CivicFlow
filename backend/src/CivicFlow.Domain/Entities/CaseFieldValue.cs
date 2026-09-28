using CivicFlow.Domain.Common;

namespace CivicFlow.Domain.Entities;

/// <summary>
/// A case's answer to one custom field. Values are stored as invariant strings:
/// ISO dates (yyyy-MM-dd), invariant numbers and "true"/"false".
/// </summary>
public class CaseFieldValue : Entity
{
    public int CaseId { get; set; }
    public Case Case { get; set; } = null!;

    public int FieldId { get; set; }
    public CaseTypeField Field { get; set; } = null!;

    public string? Value { get; set; }
}
