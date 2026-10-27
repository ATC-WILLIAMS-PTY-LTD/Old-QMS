using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using QMS.Functions.Data;
using QMS.Functions.Services;

namespace QMS.Functions.Functions;

/// <summary>Admin area: data registers (QMS Master, Clients, Contacts, Sites, Forms) and Admin Responsibility.</summary>
public sealed class AdminFunctions(Db db, CurrentUser currentUser)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static readonly string[] Roles =
        ["QMS Admin", "QMS FR03 Risk1_2", "QMS FR03 Risk3", "QMS FR03 Risk4", "QMS OM", "QMS Contract Reviewers", "System Managers",
         "International Contract Reviewers", "Northern Reginal Manager", "Southern Reginal Manager", "Allow Create PDF",
         "Health Check Managers", "Change Approvers"];
    public static readonly string[] Locations =
        ["Victoria", "Queensland", "Sunshine Coast", "Western Australia", "New South Wales", "Tasmania", "Peru", "All Offices"];

    /// <summary>A register: fixed SQL (never built from input), searchable expressions and the columns shown.</summary>
    sealed record RegisterDef(string Title, string From, string Search, string OrderBy, (string key, string label, string sql)[] Columns);

    static readonly Dictionary<string, RegisterDef> Registers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["master"] = new RegisterDef("QMS Master", "dbo.Master m",
            "m.ProjectName LIKE @like OR m.SubProjectName LIKE @like OR m.SiteName LIKE @like OR m.ProjectManagerName LIKE @like OR CAST(m.ProjectNumber AS varchar(20)) = @q",
            "m.ID DESC",
            [("id", "ID", "m.ID"), ("projectNumber", "Project No", "m.ProjectNumber"), ("projectName", "Project / Site Name", "m.ProjectName"),
             ("subProjectNumber", "Sub No", "m.SubProjectNumber"), ("subProjectName", "Sub Project / Descriptor", "m.SubProjectName"),
             ("office", "Office", "m.OfficeForFormSubmission"), ("projectManager", "Project Manager", "m.ProjectManagerName"),
             ("omApproval", "FM-01A OM", "m.FM01AOMApprovalStatus"), ("adminApproval", "FM-01A Admin", "m.FM01AApprovalStatus"),
             ("fm01bApproval", "FM-01B", "m.FM01BApprovalStatus"),
             ("status", "Status", "CASE m.ProjectStatus WHEN 1 THEN 'Closed' WHEN 2 THEN 'Awaiting approval' ELSE 'Open' END"),
             ("created", "Created", "m.Created")]),
        ["clients"] = new RegisterDef("Clients", "dbo.Clients c",
            "c.CompanyName LIKE @like OR c.CompanyABN LIKE @like OR c.CompanySuburb LIKE @like OR c.CompanyEmailAddress LIKE @like",
            "c.CompanyName",
            [("id", "ID", "c.ID"), ("name", "Company Name", "c.CompanyName"), ("abn", "ABN", "c.CompanyABN"),
             ("suburb", "Suburb / Town", "c.CompanySuburb"), ("state", "State", "c.CompanyState"), ("country", "Country", "c.CompanyCountry"),
             ("phone", "Phone", "c.CompanyPhone"), ("email", "Email", "c.CompanyEmailAddress"),
             ("projects", "Projects", "(SELECT COUNT(*) FROM dbo.Master m WHERE m.ID_Client = c.ID)"),
             ("contacts", "Contacts", "(SELECT COUNT(*) FROM dbo.ClientContacts k WHERE k.ClientID = c.ID)")]),
        ["contacts"] = new RegisterDef("Client Contacts", "dbo.ClientContacts k LEFT JOIN dbo.Clients c ON c.ID = k.ClientID",
            "k.ContactName LIKE @like OR k.ContactEmail LIKE @like OR c.CompanyName LIKE @like OR k.ContactPosition LIKE @like",
            "k.ContactName",
            [("id", "ID", "k.ID"), ("name", "Contact Name", "k.ContactName"), ("salutation", "Salutation", "k.ContactSalutation"),
             ("position", "Position", "k.ContactPosition"), ("client", "Client", "c.CompanyName"), ("email", "Email", "k.ContactEmail"),
             ("phone", "Phone", "k.ContactPhone"), ("mobile", "Mobile", "k.ContactMobile"), ("atcLink", "ATC Link", "k.ATCLink")]),
        ["sites"] = new RegisterDef("QMS Site Names", "dbo.SiteNames s",
            "s.SiteName LIKE @like OR s.SiteCode LIKE @like OR s.SiteSuburbTown LIKE @like OR s.SiteLocation LIKE @like",
            "s.SiteName",
            [("id", "ID", "s.ID"), ("code", "Site Code", "s.SiteCode"), ("name", "Site Name", "s.SiteName"), ("location", "Location", "s.SiteLocation"),
             ("street1", "Address Line 1", "s.AddressLine1"), ("suburb", "Suburb / Town", "s.SiteSuburbTown"),
             ("postCode", "Post Code", "s.SitePostCode"), ("country", "Country", "s.SiteCountry"), ("created", "Created", "s.Created")]),
    };

    [Function("AdminSummary")]
    public async Task<IActionResult> Summary([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/summary")] HttpRequest req)
    {
        using var conn = db.Open();
        var pending = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.Master WHERE (FM01AApprovalStatus = 'Pending' OR ProjectStatus = 2) AND ISNULL(FM01AOMApprovalStatus, '') <> 'Declined'");
        return new OkObjectResult(new { pendingApprovals = pending });
    }

    [Function("AdminRegister")]
    public async Task<IActionResult> Register(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/registers/{name}")] HttpRequest req, string name)
    {
        if (!Registers.TryGetValue(name, out var r)) return new NotFoundResult();
        var q = req.Query["q"].ToString().Trim();
        var page = Math.Max(0, int.TryParse(req.Query["page"], out var pg) ? pg : 0);
        var size = Math.Clamp(int.TryParse(req.Query["pageSize"], out var ps) ? ps : 50, 1, 200);

        var select = string.Join(", ", r.Columns.Select(c => $"{c.sql} AS [{c.key}]"));
        var sql = $"""
            SELECT {select}, COUNT(*) OVER () AS [__total]
            FROM {r.From}
            {(q.Length > 0 ? $"WHERE {r.Search}" : "")}
            ORDER BY {r.OrderBy}
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
            """;
        using var conn = db.Open();
        var rows = (await conn.QueryAsync(sql, new { q, like = $"%{q}%", skip = page * size, take = size }))
            .Cast<IDictionary<string, object?>>().ToList();
        var total = rows.Count > 0 ? Convert.ToInt32(rows[0]["__total"]) : 0;
        rows.ForEach(x => x.Remove("__total"));
        return new OkObjectResult(new
        {
            title = r.Title, total, page, pageSize = size,
            columns = r.Columns.Select(c => new { c.key, c.label }),
            rows,
        });
    }

    // ---------------------------------------------------------------- QMS Master record (view / edit)

    static readonly string[] Offices = ["Victoria", "Queensland", "Western Australia", "Sunshine Coast", "New South Wales", "Tasmania", "Peru"];
    static readonly string[] OmStatuses = ["Pending", "Approved", "Declined"];
    static readonly string[] ApprovalStatuses = ["Pending", "Approved"];

    /// <summary>Editable QMS Master columns and how each value is validated/converted. Anything else is read-only.</summary>
    static readonly Dictionary<string, (string kind, string label, int max, string[]? options)> MasterEditable = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ProjectNumber"] = ("int", "Project Number", 0, null),
        ["ProjectName"] = ("text", "Project / Site Name", 255, null),
        ["SubProjectNumber"] = ("int", "Sub-Project Number", 0, null),
        ["SubProjectName"] = ("text", "Sub-Project Name / Project Descriptor", 255, null),
        ["V5"] = ("v5", "V5 workflow", 0, null),
        ["ProjectStatus"] = ("status", "Project Status", 0, null),
        ["OfficeForFormSubmission"] = ("select", "Office for Form Submission", 0, Offices),
        ["ID_Client"] = ("client", "Client", 0, null),
        ["ProjectManagerName"] = ("text", "Project Manager", 255, null),
        ["SubProjectManagerName"] = ("text", "Sub Project Manager", 255, null),
        ["SiteName"] = ("text", "Site Name", 255, null),
        ["SiteShortName"] = ("text", "Site Short Name", 6, null),
        ["FM01AOMApprovalStatus"] = ("select", "FM-01A OM Approval Status", 0, OmStatuses),
        ["FM01AOMApprovedBy"] = ("text", "FM-01A OM Approved By", 255, null),
        ["FM01AOMApprovedDate"] = ("date", "FM-01A OM Approved Date", 0, null),
        ["FM01AOMRecommendations"] = ("text", "FM-01A OM Recommendations", 1000, null),
        ["FM01AApprovalStatus"] = ("select", "FM-01A Admin Approval Status", 0, ApprovalStatuses),
        ["FM01AApprovedBy"] = ("text", "FM-01A Approved By", 255, null),
        ["FM01AApprovedDate"] = ("date", "FM-01A Approved Date", 0, null),
        ["FM01BApprovalStatus"] = ("select", "FM-01B Approval Status", 0, ApprovalStatuses),
        ["FM01BApprovedBy"] = ("text", "FM-01B Approved By", 255, null),
        ["FM01BApprovedDate"] = ("date", "FM-01B Approved Date", 0, null),
        ["FM19ClosedBy"] = ("text", "FM-19 Closed By", 255, null),
        ["FM19ClosedDate"] = ("date", "FM-19 Closed Date", 0, null),
    };

    static bool CanEditMaster(UserInfo u) => u.IsSystemManager || u.InRole("QMS Admin");

    [Function("AdminMasterGet")]
    public async Task<IActionResult> MasterGet(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/master/{id:int}")] HttpRequest req, int id)
    {
        var user = await currentUser.GetAsync(req);
        using var conn = db.Open();
        var record = await conn.QueryFirstOrDefaultAsync("SELECT * FROM dbo.Master WHERE ID = @id", new { id });
        if (record is null) return new NotFoundResult();
        var clientName = await conn.QueryFirstOrDefaultAsync<string>(
            "SELECT c.CompanyName FROM dbo.Master m JOIN dbo.Clients c ON c.ID = m.ID_Client WHERE m.ID = @id", new { id });
        return new OkObjectResult(new { record, clientName, canEdit = CanEditMaster(user), offices = Offices });
    }

    public sealed record MasterUpdate(Dictionary<string, JsonElement>? Values, DateTime? Modified);

    [Function("AdminMasterUpdate")]
    public async Task<IActionResult> MasterUpdateRecord(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "api/admin/master/{id:int}")] HttpRequest req, int id)
    {
        var user = await currentUser.GetAsync(req);
        if (!CanEditMaster(user))
            return new ObjectResult(new { errors = new[] { "Only QMS Admins and System Managers can edit QMS Master records." } }) { StatusCode = 403 };

        var body = await req.ReadFromJsonAsync<MasterUpdate>(Json);
        if (body?.Values is null || body.Values.Count == 0) return new BadRequestObjectResult(new { errors = new[] { "No changes to save" } });

        using var conn = db.Open();
        var current = Row.From((object?)await conn.QueryFirstOrDefaultAsync("SELECT * FROM dbo.Master WHERE ID = @id", new { id }));
        if (!current.Exists) return new NotFoundResult();

        // Optimistic concurrency: refuse to overwrite a record that changed after it was opened.
        if (body.Modified is { } seen && current.D("Modified") is { } now && Math.Abs((now - seen).TotalSeconds) >= 1)
            return new ConflictObjectResult(new { errors = new[] { "This record was changed by someone else after you opened it. Close and reopen it to see the latest values." } });

        var errors = new List<string>();
        var p = new DynamicParameters();
        var sets = new List<string>();
        foreach (var (column, json) in body.Values)
        {
            if (!MasterEditable.TryGetValue(column, out var def)) { errors.Add($"{column} cannot be edited"); continue; }
            var raw = json.ValueKind switch
            {
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                JsonValueKind.String => json.GetString()?.Trim(),
                _ => json.GetRawText(),
            };
            if (string.IsNullOrEmpty(raw)) raw = null;
            object? value = raw;
            switch (def.kind)
            {
                case "int" or "client":
                    if (raw is null) { value = def.kind == "int" ? -1 : null; break; }   // blank project numbers mean "to be assigned"
                    if (!int.TryParse(raw, out var n)) { errors.Add($"{def.label} must be a whole number"); continue; }
                    if (def.kind == "client" && await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.Clients WHERE ID = @n", new { n }) == 0)
                    { errors.Add("Client not found"); continue; }
                    value = n; break;
                case "v5":
                    value = raw is "1" or "true" ? 1 : null; break;
                case "status":
                    if (raw is not ("0" or "1" or "2")) { errors.Add($"{def.label} is not valid"); continue; }
                    value = int.Parse(raw); break;
                case "select":
                    if (raw is not null && !def.options!.Contains(raw)) { errors.Add($"{def.label} must be one of: {string.Join(", ", def.options!)}"); continue; }
                    break;
                case "date":
                    if (raw is null) break;
                    if (!DateTime.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d))
                    { errors.Add($"{def.label} is not a valid date"); continue; }
                    value = d; break;
                default:
                    if (raw?.Length > def.max) { errors.Add($"{def.label} must be {def.max} characters or fewer"); continue; }
                    break;
            }
            var param = "p_" + column;
            sets.Add($"[{column}] = @{param}");     // column names come from the whitelist above
            p.Add(param, value);
        }
        if (body.Values.TryGetValue("ProjectName", out var pn) && pn.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(pn.GetString()))
            errors.Add("Project / Site Name is required");
        if (errors.Count > 0) return new BadRequestObjectResult(new { errors });

        p.Add("id", id);
        using var tx = conn.BeginTransaction();
        await conn.ExecuteAsync($"UPDATE dbo.Master SET {string.Join(", ", sets)}, Modified = SYSDATETIME() WHERE ID = @id", p, tx);

        // Keep the job's FM-01A copy in step (the dashboard and summary read site, managers and client from it).
        var updated = Row.From((object?)await conn.QueryFirstAsync("SELECT * FROM dbo.Master WHERE ID = @id", new { id }, tx));
        bool Changed(string col) => body.Values.ContainsKey(col) && !Equals(current.S(col), updated.S(col));

        if (Changed("SiteName") || Changed("SiteShortName"))
            await conn.ExecuteAsync("UPDATE dbo.FM01A SET SiteName = @s, SiteShortName = @c, Modified = SYSDATETIME() WHERE ID_Master = @id",
                new { s = updated.S("SiteName"), c = updated.S("SiteShortName"), id }, tx);

        if (Changed("ProjectManagerName") || Changed("SubProjectManagerName"))
        {
            const string emailSql = "SELECT TOP 1 Email FROM dbo.Staff WHERE DisplayName = @n";
            var pm = updated.S("ProjectManagerName");
            var spm = updated.S("SubProjectManagerName");
            await conn.ExecuteAsync("""
                UPDATE dbo.FM01A SET ProjectManager = @pm, SubProjectManager = @spm,
                       ProjectManagerEmail = COALESCE(@pmEmail, ProjectManagerEmail), SubProjectManagerEmail = COALESCE(@spmEmail, SubProjectManagerEmail),
                       Modified = SYSDATETIME()
                WHERE ID_Master = @id
                """, new
            {
                pm, spm, id,
                pmEmail = Changed("ProjectManagerName") ? await conn.QueryFirstOrDefaultAsync<string>(emailSql, new { n = pm }, tx) : null,
                spmEmail = Changed("SubProjectManagerName") ? await conn.QueryFirstOrDefaultAsync<string>(emailSql, new { n = spm }, tx) : null,
            }, tx);
            // Same history list the Power Apps "Change Manager" action writes to.
            await conn.ExecuteAsync("""
                INSERT dbo.FM01A_ManagerChanges (ID_Master, Reason, ProjectManager, SubProjectManager) VALUES (@id, @reason, @pm, @spm)
                """, new
            {
                id, reason = $"Updated in Admin - QMS Master by {user.DisplayName}",
                pm = Changed("ProjectManagerName") ? pm : null, spm = Changed("SubProjectManagerName") ? spm : null,
            }, tx);
        }

        if (Changed("ID_Client") && updated.I("ID_Client") is { } clientId)
            await conn.ExecuteAsync("""
                UPDATE f SET CompanyName = c.CompanyName, ABN = c.CompanyABN, AddressLine1 = c.CompanyAddressLine1, AddressLine2 = c.CompanyAddressLine2,
                       SuburbTown = c.CompanySuburb, State = c.CompanyState, PostCode = c.CompanyPostCode, Country = c.CompanyCountry,
                       PhoneNumber = c.CompanyPhone, EmailAddress = c.CompanyEmailAddress, CompanyWebSite = c.CompanyWebSite, Modified = SYSDATETIME()
                FROM dbo.FM01A f JOIN dbo.Clients c ON c.ID = @clientId WHERE f.ID_Master = @id
                """, new { clientId, id }, tx);

        tx.Commit();

        var record = await conn.QueryFirstAsync("SELECT * FROM dbo.Master WHERE ID = @id", new { id });
        var clientName = await conn.QueryFirstOrDefaultAsync<string>(
            "SELECT c.CompanyName FROM dbo.Master m JOIN dbo.Clients c ON c.ID = m.ID_Client WHERE m.ID = @id", new { id });
        return new OkObjectResult(new { record, clientName, canEdit = true, offices = Offices });
    }

    // ---------------------------------------------------------------- Generic record view / edit (Clients, Contacts, Sites, form tables)

    static readonly Dictionary<string, string> RecordTables = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Clients"] = "Client", ["ClientContacts"] = "Client Contact", ["SiteNames"] = "QMS Site Name",
    };

    static string? RecordTable(string table)
    {
        if (RecordTables.Keys.FirstOrDefault(k => k.Equals(table, StringComparison.OrdinalIgnoreCase)) is { } t) return t;
        return Forms.Select(f => f.code).FirstOrDefault(c => c.Equals(table, StringComparison.OrdinalIgnoreCase));
    }

    static string RecordTitle(string table) =>
        RecordTables.TryGetValue(table, out var t) ? t : $"SY-QS-FM-{table[2..]} {Forms.First(f => f.code == table).title}";

    static readonly string[] AuditColumns = ["Created", "CreatedBy", "Modified", "ModifiedBy"];

    sealed record ColumnInfo(string Name, string Type, int MaxChars, bool Identity)
    {
        // Keys, links to other records, attachment counts and audit columns are never edited here.
        public bool ReadOnly => Identity || Name == "ID" || (Name.StartsWith("ID_") ) || Name == "qms_SYQSFM14_Id" || Name == "Attachments"
                                || AuditColumns.Contains(Name, StringComparer.OrdinalIgnoreCase);
        public string Kind => Name == "ClientID" ? "client" : Type switch
        {
            "int" or "bigint" or "smallint" => "int",
            "decimal" or "numeric" or "float" or "money" => "decimal",
            "bit" => "bit",
            "date" => "date",
            "datetime" or "datetime2" or "smalldatetime" => "datetime",
            _ => MaxChars is -1 or > 255 ? "longtext" : "text",
        };
    }

    static async Task<List<ColumnInfo>> TableColumns(System.Data.IDbConnection conn, string table, System.Data.IDbTransaction? tx = null) =>
        (await conn.QueryAsync<(string name, string type, short maxLength, bool identity)>("""
            SELECT c.name, TYPE_NAME(c.user_type_id), c.max_length, c.is_identity
            FROM sys.columns c WHERE c.object_id = OBJECT_ID(@t) ORDER BY c.column_id
            """, new { t = "dbo." + table }, tx))
        .Select(c => new ColumnInfo(c.name, c.type, c.maxLength == -1 ? -1 : c.type.StartsWith('n') ? c.maxLength / 2 : c.maxLength, c.identity))
        .ToList();

    async Task<object> RecordPayload(System.Data.IDbConnection conn, string table, int id, UserInfo user)
    {
        var cols = await TableColumns(conn, table);
        var record = (IDictionary<string, object?>?)await conn.QueryFirstOrDefaultAsync($"SELECT * FROM dbo.[{table}] WHERE ID = @id", new { id });
        if (record is null) return null!;

        var labels = (await conn.QueryAsync<(string col, string label)>(
            "SELECT ColumnName, SourceColumn FROM dbo._ColumnMap WHERE TableName = @table", new { table }))
            .ToDictionary(x => x.col, x => x.label, StringComparer.OrdinalIgnoreCase);

        // Suggestions for short text columns with few distinct values (Yes/No, statuses...), in one round trip.
        var textCols = cols.Where(c => c.Kind == "text" && !c.ReadOnly).ToList();
        var suggestions = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        if (textCols.Count > 0)
        {
            var sql = string.Join("\nUNION ALL\n", textCols.Select((c, i) =>
                $"SELECT {i} AS c, v FROM (SELECT DISTINCT TOP 13 LTRIM(RTRIM([{c.Name}])) AS v FROM dbo.[{table}] WHERE [{c.Name}] IS NOT NULL AND LTRIM(RTRIM([{c.Name}])) <> '') x"));
            foreach (var g in (await conn.QueryAsync<(int c, string v)>(sql)).GroupBy(x => x.c))
                if (g.Count() <= 12) suggestions[textCols[g.Key].Name] = g.Select(x => x.v).OrderBy(v => v).ToList();
        }

        object? project = null;
        if (record.TryGetValue("ID_Master", out var mid) && mid is int masterId)
            project = await conn.QueryFirstOrDefaultAsync(
                "SELECT ID AS id, ProjectNumber AS projectNumber, ProjectName AS projectName, SubProjectName AS subProjectName FROM dbo.Master WHERE ID = @masterId",
                new { masterId });
        string? clientName = null;
        if (record.TryGetValue("ClientID", out var cid) && cid is int clientId)
            clientName = await conn.QueryFirstOrDefaultAsync<string>("SELECT CompanyName FROM dbo.Clients WHERE ID = @clientId", new { clientId });

        return new
        {
            table, id, title = RecordTitle(table), canEdit = CanEditMaster(user), record, project, clientName,
            columns = cols.Select(c => new
            {
                name = c.Name, label = Friendly(labels.GetValueOrDefault(c.Name, c.Name)), kind = c.Kind, maxLength = c.MaxChars,
                readOnly = c.ReadOnly, audit = AuditColumns.Contains(c.Name, StringComparer.OrdinalIgnoreCase) || c.Name == "ID",
                options = suggestions.GetValueOrDefault(c.Name),
            }),
        };
    }

    /// <summary>Some lists were exported with code-style headers ("CompanyName"); show them as words ("Company Name").</summary>
    static string Friendly(string label) =>
        label.Contains(' ') || label.Contains('_') ? label
            : System.Text.RegularExpressions.Regex.Replace(label, "(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ");

    [Function("AdminRecordGet")]
    public async Task<IActionResult> RecordGet(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/records/{table}/{id:int}")] HttpRequest req, string table, int id)
    {
        if (RecordTable(table) is not { } t) return new NotFoundResult();
        var user = await currentUser.GetAsync(req);
        using var conn = db.Open();
        var payload = await RecordPayload(conn, t, id, user);
        return payload is null ? new NotFoundResult() : new OkObjectResult(payload);
    }

    [Function("AdminRecordUpdate")]
    public async Task<IActionResult> RecordUpdate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "api/admin/records/{table}/{id:int}")] HttpRequest req, string table, int id)
    {
        if (RecordTable(table) is not { } t) return new NotFoundResult();
        var user = await currentUser.GetAsync(req);
        if (!CanEditMaster(user))
            return new ObjectResult(new { errors = new[] { "Only QMS Admins and System Managers can edit records." } }) { StatusCode = 403 };

        var body = await req.ReadFromJsonAsync<MasterUpdate>(Json);
        if (body?.Values is null || body.Values.Count == 0) return new BadRequestObjectResult(new { errors = new[] { "No changes to save" } });

        using var conn = db.Open();
        var cols = (await TableColumns(conn, t)).ToDictionary(c => c.Name, StringComparer.OrdinalIgnoreCase);
        var labels = (await conn.QueryAsync<(string col, string label)>(
            "SELECT ColumnName, SourceColumn FROM dbo._ColumnMap WHERE TableName = @t", new { t }))
            .ToDictionary(x => x.col, x => x.label, StringComparer.OrdinalIgnoreCase);
        var current = Row.From((object?)await conn.QueryFirstOrDefaultAsync($"SELECT * FROM dbo.[{t}] WHERE ID = @id", new { id }));
        if (!current.Exists) return new NotFoundResult();

        if (cols.ContainsKey("Modified") && body.Modified is { } seen && current.D("Modified") is { } now && Math.Abs((now - seen).TotalSeconds) >= 1)
            return new ConflictObjectResult(new { errors = new[] { "This record was changed by someone else after you opened it. Close and reopen it to see the latest values." } });

        var errors = new List<string>();
        var p = new DynamicParameters();
        var sets = new List<string>();
        foreach (var (name, json) in body.Values)
        {
            if (!cols.TryGetValue(name, out var col) || col.ReadOnly) { errors.Add($"{name} cannot be edited"); continue; }
            var label = Friendly(labels.GetValueOrDefault(col.Name, col.Name));
            var raw = json.ValueKind switch
            {
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                JsonValueKind.String => json.GetString(),
                _ => json.GetRawText(),
            };
            if (col.Kind is not ("text" or "longtext")) raw = raw?.Trim();
            if (string.IsNullOrWhiteSpace(raw)) raw = null;

            object? value = raw;
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            switch (col.Kind)
            {
                case "int" or "client" when raw is not null:
                    if (!long.TryParse(raw, out var n)) { errors.Add($"{label} must be a whole number"); continue; }
                    if (col.Kind == "client" && await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.Clients WHERE ID = @n", new { n }) == 0)
                    { errors.Add("Client not found"); continue; }
                    value = col.Type == "bigint" ? n : (object)(int)n; break;
                case "decimal" when raw is not null:
                    if (!decimal.TryParse(raw, System.Globalization.NumberStyles.Number, inv, out var d)) { errors.Add($"{label} must be a number"); continue; }
                    value = d; break;
                case "bit" when raw is not null:
                    value = raw.ToLowerInvariant() switch { "true" or "yes" or "1" => true, "false" or "no" or "0" => false, _ => (bool?)null };
                    if (value is null) { errors.Add($"{label} must be Yes or No"); continue; }
                    break;
                case "date" or "datetime" when raw is not null:
                    if (!DateTime.TryParse(raw, inv, System.Globalization.DateTimeStyles.None, out var dt)) { errors.Add($"{label} is not a valid date"); continue; }
                    value = col.Kind == "date" ? dt.Date : dt; break;
                case "text" or "longtext" when raw is not null:
                    if (col.MaxChars > 0 && raw.Length > col.MaxChars) { errors.Add($"{label} must be {col.MaxChars} characters or fewer"); continue; }
                    break;
            }
            var param = $"p{sets.Count}";
            sets.Add($"[{col.Name}] = @{param}");      // column name verified against sys.columns above
            p.Add(param, value);
        }
        if (errors.Count > 0) return new BadRequestObjectResult(new { errors });

        if (cols.ContainsKey("Modified")) sets.Add("[Modified] = SYSDATETIME()");
        if (cols.ContainsKey("ModifiedBy")) { sets.Add("[ModifiedBy] = @modifiedBy"); p.Add("modifiedBy", user.DisplayName); }
        p.Add("id", id);
        await conn.ExecuteAsync($"UPDATE dbo.[{t}] SET {string.Join(", ", sets)} WHERE ID = @id", p);

        return new OkObjectResult(await RecordPayload(conn, t, id, user));
    }

    // ---------------------------------------------------------------- QMS Forms

    static readonly (string code, string title)[] Forms =
    [
        ("FM01A", "Opportunity Initiation Form - Part A"), ("FM01B", "Project Initiation Form - Part B"),
        ("FM02", "Proposal Risk Review - Go/No Go"), ("FM03A", "Reviewer Allocation - Proposal"), ("FM03B", "Reviewer Allocation - Project"),
        ("FM04", "Proposal Review"), ("FM05", "Project Review Plan"), ("FM06", "Project Plan"), ("FM07", "Safety In Design"),
        ("FM08", "Document Register"), ("FM09", "Drawings & Figures Register"), ("FM10", "Communications Matrix"),
        ("FM11", "Change Request"), ("FM12", "Change Register"), ("FM13", "Basis Of Design"), ("FM14", "Work Package Plan"),
        ("FM15", "CADD Request"), ("FM16", "Project Review"), ("FM17", "Document Transmittal"), ("FM18", "Client Feedback"),
        ("FM19", "Project Closure"),
    ];

    [Function("AdminForms")]
    public async Task<IActionResult> FormList([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/forms")] HttpRequest req)
    {
        using var conn = db.Open();
        var result = new List<object>();
        foreach (var (code, title) in Forms)
        {
            var cols = await FormColumns(conn, code);
            var linked = cols.Contains("ID_Master");
            var counts = await conn.QueryFirstAsync<(int records, int projects)>(
                $"SELECT COUNT(*), {(linked ? "COUNT(DISTINCT ID_Master)" : "0")} FROM dbo.[{code}]");
            var submitted = cols.Contains("IsSubmitted")
                ? await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) FROM dbo.[{code}] WHERE IsSubmitted = 1") : (int?)null;
            result.Add(new { code, name = $"SY-QS-FM-{code[2..]}", title, counts.records, counts.projects, submitted });
        }
        return new OkObjectResult(result);
    }

    [Function("AdminFormRegister")]
    public async Task<IActionResult> FormRegister(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/forms/{code}")] HttpRequest req, string code)
    {
        var form = Forms.FirstOrDefault(f => string.Equals(f.code, code, StringComparison.OrdinalIgnoreCase));
        if (form.code is null) return new NotFoundResult();
        code = form.code;
        var q = req.Query["q"].ToString().Trim();
        var page = Math.Max(0, int.TryParse(req.Query["page"], out var pg) ? pg : 0);
        const int size = 50;

        using var conn = db.Open();
        var cols = await FormColumns(conn, code);
        var linked = cols.Contains("ID_Master");

        // Project identity plus whichever of the common status/audit columns this form has (names come from sys.columns).
        var extras = new[] { "IsSubmitted", "SubmittedByName", "SubmittedDateTime", "Created", "Modified" }.Where(cols.Contains).ToList();
        var columns = new List<(string key, string label, string sql)> { ("id", "ID", "f.ID") };
        if (linked)
            columns.AddRange([("masterId", "Master ID", "f.ID_Master"), ("projectNumber", "Project No", "m.ProjectNumber"),
                              ("projectName", "Project / Site Name", "m.ProjectName"), ("subProjectName", "Sub Project / Descriptor", "m.SubProjectName"),
                              ("office", "Office", "m.OfficeForFormSubmission")]);
        columns.AddRange(extras.Select(c => (c, c switch
        {
            "IsSubmitted" => "Submitted", "SubmittedByName" => "Submitted By", "SubmittedDateTime" => "Submitted Date", _ => c,
        }, $"f.[{c}]")));

        var where = linked && q.Length > 0
            ? "WHERE m.ProjectName LIKE @like OR m.SubProjectName LIKE @like OR CAST(m.ProjectNumber AS varchar(20)) = @q" : "";
        var sql = $"""
            SELECT {string.Join(", ", columns.Select(c => $"{c.sql} AS [{c.key}]"))}, COUNT(*) OVER () AS [__total]
            FROM dbo.[{code}] f {(linked ? "LEFT JOIN dbo.Master m ON m.ID = f.ID_Master" : "")}
            {where}
            ORDER BY f.ID DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
            """;
        var rows = (await conn.QueryAsync(sql, new { q, like = $"%{q}%", skip = page * size, take = size }))
            .Cast<IDictionary<string, object?>>().ToList();
        var total = rows.Count > 0 ? Convert.ToInt32(rows[0]["__total"]) : 0;
        rows.ForEach(x => x.Remove("__total"));
        return new OkObjectResult(new
        {
            code, name = $"SY-QS-FM-{code[2..]}", title = form.title, linked, total, page, pageSize = size,
            columns = columns.Select(c => new { c.key, c.label }), rows,
        });
    }

    static async Task<HashSet<string>> FormColumns(System.Data.IDbConnection conn, string table) =>
        (await conn.QueryAsync<string>("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@t)", new { t = "dbo." + table }))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    // ---------------------------------------------------------------- Admin Responsibility

    [Function("AdminResponsibilityList")]
    public async Task<IActionResult> ResponsibilityList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/admin/responsibility")] HttpRequest req)
    {
        var user = await currentUser.GetAsync(req);
        using var conn = db.Open();
        var items = await conn.QueryAsync(
            "SELECT ID AS id, DisplayName AS name, Email AS email, Location AS location, Role AS role FROM dbo.AdminResponsibility ORDER BY DisplayName");
        return new OkObjectResult(new { roles = Roles, locations = Locations, canEdit = user.IsSystemManager, items });
    }

    public sealed record ResponsibilityEntry(string? Name, string? Email, string? Location, string? Role);

    [Function("AdminResponsibilityCreate")]
    public Task<IActionResult> ResponsibilityCreate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "api/admin/responsibility")] HttpRequest req) => Save(req, null);

    [Function("AdminResponsibilityUpdate")]
    public Task<IActionResult> ResponsibilityUpdate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "api/admin/responsibility/{id:int}")] HttpRequest req, int id) => Save(req, id);

    async Task<IActionResult> Save(HttpRequest req, int? id)
    {
        var user = await currentUser.GetAsync(req);
        if (!user.IsSystemManager) return new ObjectResult(new { errors = new[] { "Only System Managers can change role assignments." } }) { StatusCode = 403 };

        var e = await req.ReadFromJsonAsync<ResponsibilityEntry>(Json);
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(e?.Name)) errors.Add("Name is required");
        if (!Locations.Contains(e?.Location)) errors.Add("Select a valid Location");
        if (!Roles.Contains(e?.Role)) errors.Add("Select a valid Admin Role");
        if (errors.Count > 0) return new BadRequestObjectResult(new { errors });

        using var conn = db.Open();
        var name = e!.Name!.Trim();
        // Link to the staff directory so the role takes effect for that user's sign-in.
        var email = string.IsNullOrWhiteSpace(e.Email)
            ? await conn.QueryFirstOrDefaultAsync<string>("SELECT TOP 1 Email FROM dbo.Staff WHERE DisplayName = @name", new { name })
            : e.Email.Trim().ToLowerInvariant();
        var p = new { id, name, email, location = e.Location, role = e.Role, by = user.DisplayName };

        if (await conn.ExecuteScalarAsync<int>("""
                SELECT COUNT(*) FROM dbo.AdminResponsibility
                WHERE DisplayName = @name AND Location = @location AND Role = @role AND (@id IS NULL OR ID <> @id)
                """, p) > 0)
            return new BadRequestObjectResult(new { errors = new[] { $"{name} already has {e.Role} for {e.Location}" } });

        if (id is null)
            id = await conn.ExecuteScalarAsync<int>("""
                INSERT dbo.AdminResponsibility (DisplayName, Email, Location, Role, ModifiedBy) OUTPUT INSERTED.ID
                VALUES (@name, @email, @location, @role, @by)
                """, p);
        else if (await conn.ExecuteAsync("""
                UPDATE dbo.AdminResponsibility SET DisplayName = @name, Email = @email, Location = @location, Role = @role,
                       Modified = SYSDATETIME(), ModifiedBy = @by WHERE ID = @id
                """, p) == 0)
            return new NotFoundResult();

        return new OkObjectResult(new { id, name, email, location = e.Location, role = e.Role });
    }

    [Function("AdminResponsibilityDelete")]
    public async Task<IActionResult> ResponsibilityDelete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "api/admin/responsibility/{id:int}")] HttpRequest req, int id)
    {
        var user = await currentUser.GetAsync(req);
        if (!user.IsSystemManager) return new ObjectResult(new { errors = new[] { "Only System Managers can change role assignments." } }) { StatusCode = 403 };
        using var conn = db.Open();
        return await conn.ExecuteAsync("DELETE FROM dbo.AdminResponsibility WHERE ID = @id", new { id }) > 0
            ? new NoContentResult() : new NotFoundResult();
    }
}
