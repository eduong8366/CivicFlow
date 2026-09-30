using CivicFlow.Application.Abstractions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace CivicFlow.Infrastructure.Storage;

public sealed class FileStorageOptions
{
    public const string SectionName = "FileStorage";

    /// <summary>Where files are kept: absolute, or relative to the app's content root. Never under wwwroot.</summary>
    public string RootPath { get; set; } = "App_Data/attachments";
}

/// <summary>
/// Keeps files in a directory on local disk, outside the web root so nothing is served directly.
/// Files are stored under random names with no extension; the original name lives in the database.
/// </summary>
internal sealed class LocalFileStorage(IOptions<FileStorageOptions> options, IHostEnvironment environment) : IFileStorage
{
    private const int BufferSize = 81920;

    private readonly string root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, options.Value.RootPath));

    public async Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(root);
        var path = Guid.NewGuid().ToString("N");
        var fullPath = Resolve(path);

        try
        {
            await using var file = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, BufferSize, useAsync: true);
            await content.CopyToAsync(file, cancellationToken);
        }
        catch
        {
            File.Delete(fullPath);
            throw;
        }

        return path;
    }

    public Stream? OpenRead(string path)
    {
        var fullPath = Resolve(path);
        return File.Exists(fullPath)
            ? new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize, useAsync: true)
            : null;
    }

    public void Delete(string path) => File.Delete(Resolve(path));

    /// <summary>The full path of a stored file, refusing any path that would reach outside the storage root.</summary>
    private string Resolve(string path)
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, path));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"'{path}' is outside the file storage root.");
        }

        return fullPath;
    }
}
