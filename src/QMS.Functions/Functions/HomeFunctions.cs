using System.Text;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using QMS.Functions.Data;
using QMS.Functions.Services;

namespace QMS.Functions.Functions;

/// <summary>Home screen (ScreenMainGallery): the signed-in user, the job gallery and its filter options.</summary>
public sealed class HomeFunctions(Db db, CurrentUser currentUser)
{
    [Function("Me")]
    public async Task<IActionResult> Me([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/me")] HttpRequest req)
    {
        var user = await currentUser.GetAsync(req);
        return new OkObjectResult(new
        {
            user.Email, user.DisplayName, user.Roles,
            canSettings = user.IsSystemManager,
            isSystemManager = user.IsSystemManager,
            canAudit = user.InRole("Auditor"),
            canMetrics = user.InRole("Metrics"),
        });
    }

    /// <summary>
    /// Job gallery. Mirrors the Gallery1.Items switch on the "search by" dropdown, but runs server-side
    /// (the original was limited to the first 500-2000 rows by SharePoint delegation).
    /// </summary>
    [Function("Projects")]
    public async Task<IActionResult> Projects([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/projects")] HttpRequest req)
    {
        var q = req.Query;
        string? Get(string k) => string.IsNullOrWhiteSpace(q[k]) ? null : q[k].ToString().Trim();

        var where = new StringBuilder("WHERE 1=1");
        var p = new DynamicParameters();

        if (Get("status") == "Closed")
        {
            where.Append(" AND m.ProjectStatus = 1");
            if (int.TryParse(Get("year"), out var year))
            {
                where.Append(" AND m.FM19ClosedDate >= @yFrom AND m.FM19ClosedDate < @yTo");
                p.Add("yFrom", new DateTime(year, 1, 1));
                p.Add("yTo", new DateTime(year + 1, 1, 1));
            }
        }
        else where.Append(" AND (m.ProjectStatus <> 1 OR m.ProjectStatus IS NULL)");

        if (Get("state") is { } state) { where.Append(" AND LTRIM(RTRIM(m.OfficeForFormSubmission)) = @state"); p.Add("state", state); }

        var text = Get("q");
        var person = Get("person");
        p.Add("text", text);
        p.Add("like", $"%{text}%");
        p.Add("person", person);
        p.Add("personLike", $"%{person}%");

        switch (Get("searchBy"))
        {
            case "Project Number" when text is not null:
                where.Append(int.TryParse(text, out var pn) ? " AND m.ProjectNumber = @num" : " AND 1=0"); p.Add("num", pn); break;
            case "Sub-Project Number" when text is not null:
                where.Append(int.TryParse(text, out var spn) ? " AND m.SubProjectNumber = @num" : " AND 1=0"); p.Add("num", spn); break;
            case "Waiting For Admin Approval":
                where.Append(" AND (m.FM01AApprovalStatus = 'Pending' OR m.ProjectStatus = 2)"); break;
            case "Client Name" when int.TryParse(Get("clientId"), out var clientId) && clientId > 0:
                where.Append(" AND m.ID_Client = @clientId"); p.Add("clientId", clientId); break;
            case "Project Name" when text is not null: where.Append(" AND m.ProjectName LIKE @like"); break;
            case "Sub-Project Name" when text is not null: where.Append(" AND m.SubProjectName LIKE @like"); break;
            case "Site Name" when text is not null: where.Append(" AND m.SiteName LIKE @like"); break;
            case "Scope of Work" when text is not null:
                where.Append(" AND m.ID IN (SELECT ID_Master FROM dbo.FM01A WHERE ScopeOfWork LIKE @like)"); break;
            case "Project Type/ Practice Discipline" when person is not null:
                where.Append(" AND m.ID IN (SELECT ID_Master FROM dbo.FM01A WHERE ProjectType LIKE @personLike)"); break;
            case "Project Manager" when person is not null: where.Append(" AND m.ProjectManagerName LIKE @personLike"); break;
            case "Sub Project Manager" when person is not null: where.Append(" AND m.SubProjectManagerName LIKE @personLike"); break;
            case "Project Directors" when person is not null:
                where.Append(" AND m.ID IN (SELECT ID_Master FROM dbo.FM01B WHERE ProjectDirector = @person)"); break;
            case "Proposal Reviewers" when person is not null:
                where.Append($" AND m.ID IN (SELECT ID_Master FROM dbo.FM03A WHERE {ReviewerColumn(Get("reviewer"))} = @person)"); break;
            case "Project Reviewers" when person is not null:
                where.Append($" AND m.ID IN (SELECT ID_Master FROM dbo.FM03B WHERE {ReviewerColumn(Get("reviewer"))} = @person)"); break;
        }

        var dir1 = Get("sortNum") == "desc" ? "DESC" : "ASC";
        var dir2 = Get("sortSub") == "desc" ? "DESC" : "ASC";
        var page = Math.Max(0, int.TryParse(Get("page"), out var pg) ? pg : 0);
        var size = Math.Clamp(int.TryParse(Get("pageSize"), out var ps) ? ps : 100, 1, 500);
        p.Add("skip", page * size);
        p.Add("take", size);

        var sql = $"""
            SELECT m.ID, m.ProjectNumber, m.ProjectName, m.SubProjectNumber, m.SubProjectName, m.SiteName, m.V5,
                   a.ProjectCategory, COUNT(*) OVER () AS Total
            FROM dbo.Master m
            OUTER APPLY (SELECT TOP 1 ProjectCategory FROM dbo.FM01A f WHERE f.ID_Master = m.ID ORDER BY f.ID) a
            {where}
            ORDER BY m.ProjectNumber {dir1}, m.SubProjectNumber {dir2}, m.ID {dir1}
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
            """;

        using var conn = db.Open();
        var rows = (await conn.QueryAsync(sql, p)).Select(Row.From).ToList();
        return new OkObjectResult(new
        {
            total = rows.FirstOrDefault()?.I("Total") ?? 0,
            page,
            pageSize = size,
            items = rows.Select(r => new
            {
                id = r.I("ID"),
                projectNumber = r.I("ProjectNumber"),
                projectName = r.S("ProjectName"),
                subProjectNumber = r.I("SubProjectNumber"),
                subProjectName = r.S("SubProjectName"),
                siteName = r.S("SiteName"),
                v5 = r.I("V5") == 1,
                category = r.S("ProjectCategory"),
            }),
        });
    }

    static string ReviewerColumn(string? slot) => slot switch
    {
        "Additional Reviewer 1" => "Add1Name",
        "Additional Reviewer 2" => "Add2Name",
        _ => "LeadName",
    };

    /// <summary>Values for the home filter dropdowns (State, managers, reviewers, practice, clients).</summary>
    [Function("HomeOptions")]
    public async Task<IActionResult> Options([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/home/options")] HttpRequest req)
    {
        var kind = req.Query["kind"].ToString();
        var closed = req.Query["status"] == "Closed";
        var statusFilter = closed ? "ProjectStatus = 1" : "(ProjectStatus <> 1 OR ProjectStatus IS NULL)";
        var slot = ReviewerColumn(req.Query["reviewer"]);

        var sql = kind switch
        {
            "state" => $"SELECT DISTINCT LTRIM(RTRIM(OfficeForFormSubmission)) FROM dbo.Master WHERE {statusFilter} AND OfficeForFormSubmission IS NOT NULL ORDER BY 1",
            "Project Manager" => "SELECT DISTINCT LTRIM(RTRIM(ProjectManagerName)) FROM dbo.Master WHERE ProjectManagerName IS NOT NULL ORDER BY 1",
            "Sub Project Manager" => "SELECT DISTINCT LTRIM(RTRIM(SubProjectManagerName)) FROM dbo.Master WHERE SubProjectManagerName IS NOT NULL ORDER BY 1",
            "Project Directors" => "SELECT DISTINCT LTRIM(RTRIM(ProjectDirector)) FROM dbo.FM01B WHERE ProjectDirector IS NOT NULL ORDER BY 1",
            "Proposal Reviewers" => $"SELECT DISTINCT LTRIM(RTRIM({slot})) FROM dbo.FM03A WHERE {slot} IS NOT NULL ORDER BY 1",
            "Project Reviewers" => $"SELECT DISTINCT LTRIM(RTRIM({slot})) FROM dbo.FM03B WHERE {slot} IS NOT NULL ORDER BY 1",
            "Project Type/ Practice Discipline" => "SELECT DISTINCT LTRIM(RTRIM(ProjectType)) FROM dbo.FM01A WHERE ProjectType IS NOT NULL ORDER BY 1 DESC",
            _ => null,
        };

        using var conn = db.Open();
        if (kind == "clients")
            return new OkObjectResult(await conn.QueryAsync("SELECT ID AS id, CompanyName AS name FROM dbo.Clients WHERE CompanyName IS NOT NULL ORDER BY CompanyName"));
        if (sql is null) return new BadRequestObjectResult(new { error = $"Unknown option kind '{kind}'" });
        return new OkObjectResult(await conn.QueryAsync<string>(sql));
    }
}
