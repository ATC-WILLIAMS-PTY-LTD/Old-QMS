using System.Net.Mail;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using QMS.Functions.Data;
using QMS.Functions.Services;

namespace QMS.Functions.Functions;

/// <summary>New Job Request: SY-QS-FM-01A "Opportunity Initiation Form - Part A" (V5) and its lookups.</summary>
public sealed class JobRequestFunctions(Db db, CurrentUser currentUser)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Function("Lookups")]
    public async Task<IActionResult> Lookups([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/lookups")] HttpRequest req)
    {
        using var conn = db.Open();
        var rows = await conn.QueryAsync<(string category, string value)>(
            "SELECT Category, Value FROM dbo.Lookups WHERE Active = 1 ORDER BY Category, SortOrder, ID");
        return new OkObjectResult(rows.GroupBy(r => r.category).ToDictionary(g => g.Key, g => g.Select(r => r.value)));
    }

    [Function("Staff")]
    public async Task<IActionResult> Staff([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/staff")] HttpRequest req)
    {
        using var conn = db.Open();
        return new OkObjectResult(await conn.QueryAsync(
            "SELECT Email AS email, DisplayName AS name, OfficeLocation AS office FROM dbo.Staff WHERE Active = 1 ORDER BY DisplayName"));
    }

    // ---------------------------------------------------------------- Clients & contacts

    [Function("ClientList")]
    public async Task<IActionResult> Clients([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/clients")] HttpRequest req)
    {
        using var conn = db.Open();
        return new OkObjectResult(await conn.QueryAsync(
            "SELECT ID AS id, CompanyName AS name FROM dbo.Clients WHERE CompanyName IS NOT NULL ORDER BY CompanyName"));
    }

    [Function("ClientDetail")]
    public async Task<IActionResult> Client(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/clients/{id:int}")] HttpRequest req, int id)
    {
        using var conn = db.Open();
        var client = await conn.QueryFirstOrDefaultAsync("SELECT * FROM dbo.Clients WHERE ID = @id", new { id });
        if (client is null) return new NotFoundResult();
        var contacts = await conn.QueryAsync("SELECT * FROM dbo.ClientContacts WHERE ClientID = @id ORDER BY ContactName", new { id });
        return new OkObjectResult(new { client, contacts });
    }

    public sealed record NewClient(string? CompanyName, string? CompanyAddressLine1, string? CompanyAddressLine2, string? CompanySuburb,
        string? CompanyState, string? CompanyPostCode, string? CompanyCountry, string? CompanyPhone, string? CompanyEmailAddress,
        string? CompanyWebSite, string? CompanyABN);

    [Function("ClientCreate")]
    public async Task<IActionResult> CreateClient([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "api/clients")] HttpRequest req)
    {
        var c = await req.ReadFromJsonAsync<NewClient>(Json);
        if (c is null) return new BadRequestResult();

        var australia = string.Equals(c.CompanyCountry?.Trim(), "Australia", StringComparison.OrdinalIgnoreCase);
        var errors = Missing(
            ("Company Name", c.CompanyName), ("Address Line 1", c.CompanyAddressLine1), ("Suburb / Town", c.CompanySuburb),
            ("Country", c.CompanyCountry), ("Phone", c.CompanyPhone));
        if (australia) errors.AddRange(Missing(("State", c.CompanyState), ("Post Code", c.CompanyPostCode), ("ABN Number", c.CompanyABN)));
        if (!string.IsNullOrWhiteSpace(c.CompanyEmailAddress) && !IsEmail(c.CompanyEmailAddress)) errors.Add("Email Address is not a valid e-mail");

        using var conn = db.Open();
        if (!string.IsNullOrWhiteSpace(c.CompanyName) &&
            await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.Clients WHERE CompanyName = @n", new { n = c.CompanyName.Trim() }) > 0)
            errors.Add($"A client named '{c.CompanyName.Trim()}' already exists");
        if (errors.Count > 0) return new BadRequestObjectResult(new { errors });

        var id = await conn.ExecuteScalarAsync<int>("""
            INSERT dbo.Clients (CompanyName, CompanyABN, CompanyAddressLine1, CompanyAddressLine2, CompanySuburb, CompanyState,
                                CompanyPostCode, CompanyCountry, CompanyPhone, CompanyEmailAddress, CompanyWebSite)
            OUTPUT INSERTED.ID
            VALUES (@CompanyName, @CompanyABN, @CompanyAddressLine1, @CompanyAddressLine2, @CompanySuburb, @CompanyState,
                    @CompanyPostCode, @CompanyCountry, @CompanyPhone, @CompanyEmailAddress, @CompanyWebSite)
            """, Trimmed(c));
        return new OkObjectResult(new { id, name = c.CompanyName!.Trim() });
    }

    public sealed record NewContact(string? ContactName, string? ContactSalutation, string? ContactPosition, string? ContactPhone,
        string? ContactMobile, string? ContactEmail, string? ATCLink, string? SourcedContactAt);

    [Function("ContactCreate")]
    public async Task<IActionResult> CreateContact(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "api/clients/{id:int}/contacts")] HttpRequest req, int id)
    {
        var c = await req.ReadFromJsonAsync<NewContact>(Json);
        if (c is null) return new BadRequestResult();

        var errors = Missing(("Contact Name", c.ContactName), ("Contact Salutation", c.ContactSalutation),
                             ("Contact Position", c.ContactPosition), ("Contact Email", c.ContactEmail));
        if (!string.IsNullOrWhiteSpace(c.ContactEmail) && !IsEmail(c.ContactEmail)) errors.Add("Contact Email is not a valid e-mail");

        using var conn = db.Open();
        if (await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.Clients WHERE ID = @id", new { id }) == 0)
            errors.Add("Client not found");
        if (errors.Count > 0) return new BadRequestObjectResult(new { errors });

        var contactId = await conn.ExecuteScalarAsync<int>("""
            INSERT dbo.ClientContacts (ClientID, ContactName, ContactSalutation, ContactPosition, ContactPhone, ContactMobile,
                                       ContactEmail, ATCLink, SourcedContactAt)
            OUTPUT INSERTED.ID
            VALUES (@ClientID, @ContactName, @ContactSalutation, @ContactPosition, @ContactPhone, @ContactMobile,
                    @ContactEmail, @ATCLink, @SourcedContactAt)
            """, new DynamicParameters(Trimmed(c)).With("ClientID", id));
        return new OkObjectResult(new { id = contactId, name = c.ContactName!.Trim() });
    }

    // ---------------------------------------------------------------- Sites & related project

    [Function("Sites")]
    public async Task<IActionResult> Sites([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/sites")] HttpRequest req)
    {
        using var conn = db.Open();
        return new OkObjectResult(await conn.QueryAsync("""
            SELECT SiteCode AS code, SiteName AS name, SiteLocation AS state, AddressLine1 AS street1, AddressLine2 AS street2,
                   SiteSuburbTown AS suburb, SitePostCode AS postCode, SiteCountry AS country
            FROM dbo.SiteNames WHERE SiteName IS NOT NULL ORDER BY SiteName
            """));
    }

    [Function("SiteCheck")]
    public async Task<IActionResult> SiteCheck([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/sites/check")] HttpRequest req)
    {
        using var conn = db.Open();
        var (nameExists, codeExists) = await SiteExists(conn, req.Query["name"], req.Query["code"]);
        return new OkObjectResult(new { nameExists, codeExists });
    }

    static async Task<(bool name, bool code)> SiteExists(System.Data.IDbConnection conn, string? name, string? code)
    {
        name = name?.Trim(); code = code?.Trim();
        var nameExists = !string.IsNullOrEmpty(name) &&
            await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.SiteNames WHERE LTRIM(RTRIM(SiteName)) = @name", new { name }) > 0;
        var codeExists = !string.IsNullOrEmpty(code) &&
            await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.SiteNames WHERE LTRIM(RTRIM(SiteCode)) = @code", new { code }) > 0;
        return (nameExists, codeExists);
    }

    /// <summary>"Is this new project related to an existing one?" - find the project and its FM-01A for pre-fill.</summary>
    [Function("RelatedProject")]
    public async Task<IActionResult> Related([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/projects/related")] HttpRequest req)
    {
        if (!int.TryParse(req.Query["number"], out var number) || number <= 0)
            return new BadRequestObjectResult(new { errors = new[] { "Enter a valid Project Number" } });
        int? sub = int.TryParse(req.Query["sub"], out var s) ? s : null;

        using var conn = db.Open();
        var masters = (await conn.QueryAsync(
            "SELECT ID, ProjectName, SubProjectName, SubProjectNumber, ProjectManagerName, ID_Client, V5 FROM dbo.Master WHERE ProjectNumber = @number ORDER BY ID",
            new { number })).Select(Row.From).ToList();
        if (masters.Count == 0) return new NotFoundObjectResult(new { errors = new[] { $"No project found with number {number}" } });

        // Legacy (non-V5) projects need a Sub-Project Number to pick the exact record.
        var master = masters[0].I("V5") == 1 ? masters[0]
            : sub is null ? null : masters.FirstOrDefault(x => x.I("SubProjectNumber") == sub);

        object? detail = null;
        if (master is not null)
        {
            var masterId = master.I("ID");
            var fm01a = await conn.QueryFirstOrDefaultAsync("SELECT TOP 1 * FROM dbo.FM01A WHERE ID_Master = @masterId ORDER BY ID", new { masterId });
            var client = await conn.QueryFirstOrDefaultAsync<string>("SELECT CompanyName FROM dbo.Clients WHERE ID = @id", new { id = master.I("ID_Client") });
            var site = await conn.QueryFirstOrDefaultAsync<string>(
                "SELECT TOP 1 SiteCode FROM dbo.SiteNames WHERE LTRIM(RTRIM(SiteName)) = @n", new { n = master.S("ProjectName") });
            detail = new
            {
                masterId,
                projectName = master.S("ProjectName"),
                subProjectName = master.S("SubProjectName"),
                projectManager = master.S("ProjectManagerName"),
                clientId = master.I("ID_Client"),
                clientName = client,
                siteCode = site,
                fm01a,
            };
        }

        return new OkObjectResult(new
        {
            projectName = masters[0].S("ProjectName"),
            requiresSubProject = masters[0].I("V5") != 1,
            subProjectNumbers = masters.Where(x => x.I("V5") != 1).Select(x => x.I("SubProjectNumber")).Distinct(),
            project = detail,
        });
    }

    // ---------------------------------------------------------------- Create / view job

    public sealed class NewJobRequest
    {
        public string? IsExistingProject { get; set; }
        public int? RelatedMasterId { get; set; }
        public string? ExistingSite { get; set; }
        public string? SiteName { get; set; }
        public string? SiteShortName { get; set; }
        public string? ProjectDescriptor { get; set; }
        public int? ProjectNumber { get; set; }
        public string? ProjectManagerEmail { get; set; }
        public string? SubProjectManagerEmail { get; set; }
        public DateTime? TentativeProjectStartDate { get; set; }
        public DateTime? TentativeProjectEndDate { get; set; }
        public string? LabTestingRequired { get; set; }
        public string? MechanicalComponentsRequired { get; set; }
        public string? SiteWorkExpected { get; set; }
        public string? SeismicHazardIntegrityRequired { get; set; }
        public decimal? EstimatedProjectFeeValue { get; set; }
        public string? ProjectFeeCurrency { get; set; }
        public decimal? ProbabilityOfSuccess { get; set; }
        public decimal? EstimatedProposalValue { get; set; }
        public string? ScopeOfWork { get; set; }
        public string? ProjectCategory { get; set; }
        public string? FeeType { get; set; }
        public string? SubProjectStatus { get; set; }
        public bool NewRates { get; set; }
        public string? PractiseStaffRate { get; set; }
        public string? PractiseStaffRateNew { get; set; }
        public string? InvoiceCurrency { get; set; }
        public string? InvoiceCurrencyOther { get; set; }
        public string? SpecificRates { get; set; }
        public string? TaxRule { get; set; }
        public string? SubjectToLocalBuy { get; set; }
        public string? Commodity { get; set; }
        public string? ProjectType { get; set; }
        public string? PractiseCostCentre { get; set; }
        public List<string>? MultipleTechnicalCommunities { get; set; }
        public string? StreetLine1 { get; set; }
        public string? StreetLine2 { get; set; }
        public string? SiteSuburbTown { get; set; }
        public string? SiteState { get; set; }
        public string? SitePostCode { get; set; }
        public string? SiteCountry { get; set; }
        public int? ClientId { get; set; }
        public int? ContactId { get; set; }
        /// <summary>Use the contact recorded on the related project's FM-01A (it may no longer be in the client's contact list).</summary>
        public bool ContactFromRelated { get; set; }
        public string? OfficeForFormSubmission { get; set; }
    }

    [Function("JobCreate")]
    public async Task<IActionResult> Create([HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "api/jobs")] HttpRequest req)
    {
        var j = await req.ReadFromJsonAsync<NewJobRequest>(Json);
        if (j is null) return new BadRequestResult();
        var user = await currentUser.GetAsync(req);

        using var conn = db.Open();

        // ---- Validation (the red-star checks of the Submit button, plus the gaps the original left open)
        var errors = Missing(
            ("Is this new project related to an existing one?", j.IsExistingProject), ("Existing Site", j.ExistingSite),
            ("Site Name", j.SiteName), ("Site Short Name", j.SiteShortName), ("Project Descriptor", j.ProjectDescriptor),
            ("Project Manager", j.ProjectManagerEmail),
            ("Lab testing", j.LabTestingRequired), ("Mechanical Engineering Components", j.MechanicalComponentsRequired),
            ("Site work", j.SiteWorkExpected), ("Seismic Hazard Integrity Services", j.SeismicHazardIntegrityRequired),
            ("Scope of Work", j.ScopeOfWork), ("Project Category", j.ProjectCategory), ("Fee Type", j.FeeType),
            ("Project Status", j.SubProjectStatus), ("Invoice Currency", j.InvoiceCurrency), ("Specific Rate(s)", j.SpecificRates),
            ("Tax Rule", j.TaxRule), ("Subject to Local Buy", j.SubjectToLocalBuy), ("Commodity", j.Commodity),
            ("Project Type", j.ProjectType), ("Office", j.PractiseCostCentre),
            ("Site Address Line 1", j.StreetLine1), ("Site Suburb/Town", j.SiteSuburbTown), ("Site State", j.SiteState),
            ("Site Post code", j.SitePostCode), ("Site Country", j.SiteCountry),
            ("Office for Form Submission", j.OfficeForFormSubmission));
        if (j.NewRates ? string.IsNullOrWhiteSpace(j.PractiseStaffRateNew) : string.IsNullOrWhiteSpace(j.PractiseStaffRate))
            errors.Add(j.NewRates ? "File path of the new Rates document is required" : "Default Rate Group is required");
        if (j.InvoiceCurrency == "Other (Please specify)" && string.IsNullOrWhiteSpace(j.InvoiceCurrencyOther))
            errors.Add("Please specify the Invoice Currency");
        if (j.TentativeProjectStartDate is null) errors.Add("Tentative Project Start Date is required");
        if (j.TentativeProjectEndDate is null) errors.Add("Tentative Project End Date is required");
        if (j.TentativeProjectStartDate > j.TentativeProjectEndDate) errors.Add("Tentative Project End Date must be on or after the Start Date");
        if (j.EstimatedProjectFeeValue is null or < 0) errors.Add("Estimated Project Fee Value is required");
        if (j.ProbabilityOfSuccess is null or < 0 or > 1) errors.Add("Probability of Success must be a decimal between 0 and 1");
        if (j.EstimatedProposalValue is null or < 0 or > 1) errors.Add("Estimated Proposal Value must be a decimal between 0 and 1");
        if (j.ClientId is null) errors.Add("Client / Company Name is required");
        if ((j.ProjectDescriptor?.Trim().Length ?? 0) > 30) errors.Add("Project Descriptor must be 30 characters or fewer");
        if ((j.SiteShortName?.Trim().Length ?? 0) > 6) errors.Add("Site Short Name must be 6 characters or fewer");

        if (j.ExistingSite == "No")
        {
            var (nameExists, codeExists) = await SiteExists(conn, j.SiteName, j.SiteShortName);
            if (nameExists) errors.Add($"Site Name with {j.SiteName?.Trim()} already exists");
            if (codeExists) errors.Add($"Site Short Name with {j.SiteShortName?.Trim()} already exists");
        }
        else if (j.ExistingSite == "Yes" && !string.IsNullOrWhiteSpace(j.SiteName) && !(await SiteExists(conn, j.SiteName, null)).name)
            errors.Add("Please Select Valid Site Name or change existing site name to 'no'");

        var pm = await conn.QueryFirstOrDefaultAsync<(string email, string name)?>(
            "SELECT Email, DisplayName FROM dbo.Staff WHERE Email = @e", new { e = j.ProjectManagerEmail?.Trim().ToLowerInvariant() });
        if (j.ProjectManagerEmail is not null && pm is null) errors.Add("Project Manager not found in the staff directory");
        var spm = string.IsNullOrWhiteSpace(j.SubProjectManagerEmail) ? pm
            : await conn.QueryFirstOrDefaultAsync<(string email, string name)?>(
                "SELECT Email, DisplayName FROM dbo.Staff WHERE Email = @e", new { e = j.SubProjectManagerEmail.Trim().ToLowerInvariant() });

        var client = j.ClientId is null ? null : Row.From((object?)await conn.QueryFirstOrDefaultAsync("SELECT * FROM dbo.Clients WHERE ID = @id", new { id = j.ClientId }));
        if (j.ClientId is not null && client is { Exists: false }) errors.Add("Client not found");
        var contact = j.ContactId is not null
            ? Row.From((object?)await conn.QueryFirstOrDefaultAsync("SELECT * FROM dbo.ClientContacts WHERE ID = @id AND ClientID = @c", new { id = j.ContactId, c = j.ClientId }))
            : j.ContactFromRelated && j.IsExistingProject == "Yes" && j.RelatedMasterId is not null
                // FM-01A keeps its own copy of the contact columns, named as in ClientContacts.
                ? Row.From((object?)await conn.QueryFirstOrDefaultAsync("""
                    SELECT TOP 1 ContactName, ContactSalutation, ContactPosition, ContactPhone, ContactMobile, ContactEmail, ATCLink, SourcedContactAt
                    FROM dbo.FM01A WHERE ID_Master = @m ORDER BY ID
                    """, new { m = j.RelatedMasterId }))
                : Row.Empty;

        if (errors.Count > 0) return new BadRequestObjectResult(new { errors });

        // ---- Write Master + FM-01A in one transaction (the original could leave an orphan Master row)
        var now = DateTime.Now;
        using var tx = conn.BeginTransaction();
        var masterId = await conn.ExecuteScalarAsync<int>("""
            INSERT dbo.Master (ProjectName, ProjectNumber, SubProjectName, SubProjectNumber, ID_Client, CreatedBy,
                               ProjectManagerName, SubProjectManagerName, OfficeForFormSubmission, FM01BApprovalStatus, ProjectStatus,
                               Created, Modified, V5, SiteName, SiteShortName, FM01AApprovalStatus, FM01AOMApprovalStatus)
            OUTPUT INSERTED.ID
            VALUES (@siteName, @projectNumber, @descriptor, -1, @clientId, @createdBy,
                    @pm, @spm, @office, 'Pending', 0, @now, @now, 1, @siteName, @shortName, 'Pending', 'Pending')
            """, new
        {
            siteName = j.SiteName!.Trim(),
            projectNumber = j.ProjectNumber is > 0 ? j.ProjectNumber : -1,
            descriptor = j.ProjectDescriptor!.Trim(),
            clientId = j.ClientId,
            createdBy = user.DisplayName,
            pm = pm!.Value.name,
            spm = spm?.name ?? pm.Value.name,
            office = j.OfficeForFormSubmission,
            now,
            shortName = j.SiteShortName!.Trim(),
        }, tx);

        var invoiceCurrency = j.InvoiceCurrency == "Other (Please specify)" ? j.InvoiceCurrencyOther!.Trim() : j.InvoiceCurrency;
        await conn.ExecuteAsync("""
            INSERT dbo.FM01A (ID_Master, ProjectManager, SubProjectManager, EstimatedProjectFeeValue, ProbabilityOfSuccess, EstimatedProposalValue,
                ExistingProject, LabTestingRequired, ScopeOfWork, FeeType, SubProjectStatus, PractiseStaffRate, TaxRule, SpecificRates,
                SubjectToLocalBuy, Commodity, PractiseCostCentre, ProjectType, MultipleTechnicalCommunities,
                CompanyName, ABN, AddressLine1, AddressLine2, SuburbTown, State, PostCode, Country, PhoneNumber, EmailAddress, CompanyWebSite,
                ContactName, ContactSalutation, ContactPosition, ContactPhone, ContactMobile, ContactEmail, ATCLink, SourcedContactAt,
                SubmittedByEmail, SubmittedByName, SubmittedDateTime, ProjectManagerEmail, SubProjectManagerEmail,
                TentativeProjectStartDate, TentativeProjectEndDate, PractiseStaffRateNew, Created, Modified,
                SiteName, SiteShortName, InvoiceCurrency, StreetLine1, StreetLine2, SiteSuburbTown, SiteState, SiteCountry, SitePostCode,
                MechanicalComponentsRequired, SiteWorkExpected, ProjectCategory, ProjectRelatedTo, IsExistingProject,
                OfficeForFormSubmission, ProjectFeeCurrency, SeismicHazardIntegrityRequired)
            VALUES (@masterId, @pmName, @spmName, @fee, @prob, @proposal,
                @existingSite, @lab, @scope, @feeType, @status, @rate, @tax, @specific,
                @localBuy, @commodity, @costCentre, @projectType, @tcs,
                @companyName, @abn, @addr1, @addr2, @suburb, @state, @postCode, @country, @phone, @email, @web,
                @contactName, @salutation, @position, @contactPhone, @mobile, @contactEmail, @atcLink, @sourced,
                @userEmail, @userName, @now, @pmEmail, @spmEmail,
                @start, @end, @rateNew, @now, @now,
                @siteName, @shortName, @invoiceCurrency, @street1, @street2, @siteSuburb, @siteState, @siteCountry, @sitePostCode,
                @mechanical, @siteWork, @category, @related, @isExisting,
                @office, @feeCurrency, @seismic)
            """, new
        {
            masterId,
            pmName = pm.Value.name, spmName = spm?.name ?? pm.Value.name,
            fee = j.EstimatedProjectFeeValue, prob = j.ProbabilityOfSuccess, proposal = j.EstimatedProposalValue,
            existingSite = j.ExistingSite, lab = j.LabTestingRequired, scope = j.ScopeOfWork!.Trim(),
            feeType = j.FeeType, status = j.SubProjectStatus,
            rate = j.NewRates ? null : j.PractiseStaffRate, tax = j.TaxRule, specific = j.SpecificRates,
            localBuy = j.SubjectToLocalBuy, commodity = j.Commodity, costCentre = j.PractiseCostCentre, projectType = j.ProjectType,
            tcs = j.MultipleTechnicalCommunities is { Count: > 0 } list ? JsonSerializer.Serialize(list) : null,
            companyName = client!.S("CompanyName"), abn = client.S("CompanyABN"), addr1 = client.S("CompanyAddressLine1"),
            addr2 = client.S("CompanyAddressLine2"), suburb = client.S("CompanySuburb"), state = client.S("CompanyState"),
            postCode = client.S("CompanyPostCode"), country = client.S("CompanyCountry"), phone = client.S("CompanyPhone"),
            email = client.S("CompanyEmailAddress"), web = client.S("CompanyWebSite"),
            contactName = contact.S("ContactName"), salutation = contact.S("ContactSalutation"), position = contact.S("ContactPosition"),
            contactPhone = contact.S("ContactPhone"), mobile = contact.S("ContactMobile"), contactEmail = contact.S("ContactEmail"),
            atcLink = contact.S("ATCLink"), sourced = contact.S("SourcedContactAt"),
            userEmail = user.Email, userName = user.DisplayName, now,
            pmEmail = pm.Value.email, spmEmail = spm?.email ?? pm.Value.email,
            start = j.TentativeProjectStartDate!.Value.Date, end = j.TentativeProjectEndDate!.Value.Date,
            rateNew = j.NewRates ? j.PractiseStaffRateNew!.Trim() : null,
            siteName = j.SiteName.Trim(), shortName = j.SiteShortName.Trim(), invoiceCurrency,
            street1 = j.StreetLine1?.Trim(), street2 = j.StreetLine2?.Trim(), siteSuburb = j.SiteSuburbTown?.Trim(),
            siteState = j.SiteState?.Trim(), siteCountry = j.SiteCountry?.Trim(), sitePostCode = j.SitePostCode?.Trim(),
            mechanical = j.MechanicalComponentsRequired, siteWork = j.SiteWorkExpected, category = j.ProjectCategory,
            related = j.IsExistingProject == "Yes" ? j.RelatedMasterId : null, isExisting = j.IsExistingProject,
            office = j.OfficeForFormSubmission, feeCurrency = j.ProjectFeeCurrency ?? "AUD", seismic = j.SeismicHazardIntegrityRequired,
        }, tx);

        // ---- Queue the "ready for OM Approval" e-mail to the OM group for the submission office
        var omEmails = (await conn.QueryAsync<string>("""
            SELECT Email FROM dbo.AdminResponsibility WHERE Role = 'QMS OM' AND Location = @office AND Email IS NOT NULL
            UNION SELECT Email FROM dbo.UserRoles WHERE Role = 'OM' AND Office = @office
            """, new { office = j.OfficeForFormSubmission }, tx)).ToList();
        if (j.NewRates) omEmails.Add("alexa@atcwilliams.com.au");
        var message = (j.NewRates ? "<b>A new rate group has been requested to be added.</b><br/>" : "") + "This project is now ready for OM Approval.";
        await conn.ExecuteAsync("""
            INSERT dbo.Notifications (ID_Master, ToAddress, Subject, Body) VALUES (@masterId, @to, @subject, @body)
            """, new
        {
            masterId,
            to = omEmails.Count > 0 ? string.Join(";", omEmails) : $"OM group - {j.OfficeForFormSubmission}",
            subject = $"QMS new project has been created by {user.DisplayName}",
            body = $"<p>Site Name: {System.Net.WebUtility.HtmlEncode(j.SiteName.Trim())}<br/>Project Descriptor: {System.Net.WebUtility.HtmlEncode(j.ProjectDescriptor.Trim())}<br/>Project Number: To be assigned</p><p>{message}</p>",
        }, tx);

        tx.Commit();
        return new OkObjectResult(new { masterId, category = j.ProjectCategory });
    }

    /// <summary>FM-01A as submitted, for the read-only view of an existing job.</summary>
    [Function("JobGet")]
    public async Task<IActionResult> Get([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "api/jobs/{masterId:int}")] HttpRequest req, int masterId)
    {
        using var conn = db.Open();
        var master = await conn.QueryFirstOrDefaultAsync("SELECT * FROM dbo.Master WHERE ID = @masterId", new { masterId });
        if (master is null) return new NotFoundResult();
        var fm01a = await conn.QueryFirstOrDefaultAsync("SELECT TOP 1 * FROM dbo.FM01A WHERE ID_Master = @masterId ORDER BY ID", new { masterId });
        return new OkObjectResult(new { master, fm01a });
    }

    // ---------------------------------------------------------------- helpers

    static List<string> Missing(params (string label, string? value)[] fields) =>
        fields.Where(f => string.IsNullOrWhiteSpace(f.value)).Select(f => $"{f.label} is required").ToList();

    static bool IsEmail(string value) => MailAddress.TryCreate(value.Trim(), out var a) && a.Address == value.Trim();

    /// <summary>Copies a record's string properties into Dapper parameters, trimmed, with blanks as NULL.</summary>
    static DynamicParameters Trimmed(object record)
    {
        var p = new DynamicParameters();
        foreach (var prop in record.GetType().GetProperties())
        {
            var v = prop.GetValue(record) as string;
            p.Add(prop.Name, string.IsNullOrWhiteSpace(v) ? null : v.Trim());
        }
        return p;
    }
}

static class DynamicParametersExtensions
{
    public static DynamicParameters With(this DynamicParameters p, string name, object? value)
    {
        p.Add(name, value);
        return p;
    }
}
