<#
  Runs the QMS web app on this machine: http://localhost:7080
    .\run-local.ps1            start the app
    .\run-local.ps1 -Import    (re)load the database from the SharePoint CSV exports first (drops and recreates all tables)
#>
param(
    [switch]$Import,
    [string]$CsvFolder = "$env:USERPROFILE\Downloads\QMS PowerApps Files",
    [string]$Connection = "Server=.\SQLEXPRESS;Database=QMS2026;Trusted_Connection=True;TrustServerCertificate=True",
    [int]$Port = 7080
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if ($Import) {
    Write-Host "Importing SharePoint CSV exports from '$CsvFolder' ..." -ForegroundColor Cyan
    dotnet run --project "$root\src\QMS.Importer" -- import "$CsvFolder" "$root\database" "$Connection"
    if ($LASTEXITCODE -ne 0) { throw "Import failed" }
}

Write-Host "Starting QMS on http://localhost:$Port (Ctrl+C to stop)" -ForegroundColor Green
Push-Location "$root\src\QMS.Functions"
try { func start --port $Port } finally { Pop-Location }
