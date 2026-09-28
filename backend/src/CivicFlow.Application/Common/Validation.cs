using FluentValidation;
using FluentValidation.Results;

namespace CivicFlow.Application.Common;

public static class Validation
{
    /// <summary>A 400 validation problem for one property, for rules that need the database or the workflow state.</summary>
    public static ValidationException Fail(string propertyName, string message) =>
        new([new ValidationFailure(propertyName, message)]);

    /// <summary>Trims a string, turning blank into null.</summary>
    public static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
