using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Azure.Functions.Worker;

namespace QMS.Functions.Functions;

/// <summary>Serves the web front end (wwwroot) from the same Functions app, so one URL hosts UI and API.</summary>
public sealed class StaticFiles
{
    static readonly string Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "wwwroot"));
    static readonly FileExtensionContentTypeProvider ContentTypes = new();

    [Function("StaticFiles")]
    public IActionResult Serve([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "{*path}")] HttpRequest req, string? path)
    {
        if (path?.StartsWith("api/", StringComparison.OrdinalIgnoreCase) == true) return new NotFoundResult();

        var relative = string.IsNullOrEmpty(path) ? "index.html" : path;
        var full = Path.GetFullPath(Path.Combine(Root, relative));
        if (!full.StartsWith(Root, StringComparison.OrdinalIgnoreCase)) return new NotFoundResult();   // no path traversal
        if (!File.Exists(full)) return new NotFoundResult();

        if (!ContentTypes.TryGetContentType(full, out var contentType)) contentType = "application/octet-stream";
        // HTML/JS/CSS revalidate on every load so a deployment is picked up immediately; images may be cached.
        req.HttpContext.Response.Headers.CacheControl = contentType.StartsWith("image/") ? "public, max-age=86400" : "no-cache";
        var info = new FileInfo(full);
        return new PhysicalFileResult(full, contentType)
        {
            LastModified = info.LastWriteTimeUtc,
            EntityTag = new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{info.LastWriteTimeUtc.Ticks:x}-{info.Length:x}\""),
        };
    }
}
