using System.Globalization;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;
using FluentValidation.Results;

namespace CivicFlow.Application.Cases;

/// <summary>
/// Checks a case's custom field values against its case type's field definitions, and normalizes
/// them to the invariant strings <see cref="CaseFieldValue"/> stores.
/// </summary>
public static class CaseFieldValues
{
    public const int MaxLength = 2000;
    private const string DateFormat = "yyyy-MM-dd";

    /// <summary>
    /// Returns the normalized value of every field that has one (blank optional fields are left out).
    /// Throws a <see cref="ValidationException"/> listing every problem, keyed <c>Fields.{key}</c>.
    /// </summary>
    public static IReadOnlyList<(CaseTypeField Field, string Value)> Validate(
        IEnumerable<CaseTypeField> fields, IReadOnlyDictionary<string, string?>? values)
    {
        values ??= new Dictionary<string, string?>();
        var definitions = fields.OrderBy(f => f.SortOrder).ToList();
        var failures = new List<ValidationFailure>();
        var result = new List<(CaseTypeField, string)>();

        foreach (var key in values.Keys.Where(k => definitions.All(f => f.Key != k)))
        {
            failures.Add(new ValidationFailure(PropertyName(key), $"'{key}' is not a field of this case type."));
        }

        foreach (var field in definitions)
        {
            var raw = values.GetValueOrDefault(field.Key)?.Trim();
            if (string.IsNullOrEmpty(raw))
            {
                if (field.IsRequired)
                {
                    failures.Add(new ValidationFailure(PropertyName(field.Key), $"{field.Label} is required."));
                }

                continue;
            }

            var (value, error) = Normalize(field, raw);
            if (error is not null)
            {
                failures.Add(new ValidationFailure(PropertyName(field.Key), error));
            }
            else
            {
                result.Add((field, value!));
            }
        }

        return failures.Count > 0 ? throw new ValidationException(failures) : result;
    }

    private static string PropertyName(string key) => $"Fields.{key}";

    private static (string? Value, string? Error) Normalize(CaseTypeField field, string raw)
    {
        if (raw.Length > MaxLength)
        {
            return (null, $"{field.Label} must be {MaxLength} characters or fewer.");
        }

        var invariant = CultureInfo.InvariantCulture;
        switch (field.DataType)
        {
            case FieldDataType.Number:
                return decimal.TryParse(raw, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, invariant, out var number)
                    ? (number.ToString(invariant), null)
                    : (null, $"{field.Label} must be a number.");

            case FieldDataType.Date:
                return DateOnly.TryParseExact(raw, DateFormat, invariant, DateTimeStyles.None, out var date)
                    ? (date.ToString(DateFormat, invariant), null)
                    : (null, $"{field.Label} must be a date in the form {DateFormat}.");

            case FieldDataType.Select:
                return field.Options.Contains(raw)
                    ? (raw, null)
                    : (null, $"{field.Label} must be one of: {string.Join(", ", field.Options)}.");

            case FieldDataType.Checkbox:
                if (!bool.TryParse(raw, out var isChecked))
                {
                    return (null, $"{field.Label} must be true or false.");
                }

                // A required checkbox is an acknowledgement, so it has to be ticked.
                return field.IsRequired && !isChecked
                    ? (null, $"{field.Label} must be checked.")
                    : (isChecked ? "true" : "false", null);

            default:
                return (raw, null);
        }
    }
}
