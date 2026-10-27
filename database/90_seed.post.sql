-- Runs after the CSV data load.

-- Clients.csv was exported with a renumbered ID column (1..n), so it does not match the SharePoint IDs that
-- Master.ID_Client and ClientContacts.ClientID reference. Recover the real IDs:
--   1. match each client by name to the ID_Client used on jobs (FM-01A keeps a copy of the company name),
--   2. rebuild referenced clients missing from the export from the company details copied onto FM-01A,
--   3. give the remaining (never referenced) clients new IDs above every existing reference.
SELECT c.*, CAST(NULL AS int) AS NewID INTO #clients FROM dbo.Clients c;

WITH refs AS (
    SELECT LTRIM(RTRIM(a.CompanyName)) AS name, m.ID_Client AS id, COUNT(*) AS cnt
    FROM dbo.Master m JOIN dbo.FM01A a ON a.ID_Master = m.ID
    WHERE m.ID_Client IS NOT NULL AND a.CompanyName IS NOT NULL
    GROUP BY LTRIM(RTRIM(a.CompanyName)), m.ID_Client
), best AS (
    SELECT name, id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY cnt DESC, id DESC) AS rn FROM refs
)
UPDATE c SET NewID = b.id FROM #clients c JOIN best b ON b.name = LTRIM(RTRIM(c.CompanyName)) AND b.rn = 1;

WITH dup AS (SELECT NewID, ROW_NUMBER() OVER (PARTITION BY NewID ORDER BY ID) AS rn FROM #clients WHERE NewID IS NOT NULL)
UPDATE dup SET NewID = NULL WHERE rn > 1;

DECLARE @base int = (SELECT MAX(v) FROM (
    SELECT MAX(NewID) FROM #clients UNION ALL SELECT MAX(ID_Client) FROM dbo.Master UNION ALL SELECT MAX(ClientID) FROM dbo.ClientContacts) x(v));
WITH un AS (SELECT NewID, ROW_NUMBER() OVER (ORDER BY ID) AS rn FROM #clients WHERE NewID IS NULL)
UPDATE un SET NewID = @base + rn;

DELETE FROM dbo.Clients;
SET IDENTITY_INSERT dbo.Clients ON;
INSERT dbo.Clients (ID, CompanyName, CompanyABN, CompanyAddressLine1, CompanyAddressLine2, CompanySuburb, CompanyState,
                    CompanyPostCode, CompanyCountry, CompanyPhone, CompanyEmailAddress, CompanyWebSite)
SELECT NewID, CompanyName, CompanyABN, CompanyAddressLine1, CompanyAddressLine2, CompanySuburb, CompanyState,
       CompanyPostCode, CompanyCountry, CompanyPhone, CompanyEmailAddress, CompanyWebSite FROM #clients;

INSERT dbo.Clients (ID, CompanyName, CompanyABN, CompanyAddressLine1, CompanyAddressLine2, CompanySuburb, CompanyState,
                    CompanyPostCode, CompanyCountry, CompanyPhone, CompanyEmailAddress, CompanyWebSite)
SELECT ID_Client, CompanyName, ABN, AddressLine1, AddressLine2, SuburbTown, State, PostCode, Country, PhoneNumber, EmailAddress, CompanyWebSite
FROM (
    SELECT m.ID_Client, a.*, ROW_NUMBER() OVER (PARTITION BY m.ID_Client ORDER BY a.Created DESC) AS rn
    FROM dbo.Master m JOIN dbo.FM01A a ON a.ID_Master = m.ID
    WHERE m.ID_Client IS NOT NULL AND a.CompanyName IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.Clients c WHERE c.ID = m.ID_Client)
) x WHERE rn = 1;
SET IDENTITY_INSERT dbo.Clients OFF;
DROP TABLE #clients;
GO

-- Staff directory from the project managers / submitters recorded on FM-01A (most recent name per e-mail).
INSERT dbo.Staff (Email, DisplayName)
SELECT Email, DisplayName FROM (
    SELECT LOWER(LTRIM(RTRIM(Email))) AS Email, LTRIM(RTRIM(Name)) AS DisplayName,
           ROW_NUMBER() OVER (PARTITION BY LOWER(LTRIM(RTRIM(Email))) ORDER BY Created DESC) AS rn
    FROM (
        SELECT ProjectManagerEmail AS Email, ProjectManager AS Name, Created FROM dbo.FM01A
        UNION ALL SELECT SubProjectManagerEmail, SubProjectManager, Created FROM dbo.FM01A
        UNION ALL SELECT SubmittedByEmail, SubmittedByName, Created FROM dbo.FM01A
    ) s
    WHERE Email LIKE '%@atcwilliams.com%' AND Name IS NOT NULL
      AND Name NOT IN ('Intranet', 'CPlus Admin')
) x WHERE rn = 1;
GO

-- Roles carried over from the hard-coded allow-lists on the Power Apps home screen.
INSERT dbo.UserRoles (Email, Role) VALUES
 ('intranet@atcwilliams.com','SystemManager'),('alexa@atcwilliams.com.au','SystemManager'),
 ('alexv@atcwilliams.com.au','SystemManager'),('faisala@atcwilliams.com.au','SystemManager'),
 ('samw@atcwilliams.com.au','Auditor'),('alexa@atcwilliams.com.au','Auditor'),('alexv@atcwilliams.com.au','Auditor'),
 ('claireg@atcwilliams.com.au','Auditor'),('denisef@atcwilliams.com.au','Auditor'),('faisala@atcwilliams.com.au','Auditor'),
 ('angelat@atcwilliams.com.au','Auditor'),('intranet@atcwilliams.com','Auditor'),
 ('alexa@atcwilliams.com.au','Metrics'),('faisala@atcwilliams.com.au','Metrics'),('intranet@atcwilliams.com','Metrics');
GO
