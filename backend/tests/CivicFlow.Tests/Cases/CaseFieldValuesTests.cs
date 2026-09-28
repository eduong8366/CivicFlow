using CivicFlow.Application.Cases;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using FluentValidation;

namespace CivicFlow.Tests.Cases;

public class CaseFieldValuesTests
{
    private static readonly List<CaseTypeField> Fields =
    [
        new() { Id = 1, Key = "parcel", Label = "Parcel Number", DataType = FieldDataType.Text, IsRequired = true, SortOrder = 1 },
        new() { Id = 2, Key = "valuation", Label = "Valuation", DataType = FieldDataType.Number, SortOrder = 2 },
        new() { Id = 3, Key = "start", Label = "Start Date", DataType = FieldDataType.Date, SortOrder = 3 },
        new() { Id = 4, Key = "type", Label = "Project Type", DataType = FieldDataType.Select, Options = ["New", "Addition"], SortOrder = 4 },
        new() { Id = 5, Key = "owner", Label = "Owner-Occupied", DataType = FieldDataType.Checkbox, SortOrder = 5 },
    ];

    private static Dictionary<string, string> Validate(Dictionary<string, string?> values, IEnumerable<CaseTypeField>? fields = null) =>
        CaseFieldValues.Validate(fields ?? Fields, values).ToDictionary(v => v.Field.Key, v => v.Value);

    private static Dictionary<string, string[]> Errors(Dictionary<string, string?> values, IEnumerable<CaseTypeField>? fields = null)
    {
        var exception = Assert.Throws<ValidationException>(() => CaseFieldValues.Validate(fields ?? Fields, values));
        return exception.Errors.GroupBy(e => e.PropertyName).ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());
    }

    [Fact]
    public void Valid_values_are_trimmed_and_normalized()
    {
        var values = Validate(new()
        {
            ["parcel"] = "  123-45-6789 ",
            ["valuation"] = "250000.50",
            ["start"] = "2026-10-01",
            ["type"] = "Addition",
            ["owner"] = "TRUE",
        });

        Assert.Equal("123-45-6789", values["parcel"]);
        Assert.Equal("250000.50", values["valuation"]);
        Assert.Equal("2026-10-01", values["start"]);
        Assert.Equal("Addition", values["type"]);
        Assert.Equal("true", values["owner"]);
    }

    [Fact]
    public void Blank_optional_fields_are_left_out()
    {
        var values = Validate(new() { ["parcel"] = "1", ["valuation"] = " ", ["start"] = null });

        Assert.Equal(["parcel"], values.Keys);
    }

    [Fact]
    public void Every_problem_is_reported_against_its_field()
    {
        var errors = Errors(new()
        {
            ["valuation"] = "1,000",
            ["start"] = "10/01/2026",
            ["type"] = "Demolition",
            ["owner"] = "yes",
            ["colour"] = "blue",
        });

        Assert.Equal(["Parcel Number is required."], errors["Fields.parcel"]);
        Assert.Equal(["Valuation must be a number."], errors["Fields.valuation"]);
        Assert.Equal(["Start Date must be a date in the form yyyy-MM-dd."], errors["Fields.start"]);
        Assert.Equal(["Project Type must be one of: New, Addition."], errors["Fields.type"]);
        Assert.Equal(["Owner-Occupied must be true or false."], errors["Fields.owner"]);
        Assert.Equal(["'colour' is not a field of this case type."], errors["Fields.colour"]);
    }

    [Fact]
    public void A_required_checkbox_must_be_checked()
    {
        List<CaseTypeField> fields = [new() { Key = "agree", Label = "I agree", DataType = FieldDataType.Checkbox, IsRequired = true }];

        Assert.Equal(["I agree must be checked."], Errors(new() { ["agree"] = "false" }, fields)["Fields.agree"]);
        Assert.Equal("true", Validate(new() { ["agree"] = "true" }, fields)["agree"]);
    }

    [Fact]
    public void Values_longer_than_the_column_are_rejected()
    {
        var errors = Errors(new() { ["parcel"] = new string('x', CaseFieldValues.MaxLength + 1) });

        Assert.Contains("Fields.parcel", errors.Keys);
    }

    [Fact]
    public void Missing_values_dictionary_only_fails_required_fields()
    {
        var exception = Assert.Throws<ValidationException>(() => CaseFieldValues.Validate(Fields, null));

        Assert.Equal("Fields.parcel", Assert.Single(exception.Errors).PropertyName);
    }
}
