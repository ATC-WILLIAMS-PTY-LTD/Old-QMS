<#
  One-off Azure provisioning + deployment for the QMS app (Azure Functions .NET 10 isolated + Azure SQL).
  Review the names/region below, sign in with `az login`, then run step by step.

  Creates: resource group, storage account, Azure SQL server + database (Entra-only auth),
           Function App on the Flex Consumption plan with a system-assigned identity, Application Insights.
#>
param(
    [string]$ResourceGroup = 'rg-qms-prod',
    [string]$Location      = 'australiaeast',
    [string]$AppName       = 'atcw-qms',          # must be globally unique -> https://<AppName>.azurewebsites.net
    [string]$SqlServer     = 'atcw-qms-sql',      # must be globally unique
    [string]$SqlDatabase   = 'QMS2026',
    [string]$Storage       = 'atcwqmsstore'       # 3-24 lowercase letters/digits, globally unique
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$me = az ad signed-in-user show --query "{id:id, upn:userPrincipalName}" -o json | ConvertFrom-Json

# 1. Resource group, storage, monitoring
az group create -n $ResourceGroup -l $Location | Out-Null
az storage account create -n $Storage -g $ResourceGroup -l $Location --sku Standard_LRS --allow-blob-public-access false | Out-Null
az monitor app-insights component create --app $AppName -g $ResourceGroup -l $Location | Out-Null

# 2. Azure SQL (Microsoft Entra authentication only; you are the admin)
az sql server create -n $SqlServer -g $ResourceGroup -l $Location --enable-ad-only-auth `
    --external-admin-principal-type User --external-admin-name $me.upn --external-admin-sid $me.id | Out-Null
az sql server firewall-rule create -g $ResourceGroup -s $SqlServer -n AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 | Out-Null
$myIp = (Invoke-RestMethod -Uri 'https://api.ipify.org')
az sql server firewall-rule create -g $ResourceGroup -s $SqlServer -n AdminClient --start-ip-address $myIp --end-ip-address $myIp | Out-Null
az sql db create -g $ResourceGroup -s $SqlServer -n $SqlDatabase --service-objective S1 | Out-Null

# 3. Function App (.NET 10 isolated, Flex Consumption) with a managed identity
az functionapp create -n $AppName -g $ResourceGroup --storage-account $Storage --flexconsumption-location $Location `
    --runtime dotnet-isolated --runtime-version 10.0 --app-insights $AppName | Out-Null
az functionapp identity assign -n $AppName -g $ResourceGroup | Out-Null
$conn = "Server=tcp:$SqlServer.database.windows.net,1433;Database=$SqlDatabase;Authentication=Active Directory Default;Encrypt=True"
az functionapp config appsettings set -n $AppName -g $ResourceGroup --settings "ConnectionStrings__QmsDb=$conn" | Out-Null

# 4. Load the data (runs locally as you, through the AdminClient firewall rule)
dotnet run --project "$root\src\QMS.Importer" -- import "$env:USERPROFILE\Downloads\QMS PowerApps Files" "$root\database" `
    "Server=tcp:$SqlServer.database.windows.net,1433;Database=$SqlDatabase;Authentication=Active Directory Default;Encrypt=True"

Write-Host @"

5. Grant the Function App's identity access to the database. In the Azure portal Query editor for $SqlDatabase run:
     CREATE USER [$AppName] FROM EXTERNAL PROVIDER;
     ALTER ROLE db_datareader ADD MEMBER [$AppName];
     ALTER ROLE db_datawriter ADD MEMBER [$AppName];

6. Turn on sign-in: Function App > Authentication > Add identity provider > Microsoft (your ATC Williams tenant),
   'Require authentication', unauthenticated requests -> 'HTTP 302 redirect'. The app reads the signed-in user from these headers.

7. Deploy the code (re-run this for every release):
     cd src\QMS.Functions; func azure functionapp publish $AppName --dotnet-isolated

Then open https://$AppName.azurewebsites.net
"@ -ForegroundColor Yellow
