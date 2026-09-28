using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.CaseTypes;

public sealed record CaseTypeDto(
    int Id,
    string Name,
    string Prefix,
    string? Description,
    IReadOnlyList<CaseTypeFieldDto> Fields,
    IReadOnlyList<WorkflowStepDto> Steps);

public sealed record CaseTypeFieldDto(
    int Id, string Key, string Label, FieldDataType DataType, bool IsRequired, IReadOnlyList<string> Options, int SortOrder);

public sealed record WorkflowStepDto(
    int Id, string Name, int SortOrder, int DepartmentId, string DepartmentName, int SlaDays, IReadOnlyList<TaskOutcome> AllowedOutcomes);

/// <summary>
/// The active case types any signed-in user can open cases of, with the field definitions the
/// New Case form renders. Editing case types is an admin feature with its own endpoints.
/// </summary>
public sealed class CaseTypeService(ICivicFlowDbContext db)
{
    public async Task<IReadOnlyList<CaseTypeDto>> GetActiveAsync(CancellationToken cancellationToken = default)
    {
        var caseTypes = await Query().OrderBy(t => t.Name).ToListAsync(cancellationToken);
        return caseTypes.Select(ToDto).ToList();
    }

    public async Task<CaseTypeDto> GetAsync(int id, CancellationToken cancellationToken = default)
    {
        var caseType = await Query().SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw new NotFoundException("Case type", id);
        return ToDto(caseType);
    }

    private IQueryable<CaseType> Query() => db.CaseTypes
        .AsNoTracking()
        .Where(t => t.IsActive)
        .Include(t => t.Fields)
        .Include(t => t.Steps).ThenInclude(s => s.Department);

    private static CaseTypeDto ToDto(CaseType caseType) => new(
        caseType.Id,
        caseType.Name,
        caseType.Prefix,
        caseType.Description,
        caseType.Fields
            .OrderBy(f => f.SortOrder)
            .Select(f => new CaseTypeFieldDto(f.Id, f.Key, f.Label, f.DataType, f.IsRequired, f.Options, f.SortOrder))
            .ToList(),
        caseType.Steps
            .OrderBy(s => s.SortOrder)
            .Select(s => new WorkflowStepDto(
                s.Id, s.Name, s.SortOrder, s.DepartmentId, s.Department.Name, s.SlaDays, TaskOutcomes.Split(s.AllowedOutcomes)))
            .ToList());
}
