// Constants carried over from the Power Apps App.Formulas.

export const APP_VERSION = 'Version 3.0 Build 1';

export const SHAREPOINT_SITE = 'https://atcw1.sharepoint.com/sites/qms';

export const PROCEDURES = {
  PR01: { path: '/Shared Documents/Procedures/SY-QS-PR-01 Project Management Workbook-Rev 9.pdf', name: 'SY-QS-PR-01 Project Initiation Procedure' },
  PR02: { path: '/Shared Documents/Procedures/SY-QS-PR-02-Proposal and Project Risk Review-Rev 6.pdf', name: 'SY-QS-PR-02 Proposal and Project Risk Review Procedure' },
  PR03: { path: '/Shared Documents/Procedures/SY-QS-PR-03 Review & Design Verification-Rev 7.pdf', name: 'SY-QS-PR-03 Review & Design Verification' },
  PR04: { path: '/Shared Documents/Procedures/SY-QS-PR-04 Doc Control-Rev 5.pdf', name: 'SY-QS-PR-04 Document Control & File Management Procedure' },
  PR05: { path: '/Shared Documents/Procedures/SY-QS-PR-05 Comm & Change Management Proc Rev 6.pdf', name: 'SY-QS-PR-05 Project Communications and Change Management Procedure' },
  MIN: { path: '/Shared Documents/Minimum Workbook Completion Requirements Rev1.pdf', name: 'Minimum Workbook Completion Requirements Rev1' },
};

export const procedureUrl = (key) => encodeURI(SHAREPOINT_SITE + PROCEDURES[key].path);

export const CLIENT_FEEDBACK_URL =
  'https://apps.powerapps.com/play/e/55fd9e0e-02a4-e1bb-8654-9bf6a20b0dc6/a/6b2f4eb8-2b04-4d8d-9bf5-1ce1b4b3e44b?tenantId=61445561-b527-41ee-a2cf-45e5d5f63ebe&hint=85e72c51-848f-4ae5-8692-4793180276ec&sourcetime=1707433511856';

export const SEARCH_OPTIONS = [
  'Client Name', 'Project Directors', 'Project Manager', 'Project Name', 'Project Number', 'Project Reviewers',
  'Project Type/ Practice Discipline', 'Proposal Reviewers', 'Scope of Work', 'Site Name', 'Sub Project Manager',
  'Sub-Project Name', 'Sub-Project Number', 'Waiting For Admin Approval',
];
export const TEXT_SEARCH = ['Project Number', 'Sub-Project Number', 'Project Name', 'Sub-Project Name', 'Site Name', 'Scope of Work'];
export const PERSON_SEARCH = ['Project Manager', 'Sub Project Manager', 'Proposal Reviewers', 'Project Reviewers', 'Project Directors'];

export const YEARS_CLOSED = ['2021', '2022', '2023', '2024', '2025', '2026'];
