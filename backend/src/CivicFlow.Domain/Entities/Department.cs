using CivicFlow.Domain.Common;

namespace CivicFlow.Domain.Entities;

public class Department : Entity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    public ICollection<User> Users { get; set; } = [];
}
