using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Common;
using CivicFlow.Application.Workflow;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Admin;

/// <summary>
/// The case type designer's backend (admins only). A save replaces the whole definition: fields
/// and steps are matched by id, in the order given. Anything existing cases depend on is protected:
/// a field with values can't be removed or change type, and a step with tasks can't be removed.
/// Case types are deactivated, never deleted.
/// </summary>
public sealed class AdminCaseTypeService(ICivicFlowDbContext db, IValidator<SaveCaseTypeRequest> validator)
{
    public async Task<IReadOnlyList<AdminCaseTypeListItemDto>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.CaseTypes
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new AdminCaseTypeListItemDto(
                t.Id,
                t.Name,
                t.Prefix,
                t.Description,
                t.IsActive,
                t.Fields.Count,
                t.Steps.Count,
                db.Cases.Count(c => c.CaseTypeId == t.Id),
                db.Cases.Count(c => c.CaseTypeId == t.Id
                    && (c.Status == CaseStatus.Open || c.Status == CaseStatus.InProgress || c.Status == CaseStatus.OnHold))))
            .ToListAsync(cancellationToken);

    public async Task<AdminCaseTypeDto> GetAsync(int id, CancellationToken cancellationToken = default)
    {
        var caseType = await db.CaseTypes
            .AsNoTracking()
            .Include(t => t.Fields)
            .Include(t => t.Steps).ThenInclude(s => s.Department)
            .SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw new NotFoundException("Case type", id);

        var usage = await LoadUsageAsync(id, cancellationToken);
        var caseCount = await db.Cases.CountAsync(c => c.CaseTypeId == id, cancellationToken);

        return new AdminCaseTypeDto(
            caseType.Id,
            caseType.Name,
            caseType.Prefix,
            caseType.Description,
            caseType.IsActive,
            caseCount,
            caseType.Fields
                .OrderBy(f => f.SortOrder)
                .Select(f => new AdminCaseTypeFieldDto(
                    f.Id, f.Key, f.Label, f.DataType, f.IsRequired, f.Options, f.SortOrder, usage.FieldIds.Contains(f.Id)))
                .ToList(),
            caseType.Steps
                .OrderBy(s => s.SortOrder)
                .Select(s => new AdminWorkflowStepDto(
                    s.Id, s.Name, s.SortOrder, s.DepartmentId, s.Department.Name, s.Department.IsActive, s.SlaDays,
                    TaskOutcomes.Split(s.AllowedOutcomes), usage.StepIds.Contains(s.Id)))
                .ToList());
    }

    public async Task<AdminCaseTypeDto> CreateAsync(SaveCaseTypeRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        for (var i = 0; i < request.Fields.Count; i++)
        {
            if (request.Fields[i].Id is not null)
            {
                throw Validation.Fail($"Fields[{i}].Id", "A new case type can't include existing fields.");
            }
        }

        for (var i = 0; i < request.Steps.Count; i++)
        {
            if (request.Steps[i].Id is not null)
            {
                throw Validation.Fail($"Steps[{i}].Id", "A new case type can't include existing steps.");
            }
        }

        var caseType = new CaseType();
        await ApplyAsync(caseType, request, Usage.None, cancellationToken);

        db.CaseTypes.Add(caseType);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(caseType.Id, cancellationToken);
    }

    public async Task<AdminCaseTypeDto> UpdateAsync(int id, SaveCaseTypeRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        var caseType = await db.CaseTypes
            .Include(t => t.Fields)
            .Include(t => t.Steps)
            .SingleOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw new NotFoundException("Case type", id);

        await ApplyAsync(caseType, request, await LoadUsageAsync(id, cancellationToken), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(id, cancellationToken);
    }

    /// <summary>Checks the request against the database and copies it onto <paramref name="caseType"/>.</summary>
    private async Task ApplyAsync(CaseType caseType, SaveCaseTypeRequest request, Usage usage, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        var prefix = request.Prefix.Trim().ToUpperInvariant();
        var exceptId = caseType.Id;

        if (await db.CaseTypes.AnyAsync(t => t.Name == name && t.Id != exceptId, cancellationToken))
        {
            throw Validation.Fail(nameof(request.Name), "Another case type already has this name.");
        }

        if (await db.CaseTypes.AnyAsync(t => t.Prefix == prefix && t.Id != exceptId, cancellationToken))
        {
            throw Validation.Fail(nameof(request.Prefix), "Another case type already uses this prefix.");
        }

        await EnsureDepartmentsAsync(request, cancellationToken);

        caseType.Name = name;
        caseType.Prefix = prefix;
        caseType.Description = Validation.Clean(request.Description);
        caseType.IsActive = request.IsActive;

        ApplyFields(caseType, request.Fields, usage.FieldIds);
        ApplySteps(caseType, request.Steps, usage.StepIds);
    }

    /// <summary>Steps must route to departments that exist; to active ones while the case type is in use.</summary>
    private async Task EnsureDepartmentsAsync(SaveCaseTypeRequest request, CancellationToken cancellationToken)
    {
        var ids = request.Steps.Select(s => s.DepartmentId).Distinct().ToList();
        var departments = await db.Departments
            .Where(d => ids.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.IsActive, cancellationToken);

        for (var i = 0; i < request.Steps.Count; i++)
        {
            if (!departments.TryGetValue(request.Steps[i].DepartmentId, out var isActive) || (request.IsActive && !isActive))
            {
                throw Validation.Fail($"Steps[{i}].DepartmentId", "Choose an active department.");
            }
        }
    }

    private void ApplyFields(CaseType caseType, IReadOnlyList<CaseTypeFieldInput> inputs, IReadOnlySet<int> usedIds)
    {
        var existing = caseType.Fields.ToDictionary(f => f.Id);
        var keptIds = inputs.Where(f => f.Id is not null).Select(f => f.Id!.Value).ToHashSet();

        foreach (var removed in existing.Values.Where(f => !keptIds.Contains(f.Id)).ToList())
        {
            if (usedIds.Contains(removed.Id))
            {
                throw Validation.Fail(nameof(SaveCaseTypeRequest.Fields),
                    $"'{removed.Label}' has values on existing cases, so it can't be removed.");
            }

            caseType.Fields.Remove(removed);
            db.CaseTypeFields.Remove(removed);
        }

        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            CaseTypeField field;
            if (input.Id is { } id)
            {
                field = existing.GetValueOrDefault(id)
                    ?? throw Validation.Fail($"Fields[{i}].Id", "This field isn't part of this case type.");
                if (usedIds.Contains(id) && field.DataType != input.DataType)
                {
                    throw Validation.Fail($"Fields[{i}].DataType",
                        $"'{field.Label}' has values on existing cases, so its type can't change.");
                }
            }
            else
            {
                field = new CaseTypeField();
                caseType.Fields.Add(field);
            }

            field.Key = input.Key.Trim();
            field.Label = input.Label.Trim();
            field.DataType = input.DataType;
            field.IsRequired = input.IsRequired;
            field.Options = input.DataType == FieldDataType.Select ? input.Options!.Select(o => o.Trim()).ToList() : [];
            field.SortOrder = i + 1;
        }
    }

    private void ApplySteps(CaseType caseType, IReadOnlyList<WorkflowStepInput> inputs, IReadOnlySet<int> usedIds)
    {
        var existing = caseType.Steps.ToDictionary(s => s.Id);
        var keptIds = inputs.Where(s => s.Id is not null).Select(s => s.Id!.Value).ToHashSet();

        foreach (var removed in existing.Values.Where(s => !keptIds.Contains(s.Id)).ToList())
        {
            if (usedIds.Contains(removed.Id))
            {
                throw Validation.Fail(nameof(SaveCaseTypeRequest.Steps),
                    $"The '{removed.Name}' step has tasks on existing cases, so it can't be removed.");
            }

            caseType.Steps.Remove(removed);
            db.WorkflowStepTemplates.Remove(removed);
        }

        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            WorkflowStepTemplate step;
            if (input.Id is { } id)
            {
                step = existing.GetValueOrDefault(id)
                    ?? throw Validation.Fail($"Steps[{i}].Id", "This step isn't part of this case type.");
            }
            else
            {
                step = new WorkflowStepTemplate();
                caseType.Steps.Add(step);
            }

            step.Name = input.Name.Trim();
            step.DepartmentId = input.DepartmentId;
            step.SlaDays = input.SlaDays;
            step.AllowedOutcomes = input.AllowedOutcomes.Aggregate(TaskOutcome.None, (all, o) => all | o);
            step.SortOrder = i + 1;
        }
    }

    private async Task<Usage> LoadUsageAsync(int caseTypeId, CancellationToken cancellationToken)
    {
        var fieldIds = await db.CaseFieldValues
            .Where(v => v.Field.CaseTypeId == caseTypeId)
            .Select(v => v.FieldId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var stepIds = await db.WorkflowTasks
            .Where(t => t.StepTemplate.CaseTypeId == caseTypeId)
            .Select(t => t.StepTemplateId)
            .Distinct()
            .ToListAsync(cancellationToken);

        return new Usage(fieldIds.ToHashSet(), stepIds.ToHashSet());
    }

    /// <summary>The fields with values on cases, and the steps with tasks on cases.</summary>
    private sealed record Usage(IReadOnlySet<int> FieldIds, IReadOnlySet<int> StepIds)
    {
        public static readonly Usage None = new(new HashSet<int>(), new HashSet<int>());
    }
}
