using CivicFlow.Application.Dashboard;

namespace CivicFlow.Tests.Dashboard;

public class DashboardCalculationTests
{
    [Theory]
    [InlineData("2026-09-28", "2026-09-28")] // Monday
    [InlineData("2026-09-30", "2026-09-28")]
    [InlineData("2026-10-04", "2026-09-28")] // Sunday belongs to the week before it
    [InlineData("2026-10-05", "2026-10-05")]
    public void Weeks_start_on_Monday(string date, string expected)
    {
        Assert.Equal(DateOnly.Parse(expected), DashboardService.StartOfWeek(DateOnly.Parse(date)));
    }

    [Theory]
    [InlineData(new[] { 4.0 }, 4.0)]
    [InlineData(new[] { 9.0, 1.0, 5.0 }, 5.0)]
    [InlineData(new[] { 8.0, 2.0, 4.0, 30.0 }, 6.0)]
    public void Median_is_the_middle_value_or_the_mean_of_the_middle_two(double[] values, double expected)
    {
        Assert.Equal(expected, DashboardService.Median(values));
    }
}
