namespace CivicFlow.Application.Common;

/// <summary>
/// The agency's calendar is Pacific time (Sacramento). Instants are stored as they happened; due
/// dates, "today" and date filters are days in this zone, as in the seed data.
/// </summary>
public static class AgencyTime
{
    public static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("America/Los_Angeles");

    /// <summary>The Pacific date <paramref name="instant"/> falls on.</summary>
    public static DateOnly DateOf(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    /// <summary>Midnight Pacific at the start of <paramref name="date"/>.</summary>
    public static DateTimeOffset StartOfDay(DateOnly date)
    {
        var midnight = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(midnight, Zone.GetUtcOffset(midnight));
    }
}

public static class TimeProviderExtensions
{
    /// <summary>Today's date in Pacific time, which is how due dates are computed and compared.</summary>
    public static DateOnly GetToday(this TimeProvider timeProvider) => AgencyTime.DateOf(timeProvider.GetUtcNow());
}
