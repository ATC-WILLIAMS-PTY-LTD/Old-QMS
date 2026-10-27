# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web rebuild of ATC Williams' Power Apps **QMS** (Quality Management System) app: home page / project search, the per-project Project Delivery Workbook dashboard, the New Job Request (FM-01A) and an Admin area. Data comes from SharePoint list CSV exports loaded into SQL Server. See [README.md](README.md) for what's migrated vs. still placeholder, and the list of deliberate behaviour fixes vs. Power Apps.

## Commands

Prerequisites: .NET 10 SDK, Azure Functions Core Tools v4, SQL Server Express at `.\SQLEXPRESS` (Windows auth).

```powershell
.\run-local.ps1 -Import   # DROPS and recreates every table, then reloads all CSVs (default CSV folder: ~\Downloads\QMS PowerApps Files)
.\run-local.ps1           # start the app at http://localhost:7080 (func start in src/QMS.Functions)
dotnet build QMS.slnx     # build both projects

# Regenerate database/01_schema.sql from the CSV headers
dotnet run --project src/QMS.Importer -- schema <csvDir> database/01_schema.sql
```

There are no automated tests and no linter. There is no front-end build step.

`wwwroot` is copied to the build output (`CopyToOutputDirectory`) and served from `AppContext.BaseDirectory`, so front-end edits only show up after a rebuild / restart of `func start`.

Never run `-Import` casually: it wipes everything entered through the web app since the last import.

## Architecture

**One Functions app serves UI and API.** `src/QMS.Functions` is a .NET 10 isolated-worker Azure Functions app. `host.json` sets `routePrefix: ""`, so API routes are declared with an explicit `api/...` prefix, and `Functions/StaticFiles.cs` is a catch-all `{*path}` route that serves `wwwroot` (returns 404 for anything under `api/`).

**Data access** is Dapper over `Microsoft.Data.SqlClient` (`Data/Db.cs`, connection string `QmsDb`). Queries are hand-written SQL inside the function classes. Dynamic rows are wrapped in `Data/Row.cs`, a null-safe accessor (`S`, `B`, `I`, `M`, `D`, `Is`, `Has`) that mimics Power Apps semantics: a missing record or blank column reads as blank instead of throwing. Admin registers (`AdminFunctions.Registers`) use fixed SQL fragments keyed by name — never build SQL from request input.

**Workbook status logic** lives in one place: `Services/StatusEngine.cs`, a port of the Power Apps FMStatus / DashboardNaviBtn formulas (form unlock order, M/O/N requirement letters, Commenced/Submitted/Completed, per-category rules for Standard / EOR / ITRB, the FM-05 pre-8-March-2022 exemption). It runs over `Services/JobData.cs`, which loads every form record for a job (the equivalent of the Power Apps `var01A..var19` variables). Both the home page and the dashboard use it — change status rules there, not in the front end.

**Auth / roles**: `Services/CurrentUser.cs` reads the signed-in user from App Service Easy Auth headers (`X-MS-CLIENT-PRINCIPAL*`). With no headers (local dev) it falls back to `Qms:DevUserEmail`, plus extra roles from `Qms:DevRoles`, in `local.settings.json`. Roles are the union of `dbo.UserRoles` and `dbo.AdminResponsibility` for that e-mail. All functions are `AuthorizationLevel.Anonymous`; protection depends on Easy Auth being enabled on the Function App, and per-action checks (e.g. `UserInfo.IsSystemManager`) in code.

**Front end** (`wwwroot`): plain ES modules, no framework. `js/app.js` is a hash router (`#/`, `#/project/{id}`, `#/new-job`, `#/admin/...`) dispatching to one `render*` function per page module. `js/ui.js` has the `h(tag, attrs, ...children)` DOM builder plus `modal`/`toast`/`icon` helpers used everywhere. `js/api.js` is the fetch wrapper (errors surface as `ApiError` with an `errors[]` array from the server). `js/config.js` holds constants carried over from the Power Apps App.Formulas.

**Database** (`database/*.sql`, run by the importer in filename order):
- `01_schema.sql` is **generated** — one table per SharePoint list, sanitised column names (e.g. `SY-QS-FM-01A Approval Status` → `FM01AApprovalStatus`); `dbo._ColumnMap` maps back to the original SharePoint column. Regenerate it rather than hand-editing.
- `02_app.sql` creates app-only tables (`Staff`, `UserRoles`, `Lookups`, `Notifications` outbox).
- Files ending `.post.sql` run **after** the CSV load (they seed from imported data, e.g. client-ID repair in `90_seed.post.sql`, `91_admin_responsibility.post.sql`). Batches are split on `GO` lines.

**Importer** (`src/QMS.Importer`): console app with `schema` and `import` commands; parses Australian dates, currency/thousands formatting, and strips SharePoint's zero-width spaces from choice values (`Values.cs`, `Naming.cs`, `Csv.cs`).

## Domain conventions

- `Master` is the project/job table; each FM form table links to it. `Master.V5 = 1` plus an FM-01A category selects the V5 "road map" dashboard, otherwise the legacy flow chart.
- New jobs get Project/Sub-Project Number `-1` ("To be assigned"); the UI hides numbers `<= 0`.
- New Job writes `Master` and `FM01A` in a single transaction and queues an OM e-mail in `Notifications` (nothing sends it yet). Validation is done both client- and server-side — keep them in sync.

## Deployment

`deploy-azure.ps1` provisions Azure SQL (Entra-only auth), a Flex Consumption Function App with managed identity, and App Insights, then prints manual steps (DB user grant, enable Easy Auth). Release with `cd src\QMS.Functions; func azure functionapp publish <app> --dotnet-isolated`.
