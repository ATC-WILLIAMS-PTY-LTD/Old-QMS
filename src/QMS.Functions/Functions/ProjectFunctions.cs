using System.Text.RegularExpressions;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using QMS.Functions.Data;
using QMS.Functions.Services;

namespace QMS.Functions.Functions;

/// <summary>Per-job data: summary card, workbook form status, dashboard tiles, and a read-only form viewer.</summary>
public sealed partial class ProjectFunctions(Db db)
{
    [Function("ProjectStatus")]
    public async Task<IActionResult> Status(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/projects/{id:int}/status")] HttpRequest req, int id)
    {
        var job = await JobData.LoadAsync(db, id);
        if (job is null) return new NotFoundResult();

        var engine = new StatusEngine(job);
        var forms = engine.Evaluate();
        var score = engine.ComplianceScore(forms);
        var (light, lightTip) = engine.TrafficLight(forms);
        var m = job.Master;
        var b = job.Fm01B;
        var sub01B = b.B("IsSubmitted");

        return new OkObjectResult(new
        {
            project = new
            {
                id,
                projectNumber = m.I("ProjectNumber"),
                projectName = m.S("ProjectName"),
                subProjectNumber = m.I("SubProjectNumber"),
                subProjectName = m.S("SubProjectName"),
                siteName = m.S("SiteName"),
                siteShortName = m.S("SiteShortName"),
                v5 = engine.IsV5,
                category = job.Fm01A.S("ProjectCategory"),
                isV5Category = engine.IsV5Category,
                clientName = job.ClientName,
                projectDirector = sub01B ? (b.Is("ProjectDirectorRequired", "Yes") ? b.S("ProjectDirector") : "Not required") : "Not Assigned",
                projectManager = sub01B ? b.S("SubProjectManager") : job.Fm01A.S("ProjectManager"),
                subProjectManager = sub01B ? b.S("SubProjectManager") : job.Fm01A.S("SubProjectManager"),
                projectType = job.Fm01A.S("ProjectType"),
                riskCategory = engine.RiskCategory(),
                reviewers = engine.AssignedReviewers(),
                office = m.S("OfficeForFormSubmission"),
                projectStatus = m.I("ProjectStatus"),
                approvalStatus = m.S("FM01AApprovalStatus"),
                omApprovalStatus = m.S("FM01AOMApprovalStatus"),
            },
            forms,
            score = new { score.completed, score.total, score.percent, score.band, score.color },
            watermarks = new
            {
                closed = m.I("ProjectStatus") == 1,
                unsuccessful = engine.ProposalSuccessful == "No",
                declined = m.Is("FM01AOMApprovalStatus", "Declined"),
            },
            dashboard = new
            {
                variant = engine.IsV5Category ? "v5" : "legacy",
                trafficLight = light,
                trafficLightTooltip = lightTip,
            },
        });
    }

    [GeneratedRegex(@"^FM\d{2}[AB]?$")]
    private static partial Regex FormCodeRegex();

    /// <summary>
    /// Read-only view of every record held for one workbook form (main list plus its Notes / child lists),
    /// labelled with the original SharePoint column names.
    /// </summary>
    [Function("ProjectForm")]
    public async Task<IActionResult> Form(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/projects/{id:int}/forms/{code}")] HttpRequest req, int id, string code)
    {
        code = code.ToUpperInvariant();
        if (!FormCodeRegex().IsMatch(code)) return new BadRequestObjectResult(new { error = "Invalid form code" });

        using var conn = db.Open();

        // Tables for this form that link to the job via ID_Master (e.g. FM02, FM02_Notes); table names come from sys.tables, never from input.
        var tables = (await conn.QueryAsync<string>("""
            SELECT t.name FROM sys.tables t
            WHERE (t.name = @code OR t.name LIKE @prefix)
              AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = t.object_id AND c.name = 'ID_Master')
            ORDER BY CASE WHEN t.name = @code THEN 0 ELSE 1 END, t.name
            """, new { code, prefix = code + "[_]%" })).ToList();

        var labels = (await conn.QueryAsync<(string table, string column, string label, string list)>(
                """
                SELECT m.TableName, m.ColumnName, m.SourceColumn, m.SourceList FROM dbo._ColumnMap m
                JOIN sys.columns c ON c.object_id = OBJECT_ID('dbo.' + QUOTENAME(m.TableName)) AND c.name = m.ColumnName
                WHERE m.TableName IN @tables ORDER BY c.column_id
                """, new { tables }))
            .ToList();

        var result = new List<object>();
        foreach (var table in tables)
        {
            var rows = (await conn.QueryAsync($"SELECT TOP 200 * FROM dbo.[{table}] WHERE ID_Master = @id ORDER BY ID", new { id }))
                .Cast<IDictionary<string, object?>>()
                .Select(r => r.Where(kv => kv.Key is not ("ID" or "ID_Master")).ToDictionary(kv => kv.Key, kv => kv.Value))
                .ToList();
            var tableLabels = labels.Where(l => l.table == table).ToList();
            result.Add(new
            {
                table,
                title = tableLabels.FirstOrDefault().list ?? table,
                columns = tableLabels.Where(l => l.column is not ("ID" or "ID_Master"))
                                     .Select(l => new { name = l.column, label = l.label }),
                rows,
            });
        }

        return new OkObjectResult(new { code, tables = result });
    }
}
