using CivicFlow.Domain.Common;
using CivicFlow.Domain.Enums;

namespace CivicFlow.Domain.Entities;

public class User : Entity
{
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Staff;
    public bool IsActive { get; set; } = true;

    /// <summary>Null only for agency-wide accounts, such as an Admin outside any department.</summary>
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
}
