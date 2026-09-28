using CivicFlow.Domain.Common;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Domain.Entities;

/// <summary>An admin-defined field on a case type's intake form.</summary>
public class CaseTypeField : Entity
{
    public int CaseTypeId { get; set; }
    public CaseType CaseType { get; set; } = null!;

    public string Label { get; set; } = string.Empty;

    /// <summary>Stable machine name, unique within the case type.</summary>
    public string Key { get; set; } = string.Empty;
    public FieldDataType DataType { get; set; }
    public bool IsRequired { get; set; }

    /// <summary>Choices for <see cref="FieldDataType.Select"/> fields; stored as a JSON array.</summary>
    public List<string> Options { get; set; } = [];
    public int SortOrder { get; set; }
}
