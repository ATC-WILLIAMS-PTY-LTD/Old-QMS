# ATC Williams QMS (web)

Web rebuild of the Power Apps **QMS** app: the home page (project gallery, search, summary and Workbook Form Status), the per-project **Project Delivery Workbook dashboard**, and the **New Job Request** (SY-QS-FM-01A Opportunity Initiation Form - Part A). It works on desktop and mobile.

| Layer | Technology |
|---|---|
| Front end | HTML / CSS / JavaScript modules, no build step (`src/QMS.Functions/wwwroot`) |
| API | C# Azure Functions, .NET 10 isolated worker, HTTP triggers, Dapper (`src/QMS.Functions`) |
| Database | SQL Server: SQL Express locally, Azure SQL in Azure (`database/*.sql`) |
| Data migration | C# console app that loads the SharePoint list CSV exports (`src/QMS.Importer`) |

The Functions app serves both the API (`/api/...`) and the web pages, so one URL hosts everything.

## Run locally

Prerequisites: .NET 10 SDK, Azure Functions Core Tools v4, SQL Server Express (`.\SQLEXPRESS`, Windows authentication).

```powershell
.\run-local.ps1 -Import   # first time: creates database QMS2026 and loads all CSVs (about 30 s)
.\run-local.ps1           # afterwards
```

Open **http://localhost:7080**. Port 7080 is used because 7071 is often taken by another Functions project.

Locally you are signed in as `Qms:DevUserEmail` from `src/QMS.Functions/local.settings.json`. Change it to test as another user, for example `alexa@atcwilliams.com.au`, who has the QMS Audit and Check Metrics roles.

> `-Import` **drops and recreates every table**. Anything entered in the web app since the last import is lost. Only use it to refresh from a new SharePoint export.

## Database

- `01_schema.sql` is generated from the CSV headers (`dotnet run --project src/QMS.Importer -- schema <csvDir> database/01_schema.sql`).
  - There is one table per SharePoint list, e.g. `Master`, `FM01A`, `FM02_Notes`, `Clients`, `SiteNames`.
  - Column names are sanitised (`SY-QS-FM-01A Approval Status` becomes `FM01AApprovalStatus`). `dbo._ColumnMap` keeps the original SharePoint column name for every column.
  - Values are parsed from the export's Australian date format and from currency and thousands-separator formatting. The hidden zero-width spaces on SharePoint choice values are removed.
- `02_app.sql` creates the tables that have no SharePoint export:
  - `Staff` replaces the Office 365 people picker.
  - `UserRoles` replaces the e-mail allow-lists and O365 groups.
  - `Lookups` holds the choice lists.
  - `Notifications` is an e-mail outbox.
- `90_seed.post.sql` runs after the load:
  - It seeds `Staff` from FM-01A and copies the role allow-lists from the old home screen.
  - It **repairs client IDs**. `Clients.csv` was exported with renumbered IDs (1..1230), which matched none of the IDs that projects reference. Real IDs are recovered by matching company names on FM-01A, and the 24 missing referenced clients are rebuilt from the FM-01A copy. All 3,851 project→client links resolve. 501 contacts belong to clients that no project references, so their link cannot be recovered from the export. Re-export `Clients` with the real `ID` column to fix this.

## Admin area

The **Admin** button on the home page opens `#/admin`, laid out like the QMS prototype (localhost:5173). It has two sections.

**Data Access**

- Searchable, paged registers for QMS Master, Clients, Client Contacts and QMS Site Names. A QMS Master row opens that project's dashboard.
- QMS Forms shows record and submitted counts per form and a register for each form.

**Administration**

- Admin Responsibility is a role × office matrix stored in `dbo.AdminResponsibility`. It is seeded with 204 assignments in `91_admin_responsibility.post.sql`.
  - Only System Managers can add, edit or delete entries.
  - Locally, `Qms:DevRoles` in `local.settings.json` grants that role to the dev user.
  - An assignment only takes effect at sign-in when it is linked to a staff e-mail. 13 seeded people (51 entries) have no e-mail in `Staff`, so they show in grey until linked.
  - `QMS OM` assignments receive the "ready for OM Approval" notification for their office.
- QMS Admin is a placeholder.

The bell shows the number of jobs waiting for approval and links to that home-page search.

## Roles

Roles are stored in `dbo.UserRoles (Email, Role, Office)`:

- `SystemManager`: settings gear
- `Auditor`: QMS Audit
- `Metrics`: Check Metrics
- `OM` with an Office: receives the "ready for OM Approval" notification

Add members with plain SQL, for example:

```sql
INSERT dbo.UserRoles (Email, Role, Office) VALUES ('someone@atcwilliams.com.au', 'OM', 'Queensland');
```

## Behaviour carried over from Power Apps

- Form unlock order, the M/O/N requirement letters and Commenced / Submitted / Completed are ported in `Services/StatusEngine.cs`. This includes the per-category rules for Standard, EOR, ITRB - On Board and ITRB - Individual, and the FM-05 pre-8 March 2022 exemption. Home and dashboard share this one engine.
- The dashboard picks the V5 "road map" when `Master.V5 = 1` and the FM-01A category is set. Otherwise it shows the legacy flow chart. On phones both become phase cards.
- New Job:
  - Writes `Master` and `FM01A` in **one transaction**, with V5 = 1, Project/Sub-Project Number = -1 ("To be assigned") and approvals Pending.
  - Queues the OM e-mail in `Notifications`.
  - Validates on both client and server.

Deliberate fixes:

- The FM-18 tile opens FM-18 (not FM-17).
- Site Short Name and the Seismic question are enforced.
- The tentative end date must not be before the start date.
- Probability values must be between 0 and 1.
- New client names are checked for duplicates.
- Searches run on the server over every project, not just the first 2,000 rows.

## Not migrated yet

- **Forms FM-01B to FM-19** open a read-only view of their migrated records.
- **OM approval and Admin confirmation** of FM-01A: the job request shows their status but cannot yet approve.
- **Project Health Check, QMS Audit, Check Metrics and Groups** are placeholder pages.
- **E-mail sending:** `Notifications` is filled but nothing sends it yet. Add a timer function using Microsoft Graph or Azure Communication Services.

## Deploy to Azure

`deploy-azure.ps1` provisions the resource group, Azure SQL (Entra-only auth), a Function App (Flex Consumption, .NET 10 isolated, managed identity) and Application Insights. It loads the data and prints the remaining manual steps:

1. Grant the app's identity access to the database.
2. Turn on App Service Authentication with Microsoft Entra ID ("Require authentication").
3. Publish with `func azure functionapp publish <app> --dotnet-isolated`.

Review the names and region at the top of the script before running it.

In Azure the signed-in user comes from the Easy Auth headers (`Services/CurrentUser.cs`). The API functions are `Anonymous` at the Functions level, so **authentication must be enabled on the Function App** before it is exposed.
