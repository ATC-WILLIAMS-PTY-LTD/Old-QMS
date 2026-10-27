using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using QMS.Functions.Data;

namespace QMS.Functions.Services;

public sealed record UserInfo(string Email, string DisplayName, IReadOnlyList<string> Roles)
{
    public bool InRole(string role) => Roles.Contains(role, StringComparer.OrdinalIgnoreCase);

    /// <summary>May change admin data (role assignments): QMS system managers.</summary>
    public bool IsSystemManager => InRole("SystemManager") || InRole("System Managers");
}

/// <summary>
/// Resolves the signed-in user. In Azure this comes from App Service Authentication (Easy Auth / Entra ID)
/// headers; locally it falls back to the Qms:DevUserEmail setting.
/// </summary>
public sealed class CurrentUser(Db db, IConfiguration config)
{
    public async Task<UserInfo> GetAsync(HttpRequest req)
    {
        var email = req.Headers["X-MS-CLIENT-PRINCIPAL-NAME"].FirstOrDefault();
        string? name = null;

        var principal = req.Headers["X-MS-CLIENT-PRINCIPAL"].FirstOrDefault();
        if (!string.IsNullOrEmpty(principal))
        {
            try
            {
                using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(principal)));
                foreach (var claim in doc.RootElement.GetProperty("claims").EnumerateArray())
                {
                    var type = claim.GetProperty("typ").GetString();
                    var val = claim.GetProperty("val").GetString();
                    if (type is "name") name = val;
                    if (type is "preferred_username" or "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" && email is null) email = val;
                }
            }
            catch (Exception ex) when (ex is FormatException or JsonException or KeyNotFoundException) { /* fall through */ }
        }

        var isLocalDevUser = email is null;
        email ??= config["Qms:DevUserEmail"] ?? "dev@localhost";
        email = email.Trim().ToLowerInvariant();

        using var conn = db.Open();
        // Roles come from the allow-list table and the Admin Responsibility assignments.
        var roles = (await conn.QueryAsync<string>("""
            SELECT Role FROM dbo.UserRoles WHERE Email = @email
            UNION SELECT Role FROM dbo.AdminResponsibility WHERE Email = @email
            """, new { email })).ToList();
        // Local development only (no Easy Auth headers): extra roles from settings, e.g. "SystemManager".
        if (isLocalDevUser && config["Qms:DevRoles"] is { Length: > 0 } devRoles)
            roles.AddRange(devRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        name ??= await conn.QueryFirstOrDefaultAsync<string>("SELECT DisplayName FROM dbo.Staff WHERE Email = @email", new { email })
                 ?? config["Qms:DevUserName"]
                 ?? email.Split('@')[0];

        return new UserInfo(email, name, roles);
    }
}
