namespace CivicFlow.Application.Abstractions;

/// <summary>
/// Where attachment bytes live. The database keeps only the metadata and the path returned by
/// <see cref="SaveAsync"/>, which is opaque to callers.
/// </summary>
public interface IFileStorage
{
    /// <summary>Stores the content under a new, unique path and returns that path.</summary>
    Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default);

    /// <summary>Opens a stored file for reading, or returns null if it's missing.</summary>
    Stream? OpenRead(string path);

    /// <summary>Removes a stored file; a missing file is not an error.</summary>
    void Delete(string path);
}
