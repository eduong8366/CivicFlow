namespace CivicFlow.Application.Common;

public static class TimeProviderExtensions
{
    /// <summary>Today's date in UTC, which is how due dates are computed and compared (as in the seed data).</summary>
    public static DateOnly GetUtcToday(this TimeProvider timeProvider) =>
        DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
}
