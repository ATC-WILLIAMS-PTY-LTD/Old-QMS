// Read-only view of a workbook form's records (FM-02 .. FM-19) until each form is migrated as an editable screen.
import { h } from './ui.js';
import { api } from './api.js';
import { setHeader } from './app.js';

const FORM_NAMES = {
  FM01B: 'PROJECT INITIATION FORM - PART B', FM02: 'PROPOSAL RISK REVIEW - GO/NO GO', FM03A: 'REVIEWER ALLOCATION - PROPOSAL',
  FM03B: 'REVIEWER ALLOCATION - PROJECT', FM04: 'PROPOSAL REVIEW', FM05: 'PROJECT REVIEW PLAN', FM06: 'PROJECT PLAN',
  FM07: 'SAFETY IN DESIGN', FM08: 'DOCUMENT REGISTER', FM09: 'DRAWINGS & FIGURES REGISTER', FM10: 'COMMUNICATIONS MATRIX',
  FM11: 'CHANGE REQUEST', FM12: 'CHANGE REGISTER', FM13: 'BASIS OF DESIGN', FM14: 'WORK PACKAGE PLAN', FM15: 'CADD REQUEST',
  FM16: 'PROJECT REVIEW', FM17: 'DOCUMENT TRANSMITTAL', FM18: 'CLIENT FEEDBACK', FM19: 'PROJECT CLOSURE',
};

const fmt = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return v.endsWith('T00:00:00') ? d.toLocaleDateString('en-AU') : d.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
  }
  return String(v);
};

export async function renderFormView(main, id, code) {
  const [status, form] = await Promise.all([api.status(id), api.form(id, code)]);
  setHeader({ kind: 'form', title: `SY-QS-FM-${code.slice(2)} ${FORM_NAMES[code] ?? ''}`, job: status.project, back: `#/project/${id}` });

  const page = h('div', { class: 'page' },
    h('div', { class: 'form-banner' }, 'Read-only view of the records migrated from SharePoint. Editing for this form will be added as it is migrated.'));

  const tables = form.tables.filter(t => t.rows.length);
  if (!tables.length) page.append(h('div', { class: 'form-section' }, h('h2', {}, `SY-QS-FM-${code.slice(2)}`),
    h('div', { class: 'status-panel' }, 'This form has not been started for this project.')));

  for (const t of tables) {
    const cols = t.columns.filter(c => t.rows.some(r => fmt(r[c.name]) !== ''));
    const isMain = t.table === code;
    page.append(h('section', { class: 'form-section' },
      h('h2', {}, t.title.replace(/^QMS /, '')),
      isMain && t.rows.length === 1
        ? h('div', { class: 'kv' }, cols.map(c => [h('div', {}, c.label), h('div', {}, fmt(t.rows[0][c.name]))]))
        : h('div', { class: 'viewer-table' }, h('table', { class: 'grid' },
            h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c.label)))),
            h('tbody', {}, t.rows.map(r => h('tr', {}, cols.map(c => h('td', {}, fmt(r[c.name]))))))))));
  }

  main.append(page);
}
