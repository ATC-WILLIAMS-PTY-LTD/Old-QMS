-- Application tables that have no SharePoint list export.

-- Staff directory: replaces the Office 365 people picker (seeded from FM-01A in 90_seed.post.sql).
IF OBJECT_ID('dbo.Staff') IS NOT NULL DROP TABLE dbo.Staff;
CREATE TABLE dbo.Staff (
    Email        nvarchar(255) NOT NULL PRIMARY KEY,
    DisplayName  nvarchar(255) NOT NULL,
    OfficeLocation nvarchar(100) NULL,
    Active       bit NOT NULL DEFAULT 1
);
GO

-- Role membership: replaces the hard-coded e-mail allow-lists and Office 365 groups.
-- Role: SystemManager | Auditor | Metrics | OM | Admin.  Office is set for the per-region OM / Admin roles.
IF OBJECT_ID('dbo.UserRoles') IS NOT NULL DROP TABLE dbo.UserRoles;
CREATE TABLE dbo.UserRoles (
    ID     int IDENTITY(1,1) PRIMARY KEY,
    Email  nvarchar(255) NOT NULL,
    Role   nvarchar(50)  NOT NULL,
    Office nvarchar(100) NULL
);
CREATE INDEX IX_UserRoles_Email ON dbo.UserRoles (Email);
GO

-- Admin Responsibility: QMS role assignments per office (replaces the Office 365 groups loaded in App.Formulas,
-- e.g. QMS Admin, QMS OM, FR03 Risk reviewers). Seeded in 91_admin_responsibility.post.sql.
IF OBJECT_ID('dbo.AdminResponsibility') IS NOT NULL DROP TABLE dbo.AdminResponsibility;
CREATE TABLE dbo.AdminResponsibility (
    ID          int IDENTITY(1,1) PRIMARY KEY,
    DisplayName nvarchar(255) NOT NULL,
    Email       nvarchar(255) NULL,
    Location    nvarchar(100) NOT NULL,
    Role        nvarchar(100) NOT NULL,
    Modified    datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
    ModifiedBy  nvarchar(255) NULL
);
CREATE INDEX IX_AdminResponsibility_Email ON dbo.AdminResponsibility (Email);
GO

-- Choice lists for the forms (SharePoint choice columns).
IF OBJECT_ID('dbo.Lookups') IS NOT NULL DROP TABLE dbo.Lookups;
CREATE TABLE dbo.Lookups (
    ID        int IDENTITY(1,1) PRIMARY KEY,
    Category  nvarchar(50)  NOT NULL,
    Value     nvarchar(255) NOT NULL,
    SortOrder int NOT NULL DEFAULT 0,
    Active    bit NOT NULL DEFAULT 1
);
CREATE INDEX IX_Lookups_Category ON dbo.Lookups (Category, SortOrder);
GO

-- E-mail outbox: notifications are queued here (the Power Automate QMSSendEmailV2 flow equivalent).
IF OBJECT_ID('dbo.Notifications') IS NOT NULL DROP TABLE dbo.Notifications;
CREATE TABLE dbo.Notifications (
    ID        int IDENTITY(1,1) PRIMARY KEY,
    ID_Master int NULL,
    ToAddress nvarchar(2000) NOT NULL,
    Subject   nvarchar(500)  NOT NULL,
    Body      nvarchar(max)  NOT NULL,
    Created   datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
    SentAt    datetime2(0) NULL
);
GO

-- Inserted straight from VALUES so the identity ID keeps the list order (the API orders by SortOrder, ID).
INSERT dbo.Lookups (Category, Value) VALUES
 ('YesNo','Yes'),('YesNo','No'),
 ('Currency','AUD'),('Currency','USD'),
 ('ProjectCategory','Standard'),('ProjectCategory','EOR'),('ProjectCategory','ITRB - On Board'),('ProjectCategory','ITRB - Individual'),
 ('FeeType','Capped Rates'),('FeeType','Fixed Fee'),('FeeType','Hourly / Cost Rate'),('FeeType','No Billing'),
 ('SubProjectStatus','Proposal'),('SubProjectStatus','Prospect'),('SubProjectStatus','Active'),('SubProjectStatus','Non Billable'),
 ('InvoiceCurrency','Australian Dollar (AUD)'),('InvoiceCurrency','US Dollar (USD)'),('InvoiceCurrency','Other (Please specify)'),
 ('TaxRule','10% Tax Applicable'),('TaxRule','Peru - 18% IGV'),('TaxRule','Tax Free'),
 ('Commodity','Aluminium'),('Commodity','Coal'),('Commodity','Copper'),('Commodity','Diamond'),('Commodity','Gold'),('Commodity','Graphite'),
 ('Commodity','Iron Ore / Magnetite'),('Commodity','Lead'),('Commodity','Lithium'),('Commodity','Manganese'),('Commodity','Mineral Sands'),
 ('Commodity','Nickel'),('Commodity','Other/Not Mining'),('Commodity','Phosphate'),('Commodity','Silver'),('Commodity','Tin'),
 ('Commodity','Tungsten'),('Commodity','Uranium'),('Commodity','Vanadium'),('Commodity','Zinc'),
 ('TechnicalCommunity','TC1 Tailings Management'),('TechnicalCommunity','TC2 Resources Recovery'),('TechnicalCommunity','TC3 Landfill Engineering'),
 ('TechnicalCommunity','TC4 Dam Break Modelling'),('TechnicalCommunity','TC5 Dams Engineering'),('TechnicalCommunity','TC6 Water Resources'),
 ('TechnicalCommunity','TC7 Hydraulics & Structural Engineering'),('TechnicalCommunity','TC8 Hydrogeology'),('TechnicalCommunity','TC9 Materials Characterisation'),
 ('TechnicalCommunity','TC10 Geotechnical Investigation'),('TechnicalCommunity','TC11 Slurry & Mechanical Eng'),('TechnicalCommunity','TC12 Construction Support & Management'),
 ('TechnicalCommunity','TC13 Governance & Risks'),('TechnicalCommunity','TC14 Seismic Hazard'),('TechnicalCommunity','TC15 Engineer of Record'),
 ('TechnicalCommunity','TC16 Ground Engineering'),('TechnicalCommunity','TC17 Numerical Modelling'),('TechnicalCommunity','TC18 Closure and Rehabilitation'),
 ('TechnicalCommunity','TC19 CAD'),('TechnicalCommunity','TC20 Project Management'),('TechnicalCommunity','TC21 Geosynthetics'),
 ('CostCentre','Queensland'),('CostCentre','Victoria'),('CostCentre','Western Australia'),('CostCentre','Sunshine Coast'),
 ('CostCentre','New South Wales'),('CostCentre','Tasmania'),('CostCentre','Peru'),
 ('OfficeForSubmission','Victoria'),('OfficeForSubmission','Queensland'),('OfficeForSubmission','Western Australia'),('OfficeForSubmission','Sunshine Coast'),
 ('OfficeForSubmission','New South Wales'),('OfficeForSubmission','Tasmania'),('OfficeForSubmission','Peru'),
 ('Salutation','Mr'),('Salutation','Ms'),('Salutation','Mrs'),('Salutation','Miss'),('Salutation','Dr.'),('Salutation','Prof.'),
 ('Salutation','Councillor'),('Salutation','Mr & Mrs');

INSERT dbo.Lookups (Category, Value, SortOrder)
SELECT 'RateGroup', v, ROW_NUMBER() OVER (ORDER BY v) FROM (VALUES
 ('Current Rate'),('ATCW 2026 Rate'),('ATCW 2025 Rate'),('Last Year Rate'),('New Rate'),
 ('2026 International Rates – AUD'),('2026 International Rates – USD'),('ATCW International Rates – AUD'),('ATCW International Rates – USD'),
 ('Local Buy'),('Local Buy 2025'),('Local Buy 2026'),('Laboratory Rates'),('Non Invoiceable'),
 ('Glencore GCAA'),('Glencore GCAA UA'),('Glencore GCAA UA 2024'),('Yancoal'),('Yancoal MSA'),('MMG MSA'),('MMG MSA CW2246098'),
 ('MMG Master Services Rate'),('MMG (Rosebery-107031) 2019-2021'),('MMG (Las Bambas 114001) 2018'),('Las Bambas'),('Las Bambas 2024'),
 ('Iluka FSA C6683'),('HEC 2021-2022'),('HEC Rates'),('BHP Engineer of Record'),('BHP MAC EoR'),('BHP MAC EoR 2024'),('RTCA'),
 ('K92'),('K92 Rate'),('K92 2025'),('Newcrest (115293)'),('Newmont'),('Newmont 2022 Contract Rates'),('Newmont 2023 Contract Rate'),
 ('Newmont 2024'),('Newmont (97049) 2018'),('MACH Energy'),('MACH Energy - Mt Pleasant Ops'),('MACH Energy - Mt Pleasant Ops (June 2024-2025)'),
 ('QCoal'),('Cleanaway MCA'),('SIMEC'),('Evolution'),('Evolution EOR Contract MRO005'),('Bloomfield Group 2025'),
 ('Antapaccay USD (Job No. 250877)'),('NQM Gold Pajingo PJO-0051'),('Peabody Wambo Coal'),('Peabody Wambo Coal (2024-2025)'),
 ('Sunrise Rate(98322)'),('Century Mine – MSA (CML-2025-150)'),('PRNC C3908'),('AngloAmerican MSA'),('Ti Tree Cell 8 CQA (240466 ONLY)')
) x(v);
GO
