// Admin area: landing page (Data Access / Administration cards), data registers, QMS Forms and Admin Responsibility.
import { h, clear, modal, confirmDialog, alertList, toast, loading, combo, fmtDate, fmtDateTime } from './ui.js';
import { api, ApiError } from './api.js';
import { setHeader } from './app.js';
import { formHref } from './dashboard.js';

// Lucide-style outline icons used on the cards.
const svg = (body, size = 20) => {
  const span = document.createElement('span');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return span.firstElementChild;
};
const I = {
  layers: () => svg('<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
  building: () => svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>'),
  users: () => svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  pin: () => svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
  file: () => svg('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>'),
  lock: () => svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  userCog: () => svg('<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h4"/><circle cx="18" cy="17" r="2.5"/><path d="M18 13v1.5M18 19.5V21M21.5 15l-1.3.75M15.8 18.25l-1.3.75M21.5 19l-1.3-.75M15.8 15.75l-1.3-.75"/>'),
  dashboard: () => svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>', 14),
  bell: () => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', 18),
  x: () => svg('<path d="M18 6 6 18M6 6l12 12"/>', 13),
  plus: () => svg('<path d="M12 5v14M5 12h14"/>', 13),
  pencil: () => svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 11),
};

const DATA_CARDS = [
  { id: 'master', icon: I.layers, title: 'QMS Master', desc: 'View and manage the master register of all QMS opportunities.', items: ['All project records', 'Status and approval tracking', 'Opportunity overview'] },
  { id: 'clients', icon: I.building, title: 'Clients', desc: 'Manage client organisations registered in the QMS.', items: ['Client directory', 'Critical client flags', 'Client search and filter'] },
  { id: 'contacts', icon: I.users, title: 'Client Contacts', desc: 'Manage contacts associated with client organisations.', items: ['Contact directory', 'Link contacts to clients', 'Contact details'] },
  { id: 'sites', icon: I.pin, title: 'QMS Site Names', desc: 'Manage site names and locations used across QMS forms.', items: ['Site name register', 'Site location details', 'Site code management'] },
  { id: 'forms', icon: I.file, title: 'QMS Forms', desc: 'Access all QMS form registers (FM-01 through FM-19).', items: ['All form registers', 'Form status overview', 'Quick navigation to any form'] },
];
const ADMIN_CARDS = [
  { id: 'system', icon: I.lock, title: 'QMS Admin', desc: 'Access the QMS system administration panel.', items: ['System-wide configuration', 'Manage data access and settings', 'Administration tools'] },
  { id: 'responsibility', icon: I.userCog, title: 'Admin Responsibility', desc: 'Manage QMS role assignments and responsibilities.', items: ['View and edit role assignments', 'Filter by role or user', 'Track responsibility ownership'] },
];

// ---------------------------------------------------------------- shared chrome


async function adminHeader() {
  const [me, summary] = await Promise.all([api.me().catch(() => ({})), api.adminSummary().catch(() => ({ pendingApprovals: 0 }))]);
  setHeader({ kind: 'admin', me, pending: summary.pendingApprovals });
  return me;
}

const card = (c) => h('article', { class: 'ad-card' },
  h('div', { class: 'ad-card-head' }, h('div', { class: 'ad-icon' }, c.icon()),
    h('div', {}, h('h3', {}, c.title), h('p', {}, c.desc))),
  h('ul', {}, c.items.map(i => h('li', {}, i))),
  h('a', { class: 'ad-btn block', href: `#/admin/${c.id}` }, 'Open'));

function titleBar(title, ...actions) {
  return h('div', { class: 'ad-bar' }, h('h1', {}, title), h('div', { class: 'ad-bar-actions' }, actions,
    h('a', { class: 'ad-bar-close', href: '#/admin' }, I.x(), 'Close')));
}

const fmtCell = (v, key) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return /T00:00:00$/.test(v) || key === 'created' ? fmtDate(v) : fmtDateTime(v);
  if (typeof v === 'number' && (key === 'projectNumber' || key === 'subProjectNumber') && v <= 0) return 'To be assigned';
  return String(v);
};

// ---------------------------------------------------------------- landing page

export async function renderAdmin(main) {
  await adminHeader();
  main.append(h('div', { class: 'ad-page' },
    h('div', { class: 'ad-title-row' },
      h('div', {},
        h('div', { class: 'ad-title' }, h('span', { class: 'ad-accent' }), h('h1', {}, 'Admin'), h('span', { class: 'ad-pill' }, 'System Administration')),
        h('p', { class: 'ad-sub' }, 'Manage users, settings and reference data for the QMS.')),
      h('a', { class: 'ad-btn', href: '#/' }, I.dashboard(), 'QMS Dashboard')),
    h('h2', { class: 'ad-section' }, 'Data Access'),
    h('div', { class: 'ad-grid' }, DATA_CARDS.map(card)),
    h('h2', { class: 'ad-section' }, 'Administration'),
    h('div', { class: 'ad-grid' }, ADMIN_CARDS.map(card))));
}

export async function renderAdminSystem(main) {
  await adminHeader();
  main.append(h('div', { class: 'ad-page' }, titleBar('QMS Admin'),
    h('div', { class: 'ad-empty' }, h('div', { class: 'ad-empty-icon' }, svg('<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>', 40)),
      h('p', {}, 'This module is available in the full release.'))));
}

// ---------------------------------------------------------------- data registers

export async function renderRegister(main, name) {
  await adminHeader();
  let page = 0, q = '', timer;
  const search = h('input', { class: 'ad-search', type: 'search', placeholder: 'Search…', 'aria-label': 'Search' });
  const titleEl = h('h1', {}, '');
  const bar = h('div', { class: 'ad-bar' }, titleEl, h('div', { class: 'ad-bar-actions' }, search,
    h('a', { class: 'ad-bar-close', href: '#/admin' }, I.x(), 'Close')));
  const tableWrap = h('div', { class: 'ad-table-card' });
  const pager = h('div', { class: 'ad-pager' });
  main.append(h('div', { class: 'ad-page' }, bar, tableWrap, pager));

  const load = async () => {
    try {
      const res = await api.adminRegister(name, { q, page, pageSize: 50 });
      titleEl.textContent = res.title;
      // The ID opens the record popup (view / edit): QMS Master has its own layout, the others the generic one.
      const open = name === 'master' ? (id) => openMasterRecord(id, load) : (id) => openRecord(REGISTER_TABLES[name], id, load);
      const cells = { id: (r) => idLink(r.id, () => open(r.id)) };
      renderTable(tableWrap, res.columns, res.rows, null, cells);
      renderPager(pager, res, (p) => { page = p; load(); });
    } catch (e) { toast(e.message, 'error'); }
  };
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); page = 0; load(); }, 300); });
  await load();
}

// cells: optional { columnKey: (row) => Node } overrides for individual columns.
function renderTable(wrap, columns, rows, onRow, cells = {}) {
  clear(wrap).append(rows.length
    ? h('div', { class: 'ad-scroll' }, h('table', { class: 'ad-table' },
        h('thead', {}, h('tr', {}, columns.map(c => h('th', {}, c.label)))),
        h('tbody', {}, rows.map(r => h('tr', {
          class: onRow ? 'clickable' : null, tabindex: onRow ? '0' : null,
          onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : null,
        }, columns.map(c => h('td', {}, cells[c.key] ? cells[c.key](r) : fmtCell(r[c.key], c.key))))))))
    : h('div', { class: 'ad-none' }, 'No records match.'));
}

const REGISTER_TABLES = { clients: 'Clients', contacts: 'ClientContacts', sites: 'SiteNames' };

const idLink = (id, onClick) => h('button', { class: 'ad-id-link', type: 'button', title: `Open record #${id}`, onclick: onClick }, `#${id}`);

// ---------------------------------------------------------------- generic record popup (Clients, Contacts, Sites, form tables)

async function openRecord(table, id, onSaved) {
  let data;
  try { loading(true); data = await api.adminRecord(table, id); } catch (e) { toast(e.message, 'error'); return; } finally { loading(false); }
  const clients = data.canEdit && data.columns.some(c => c.kind === 'client') ? await api.clients().catch(() => []) : [];

  const body = h('div', { class: 'mr-body' });
  const foot = h('div', { class: 'mr-foot' });
  const m = modal({ title: `${data.title} — Record #${id}`, wide: true, className: 'ad-modal mr-modal', content: [body, foot] });

  const display = (c, rec) => {
    const v = rec[c.name];
    if (v === null || v === undefined || v === '') return '—';
    if (c.kind === 'client') return `${data.clientName ?? 'Unknown client'} (#${v})`;
    if (c.kind === 'bit') return v ? 'Yes' : 'No';
    if (c.kind === 'date') return fmtDate(v);
    if (c.kind === 'datetime') return fmtDateTime(v);
    if (c.name === 'ID_Master' && data.project) return `#${v} — ${data.project.projectNumber > 0 ? data.project.projectNumber + ' ' : ''}${data.project.projectName ?? ''}`;
    return String(v);
  };
  const groups = () => [
    ['Details', data.columns.filter(c => !c.audit)],
    ['Audit', data.columns.filter(c => c.audit)],
  ].filter(([, cols]) => cols.length);

  const header = () => data.project ? h('div', { class: 'mr-project' },
    h('span', {}, 'Project'), h('strong', {}, `${data.project.projectNumber > 0 ? data.project.projectNumber + ' — ' : ''}${data.project.projectName ?? ''}`),
    data.project.subProjectName ? h('em', {}, data.project.subProjectName) : null) : null;

  const viewField = (c) => h('div', { class: `mr-field ${c.kind === 'longtext' ? 'wide' : ''}` }, h('span', {}, c.label), h('strong', {}, display(c, data.record)));

  function renderView() {
    clear(body).append(...[header(), ...groups().map(([title, cols]) => h('section', { class: 'mr-group' }, h('h3', {}, title),
      h('div', { class: 'mr-grid' }, cols.map(viewField))))].filter(Boolean));
    clear(foot).append(
      data.project ? h('a', { class: 'ad-btn ghost', href: formHref(data.project.id, table), onclick: () => m.close() }, 'Open in Workbook') : h('span'),
      h('div', { class: 'mr-actions' },
        data.canEdit && data.columns.some(c => !c.readOnly) ? h('button', { class: 'ad-btn', type: 'button', onclick: renderEdit }, I.pencil(), 'Edit') : null,
        h('button', { class: 'ad-btn ghost', type: 'button', onclick: () => m.close() }, 'Close')));
  }

  function renderEdit() {
    const rec = data.record;
    const getters = {};
    const err = h('div', { class: 'mr-errors hidden', role: 'alert' });

    const control = (c) => {
      const v = rec[c.name];
      let el;
      switch (c.kind) {
        case 'int': el = h('input', { class: 'field-input', type: 'number', step: '1', inputmode: 'numeric', value: v ?? '' }); break;
        case 'decimal': el = h('input', { class: 'field-input', type: 'number', step: 'any', inputmode: 'decimal', value: v ?? '' }); break;
        case 'bit':
          el = h('select', { class: 'field-input' }, [['', '—'], ['true', 'Yes'], ['false', 'No']].map(([val, text]) =>
            h('option', { value: val, selected: (v === null || v === undefined ? '' : String(v)) === val }, text)));
          break;
        case 'date': el = h('input', { class: 'field-input', type: 'date', value: v ? String(v).slice(0, 10) : '' }); break;
        case 'datetime': el = h('input', { class: 'field-input', type: 'datetime-local', value: v ? String(v).slice(0, 16) : '' }); break;
        case 'longtext': el = h('textarea', { class: 'field-input', rows: 3, maxlength: c.maxLength > 0 ? c.maxLength : null }); el.value = v ?? ''; break;
        case 'client': {
          const cb = combo({ items: clients, label: x => x.name, placeholder: 'Search clients' });
          cb.setValue(clients.find(x => x.id === v) ?? (v ? { id: v, name: data.clientName ?? `#${v}` } : null));
          getters[c.name] = () => cb.value?.id ?? null;
          return cb.el;
        }
        default: el = h('input', { class: 'field-input', value: v ?? '', maxlength: c.maxLength > 0 ? c.maxLength : null });
      }
      getters[c.name] = () => el.value === '' ? null : el.value;
      // Short text columns with only a few values in use (Yes/No, statuses) suggest them as you type.
      if (c.options && el.tagName === 'INPUT' && c.kind === 'text') {
        const listId = `opts-${table}-${c.name}`;
        el.setAttribute('list', listId);
        return h('div', {}, el, h('datalist', { id: listId }, c.options.map(o => h('option', { value: o }))));
      }
      return el;
    };

    clear(body).append(...[err, header(), ...groups().map(([title, cols]) => h('section', { class: 'mr-group' }, h('h3', {}, title),
      h('div', { class: 'mr-grid' }, cols.map(c => c.readOnly ? viewField(c)
        : h('div', { class: `field mr-edit ${c.kind === 'longtext' ? 'wide' : ''}` }, h('label', {}, c.label), control(c))))))].filter(Boolean));

    // Normalise stored values the same way as the editors so only real changes are sent.
    const original = (c) => {
      const v = rec[c.name];
      if (v === null || v === undefined || v === '') return '';
      if (c.kind === 'date') return String(v).slice(0, 10);
      if (c.kind === 'datetime') return String(v).slice(0, 16);
      return String(v);
    };

    const save = async () => {
      const values = {};
      for (const c of data.columns) {
        if (c.readOnly || !getters[c.name]) continue;
        const now = getters[c.name]();
        if (String(now ?? '') !== original(c)) values[c.name] = now;
      }
      if (!Object.keys(values).length) { renderView(); return; }
      try {
        loading(true);
        data = await api.updateAdminRecord(table, id, { values, modified: rec.Modified ?? null });
        toast(`Record #${id} updated`);
        renderView();
        onSaved?.();
      } catch (e) {
        clear(err).append(h('strong', {}, 'The record could not be saved:'), h('ul', {}, (e.errors?.length ? e.errors : [e.message]).map(x => h('li', {}, x))));
        err.classList.remove('hidden');
        err.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } finally { loading(false); }
    };

    clear(foot).append(h('span'), h('div', { class: 'mr-actions' },
      h('button', { class: 'ad-btn ghost', type: 'button', onclick: renderView }, 'Cancel'),
      h('button', { class: 'ad-btn', type: 'button', onclick: save }, 'Save')));
  }

  renderView();
}

// ---------------------------------------------------------------- QMS Master record popup

const PROJECT_STATUS = [['0', 'Open'], ['2', 'Open - awaiting approval'], ['1', 'Closed']];

// [column, kind, label] per group. Kinds: ro (read-only), int, text, text6 (max 6), textarea, v5, status,
// office, om (Pending/Approved/Declined), approval (Pending/Approved), date, client, staff.
const MASTER_GROUPS = [
  ['Project', [['ID', 'ro', 'ID'], ['ProjectNumber', 'int', 'Project Number'], ['ProjectName', 'text', 'Project / Site Name'],
    ['SubProjectNumber', 'int', 'Sub-Project Number'], ['SubProjectName', 'text', 'Sub-Project Name / Project Descriptor'],
    ['V5', 'v5', 'V5 workflow'], ['ProjectStatus', 'status', 'Project Status'], ['OfficeForFormSubmission', 'office', 'Office for Form Submission']]],
  ['Client & Managers', [['ID_Client', 'client', 'Client'], ['ProjectManagerName', 'staff', 'Project Manager'],
    ['SubProjectManagerName', 'staff', 'Sub Project Manager']]],
  ['Site', [['SiteName', 'text', 'Site Name'], ['SiteShortName', 'text6', 'Site Short Name']]],
  ['FM-01A Approvals', [['FM01AOMApprovalStatus', 'om', 'OM Approval Status'], ['FM01AOMApprovedBy', 'text', 'OM Approved By'],
    ['FM01AOMApprovedDate', 'date', 'OM Approved Date'], ['FM01AOMRecommendations', 'textarea', 'OM Recommendations'],
    ['FM01AApprovalStatus', 'approval', 'Admin Approval Status'], ['FM01AApprovedBy', 'text', 'Approved By'], ['FM01AApprovedDate', 'date', 'Approved Date']]],
  ['FM-01B Approval', [['FM01BApprovalStatus', 'approval', 'Approval Status'], ['FM01BApprovedBy', 'text', 'Approved By'], ['FM01BApprovedDate', 'date', 'Approved Date']]],
  ['FM-19 Closure', [['FM19ClosedBy', 'text', 'Closed By'], ['FM19ClosedDate', 'date', 'Closed Date']]],
  ['Audit', [['Created', 'ro', 'Created'], ['CreatedBy', 'ro', 'Created By'], ['Modified', 'ro', 'Modified']]],
];

async function openMasterRecord(id, onSaved) {
  let data;
  try { loading(true); data = await api.adminMaster(id); } catch (e) { toast(e.message, 'error'); return; } finally { loading(false); }
  const [staff, clients] = await Promise.all([api.staff().catch(() => []), data.canEdit ? api.clients().catch(() => []) : []]);

  const body = h('div', { class: 'mr-body' });
  const foot = h('div', { class: 'mr-foot' });
  const m = modal({ title: `QMS Master — Record #${id}`, wide: true, className: 'ad-modal mr-modal', content: [body, foot] });

  const display = (col, kind, rec) => {
    const v = rec[col];
    if (kind === 'client') return v ? `${data.clientName ?? 'Unknown client'} (#${v})` : '—';
    if (kind === 'status') return PROJECT_STATUS.find(([k]) => +k === v)?.[1] ?? (v ?? '—');
    if (kind === 'v5') return v === 1 ? 'Yes' : 'No';
    if (kind === 'int') return v > 0 ? String(v) : 'To be assigned';
    if (kind === 'date' || col === 'Created' || col === 'Modified') return v ? fmtDateTime(v) : '—';
    return v === null || v === undefined || v === '' ? '—' : String(v);
  };

  function renderView() {
    const rec = data.record;
    clear(body).append(...MASTER_GROUPS.map(([title, fields]) => h('section', { class: 'mr-group' }, h('h3', {}, title),
      h('div', { class: 'mr-grid' }, fields.map(([col, kind, label]) =>
        h('div', { class: `mr-field ${kind === 'textarea' ? 'wide' : ''}` }, h('span', {}, label), h('strong', {}, display(col, kind, rec))))))));
    clear(foot).append(
      h('a', { class: 'ad-btn ghost', href: `#/project/${id}`, onclick: () => m.close() }, 'Open Dashboard'),
      h('div', { class: 'mr-actions' },
        data.canEdit ? h('button', { class: 'ad-btn', type: 'button', onclick: renderEdit }, I.pencil(), 'Edit') : null,
        h('button', { class: 'ad-btn ghost', type: 'button', onclick: () => m.close() }, 'Close')));
  }

  function renderEdit() {
    const rec = data.record;
    const getters = {};
    const err = h('div', { class: 'mr-errors hidden', role: 'alert' });

    const control = (col, kind) => {
      const v = rec[col];
      const opt = (val, text, cur) => h('option', { value: val, selected: String(cur ?? '') === String(val) }, text);
      const sel = (opts, cur) => h('select', { class: 'field-input' }, opts.map(([val, text]) => opt(val, text, cur)));
      let el;
      switch (kind) {
        case 'int': el = h('input', { class: 'field-input', type: 'number', inputmode: 'numeric', value: v > 0 ? v : '', placeholder: 'To be assigned' }); break;
        case 'text6': el = h('input', { class: 'field-input', maxlength: 6, value: v ?? '' }); break;
        case 'textarea': el = h('textarea', { class: 'field-input', rows: 3, maxlength: 1000 }); el.value = v ?? ''; break;
        case 'v5': el = sel([['1', 'Yes'], ['', 'No']], v === 1 ? '1' : ''); break;
        case 'status': el = sel(PROJECT_STATUS, v ?? 0); break;
        case 'office': el = sel([['', '—'], ...data.offices.map(o => [o, o])], v); break;
        case 'om': el = sel([['', '—'], ['Pending', 'Pending'], ['Approved', 'Approved'], ['Declined', 'Declined']], v); break;
        case 'approval': el = sel([['', '—'], ['Pending', 'Pending'], ['Approved', 'Approved']], v); break;
        case 'date': el = h('input', { class: 'field-input', type: 'datetime-local', value: v ? String(v).slice(0, 16) : '' }); break;
        case 'client': {
          const c = combo({ items: clients, label: x => x.name, placeholder: 'Search clients' });
          c.setValue(clients.find(x => x.id === v) ?? (v ? { id: v, name: data.clientName ?? `#${v}` } : null));
          getters[col] = () => c.value?.id ?? null;
          return c.el;
        }
        case 'staff': {
          const c = combo({ items: staff, label: x => x.name, sub: x => x.email, placeholder: 'Search staff' });
          c.setValue(v ? (staff.find(x => x.name === v) ?? { name: v }) : null);
          getters[col] = () => c.value?.name ?? null;
          return c.el;
        }
        default: el = h('input', { class: 'field-input', value: v ?? '' });
      }
      getters[col] = () => el.value.trim() === '' ? null : el.value.trim();
      return el;
    };

    clear(body).append(err, ...MASTER_GROUPS.map(([title, fields]) => h('section', { class: 'mr-group' }, h('h3', {}, title),
      h('div', { class: 'mr-grid' }, fields.map(([col, kind, label]) => kind === 'ro'
        ? h('div', { class: 'mr-field' }, h('span', {}, label), h('strong', {}, display(col, kind, rec)))
        : h('div', { class: `field mr-edit ${kind === 'textarea' ? 'wide' : ''}` }, h('label', {}, label), control(col, kind)))))));

    // Normalise the stored value the same way as the editor so only real changes are sent.
    const original = (col, kind) => {
      const v = rec[col];
      if (kind === 'int') return v > 0 ? String(v) : null;
      if (kind === 'v5') return v === 1 ? '1' : null;
      if (kind === 'status') return String(v ?? 0);
      if (kind === 'date') return v ? String(v).slice(0, 16) : null;
      if (kind === 'client') return v ?? null;
      return v === '' || v === undefined ? null : v;
    };

    const save = async () => {
      const values = {};
      for (const [, fields] of MASTER_GROUPS) for (const [col, kind] of fields) {
        if (kind === 'ro') continue;
        const now = getters[col]();
        if (String(now ?? '') !== String(original(col, kind) ?? '')) values[col] = now;
      }
      if (!Object.keys(values).length) { renderView(); return; }
      try {
        loading(true);
        data = await api.updateAdminMaster(id, { values, modified: rec.Modified });
        toast(`Record #${id} updated`);
        renderView();
        onSaved?.();
      } catch (e) {
        clear(err).append(h('strong', {}, 'The record could not be saved:'), h('ul', {}, (e.errors?.length ? e.errors : [e.message]).map(x => h('li', {}, x))));
        err.classList.remove('hidden');
        err.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } finally { loading(false); }
    };

    clear(foot).append(
      h('span', { class: 'mr-hint' }, 'Site, manager and client changes are also applied to the FM-01A form.'),
      h('div', { class: 'mr-actions' },
        h('button', { class: 'ad-btn ghost', type: 'button', onclick: renderView }, 'Cancel'),
        h('button', { class: 'ad-btn', type: 'button', onclick: save }, 'Save')));
  }

  renderView();
}

function renderPager(el, res, go) {
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  clear(el).append(
    h('span', {}, `${res.total.toLocaleString()} records`),
    h('div', {},
      h('button', { class: 'ad-btn ghost', type: 'button', disabled: res.page === 0, onclick: () => go(res.page - 1) }, 'Previous'),
      h('span', { class: 'ad-page-no' }, `Page ${res.page + 1} of ${pages}`),
      h('button', { class: 'ad-btn ghost', type: 'button', disabled: res.page + 1 >= pages, onclick: () => go(res.page + 1) }, 'Next')));
}

// ---------------------------------------------------------------- QMS Forms

export async function renderForms(main) {
  await adminHeader();
  const forms = await api.adminForms();
  main.append(h('div', { class: 'ad-page' }, titleBar('QMS Forms'),
    h('div', { class: 'ad-grid forms' }, forms.map(f => h('a', { class: 'ad-card ad-form', href: `#/admin/forms/${f.code}` },
      h('div', { class: 'ad-card-head' }, h('div', { class: 'ad-icon' }, I.file()),
        h('div', {}, h('h3', {}, f.name), h('p', {}, f.title))),
      h('div', { class: 'ad-stats' },
        h('div', {}, h('strong', {}, f.records.toLocaleString()), h('span', {}, 'records')),
        f.projects ? h('div', {}, h('strong', {}, f.projects.toLocaleString()), h('span', {}, 'projects')) : null,
        f.submitted != null ? h('div', {}, h('strong', {}, f.submitted.toLocaleString()), h('span', {}, 'submitted')) : null))))));
}

export async function renderFormRegister(main, code) {
  await adminHeader();
  let page = 0, q = '', timer;
  const search = h('input', { class: 'ad-search', type: 'search', placeholder: 'Search project…', 'aria-label': 'Search' });
  const titleEl = h('h1', {});
  const tableWrap = h('div', { class: 'ad-table-card' });
  const pager = h('div', { class: 'ad-pager' });
  main.append(h('div', { class: 'ad-page' },
    h('div', { class: 'ad-bar' }, titleEl, h('div', { class: 'ad-bar-actions' }, search,
      h('a', { class: 'ad-bar-close', href: '#/admin/forms' }, I.x(), 'Close'))),
    tableWrap, pager));

  const load = async () => {
    try {
      const res = await api.adminFormRegister(code, { q, page });
      titleEl.textContent = `${res.name} ${res.title}`;
      search.classList.toggle('hidden', !res.linked);
      renderTable(tableWrap, res.columns, res.rows, null, { id: (r) => idLink(r.id, () => openRecord(code, r.id, load)) });
      renderPager(pager, res, (p) => { page = p; load(); });
    } catch (e) { toast(e.message, 'error'); }
  };
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); page = 0; load(); }, 300); });
  await load();
}

// ---------------------------------------------------------------- Admin Responsibility

export async function renderResponsibility(main) {
  await adminHeader();
  const [data, staff] = await Promise.all([api.adminResponsibility(), api.staff().catch(() => [])]);
  let items = data.items;
  const filter = { role: 'All', loc: 'All' };

  const roleSel = h('select', { class: 'ad-bar-select', 'aria-label': 'Filter by role' },
    h('option', { value: 'All' }, 'All Roles'), data.roles.map(r => h('option', { value: r }, r)));
  const locSel = h('select', { class: 'ad-bar-select', 'aria-label': 'Filter by location' },
    h('option', { value: 'All' }, 'All Locations'), data.locations.map(l => h('option', { value: l }, l)));
  const userInput = h('input', { class: 'ad-search', type: 'search', placeholder: 'Filter by user…', 'aria-label': 'Filter by user' });
  const newBtn = data.canEdit ? h('button', { class: 'ad-bar-outline', type: 'button', onclick: () => openForm() }, I.plus(), 'New Admin') : null;
  const tableWrap = h('div', { class: 'ad-table-card' });
  const foot = h('div', { class: 'ad-foot' });

  main.append(h('div', { class: 'ad-page' },
    h('div', { class: 'ad-bar' }, h('h1', {}, 'Admin Responsibility'),
      h('div', { class: 'ad-bar-actions' }, newBtn, roleSel, locSel, userInput, h('a', { class: 'ad-bar-close', href: '#/admin' }, I.x(), 'Close'))),
    data.canEdit ? null : h('div', { class: 'ad-note' }, 'View only - role assignments can be changed by System Managers.'),
    tableWrap, foot));

  const render = () => {
    const user = userInput.value.trim().toLowerCase();
    const locs = filter.loc === 'All' ? data.locations : [filter.loc];
    const roles = filter.role === 'All' ? data.roles : [filter.role];
    const visible = items.filter(d => (filter.role === 'All' || d.role === filter.role) && (filter.loc === 'All' || d.location === filter.loc)
      && (!user || d.name.toLowerCase().includes(user) || (d.email ?? '').toLowerCase().includes(user)));
    const rows = user ? roles.filter(r => visible.some(d => d.role === r)) : roles;

    clear(tableWrap).append(h('div', { class: 'ad-scroll' }, h('table', { class: 'ad-table ad-matrix' },
      h('thead', {}, h('tr', {}, h('th', { class: 'sticky' }, 'Admin Role'), locs.map(l => h('th', {}, l)))),
      h('tbody', {}, rows.map(role => h('tr', {},
        h('td', { class: 'sticky role' }, role),
        locs.map(loc => {
          const entries = visible.filter(d => d.role === role && d.location === loc);
          return h('td', {}, entries.length ? entries.map(d => h(data.canEdit ? 'button' : 'span', {
            class: `ad-person ${d.email ? '' : 'unlinked'}`, type: data.canEdit ? 'button' : null,
            title: d.email ? d.email : 'Not linked to a staff e-mail - this assignment cannot take effect at sign-in',
            onclick: data.canEdit ? () => openForm(d) : null,
          }, d.name, data.canEdit ? I.pencil() : null)) : h('span', { class: 'ad-dash' }, '—'));
        })))))));
    foot.textContent = `${visible.length} assignments${data.canEdit ? ' · click any name to edit' : ''}`;
  };

  function openForm(entry) {
    const isNew = !entry;
    const person = combo({ items: staff, label: s => s.name, sub: s => s.email, placeholder: 'Search staff…' });
    if (entry) person.setValue(staff.find(s => s.email === entry.email) ?? { name: entry.name, email: entry.email });
    const loc = h('select', { class: 'field-input' }, data.locations.map(l => h('option', { value: l, selected: l === (entry?.location ?? data.locations[0]) }, l)));
    const role = h('select', { class: 'field-input' }, data.roles.map(r => h('option', { value: r, selected: r === (entry?.role ?? data.roles[0]) }, r)));
    const fld = (label, control) => h('div', { class: 'field' }, h('label', {}, label), control);

    const m = modal({
      title: isNew ? 'New Admin Entry' : 'Edit Admin Entry', className: 'ad-modal',
      content: h('div', { class: 'ad-form-body' }, fld('Name', person.el), fld('Location', loc), fld('Admin Role', role)),
      actions: [
        ...(isNew ? [] : [{ label: 'Delete Entry', class: 'danger-outline', onClick: async (close) => {
          if (!(await confirmDialog('Delete Entry', `Remove ${entry.name} from ${entry.role} (${entry.location})?`, 'Delete', 'Cancel'))) return;
          try { loading(true); await api.deleteResponsibility(entry.id); items = items.filter(x => x.id !== entry.id); close(); render(); toast('Entry deleted'); }
          catch (e) { showErrors(e); } finally { loading(false); }
        } }]),
        { label: 'Cancel', class: 'secondary', onClick: c => c() },
        { label: 'Save', onClick: async (close) => {
          const p = person.value;
          const body = { name: p?.name ?? person.input.value.trim(), email: p?.email ?? null, location: loc.value, role: role.value };
          try {
            loading(true);
            const saved = isNew ? await api.createResponsibility(body) : await api.updateResponsibility(entry.id, body);
            items = isNew ? [...items, saved] : items.map(x => x.id === entry.id ? saved : x);
            close(); render(); toast(isNew ? 'Entry added' : 'Entry updated');
          } catch (e) { showErrors(e); } finally { loading(false); }
        } },
      ],
    });
    return m;
  }

  roleSel.addEventListener('change', () => { filter.role = roleSel.value; render(); });
  locSel.addEventListener('change', () => { filter.loc = locSel.value; render(); });
  userInput.addEventListener('input', render);
  render();
}

function showErrors(e) {
  if (e instanceof ApiError && e.errors.length) alertList('Please correct the following', 'The entry could not be saved:', e.errors);
  else toast(e.message || 'Something went wrong', 'error');
}
