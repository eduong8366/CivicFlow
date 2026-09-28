namespace CivicFlow.Application.Abstractions;

public interface ICaseNumberGenerator
{
    /// <summary>Reserves the next case number for a case type, e.g. <c>BLD-2026-000042</c>.</summary>
    Task<string> NextAsync(string prefix, int year, CancellationToken cancellationToken = default);
}
