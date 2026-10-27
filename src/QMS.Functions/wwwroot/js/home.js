// Home screen (Power Apps ScreenMainGallery): filters, job gallery and the Summary / Workbook Form Status panel.
import { h, icon, clear, combo, toast } from './ui.js';
import { api } from './api.js';
import { setHeader } from './app.js';
import { SEARCH_OPTIONS, TEXT_SEARCH, PERSON_SEARCH, YEARS_CLOSED, CLIENT_FEEDBACK_URL, procedureUrl } from './config.js';
import { formHref } from './dashboard.js';

// Kept across navigation so returning from a dashboard restores the list, like the Power Apps context variables.
const state = {
  status: 'Open', year: '', office: '', searchBy: 'Project Number', q: '', person: null, clientId: null,
  reviewer: 'Lead Reviewer', sortNum: 'asc', sortSub: 'asc', selectedId: null,
};
const PAGE_SIZE = 100;

export async function renderHome(main) {
  setHeader({ kind: 'home' });
  const me = await api.me().catch(() => ({}));

  let items = [], total = 0, page = 0, loadingPage = false, requestSeq = 0;

  // ---------------------------------------------------------------- filter controls
  const statusSel = h('select', { class: 'field-input w100', 'aria-label': 'Project status' },
    ['Open', 'Closed'].map(s => h('option', { value: s, selected: s === state.status }, s)));
  const yearSel = h('select', { class: 'field-input w160', 'aria-label': 'Year closed' },
    h('option', { value: '' }, 'Year Closed ?'), YEARS_CLOSED.map(y => h('option', { value: y, selected: y === state.year }, y)));
  const officeSel = h('select', { class: 'field-input w160', 'aria-label': 'State' }, h('option', { value: '' }, 'State'));
  const searchSel = h('select', { class: 'field-input w230', 'aria-label': 'Search by' },
    SEARCH_OPTIONS.map(o => h('option', { value: o, selected: o === state.searchBy }, o)));
  const reviewerSel = h('select', { class: 'field-input w200', 'aria-label': 'Reviewer slot' },
    ['Lead Reviewer', 'Additional Reviewer 1', 'Additional Reviewer 2'].map(r => h('option', { value: r, selected: r === state.reviewer }, r)));
  const personCombo = combo({ placeholder: 'Search', onChange: v => { state.person = v; reload(); } });
  personCombo.el.classList.add('grow');
  const clientCombo = combo({ label: c => c.name, placeholder: 'Search by Client Name', onChange: v => { state.clientId = v?.id ?? null; reload(); } });
  clientCombo.el.classList.add('grow');
  const textInput = h('input', { class: 'field-input', type: 'search', value: state.q, 'aria-label': 'Search text' });
  const textWrap = h('div', { class: 'search-wrap grow' }, icon('search'), textInput);
  const reloadBtn = h('button', { class: 'icon-btn primary', type: 'button', title: 'Reload', 'aria-label': 'Reload', onclick: () => { loadOffices(); reload(); } }, icon('reload'));

  const navBtn = (iconName, title, hash, enabled, primary) =>
    h('button', { class: `icon-btn ${primary ? 'primary' : ''}`, type: 'button', title, 'aria-label': title, disabled: !enabled, onclick: () => { location.hash = hash; } }, icon(iconName));

  const filterbar = h('div', { class: 'filterbar' },
    h('div', { class: 'filters' }, statusSel, yearSel, officeSel, searchSel, reviewerSel, personCombo.el, clientCombo.el, textWrap, reloadBtn),
    h('div', { class: 'actions' },
      me.canSettings ? navBtn('settings', 'QMS Groups', '#/tools/settings', true) : null,
      navBtn('medical', 'Project Health Check', '#/tools/health', true),
      navBtn('heart', 'QMS Audit', '#/tools/audit', !!me.canAudit, true),
      navBtn('radar', 'Check Metrics', '#/tools/metrics', !!me.canMetrics, true),
      h('a', { class: 'btn', href: '#/admin', style: { minWidth: '90px' } }, 'Admin'),
      h('a', { class: 'btn', href: '#/new-job', style: { minWidth: '120px' } }, 'New Job')));

  const subbar = h('div', { class: 'subbar' },
    h('a', { class: 'btn small', href: CLIENT_FEEDBACK_URL, target: '_blank', rel: 'noopener' }, 'Client Feedback'),
    h('a', { class: 'btn small', href: procedureUrl('MIN'), target: '_blank', rel: 'noopener' }, 'Minimum Workbook Completion Requirements'));

  // ---------------------------------------------------------------- gallery
  const sortBtn = (key, label) => h('button', { type: 'button', title: `Sort by ${label}`, 'aria-label': `Sort by ${label}`,
    onclick: () => { state[key] = state[key] === 'asc' ? 'desc' : 'asc'; reload(); } }, icon('sort'));
  const list = h('div', { class: 'gallery-list', role: 'list' });
  const countLbl = h('span');
  const sentinel = h('div', { style: { height: '1px' } });
  const gallery = h('section', { class: 'gallery', 'aria-label': 'Projects' },
    h('div', { class: 'gallery-head' },
      h('div', { class: 'center' }, 'Project Number', sortBtn('sortNum', 'Project Number')),
      h('div', {}, 'Project Name/Site Name'),
      h('div', { class: 'center' }, 'Sub Pro Num', sortBtn('sortSub', 'Sub-Project Number')),
      h('div', {}, 'Sub Pro Name/Project Descriptor'),
      h('div', { class: 'center' }, 'Preview')),
    list,
    h('div', { class: 'gallery-footer' }, countLbl));

  const panel = h('section', { class: 'summary-panel', 'aria-label': 'Summary' });

  main.append(h('div', { class: 'home' }, filterbar, subbar, h('div', { class: 'home-body' }, gallery, panel)));

  // ---------------------------------------------------------------- behaviour
  const syncVisibility = () => {
    const opt = state.searchBy;
    yearSel.classList.toggle('hidden', state.status !== 'Closed');
    reviewerSel.classList.toggle('hidden', !['Proposal Reviewers', 'Project Reviewers'].includes(opt));
    personCombo.el.classList.toggle('hidden', !PERSON_SEARCH.includes(opt) && opt !== 'Project Type/ Practice Discipline');
    clientCombo.el.classList.toggle('hidden', opt !== 'Client Name');
    textWrap.classList.toggle('hidden', !TEXT_SEARCH.includes(opt));
    textInput.placeholder = `Search by ${opt}`;
    personCombo.input.placeholder = `Search by ${opt}`;
  };

  const loadOffices = async () => {
    const offices = await api.homeOptions({ kind: 'state', status: state.status }).catch(() => []);
    clear(officeSel).append(h('option', { value: '' }, 'State'), ...offices.map(o => h('option', { value: o, selected: o === state.office }, o)));
  };

  const loadPersonOptions = async () => {
    const opt = state.searchBy;
    if (!PERSON_SEARCH.includes(opt) && opt !== 'Project Type/ Practice Discipline') return;
    personCombo.setItems(await api.homeOptions({ kind: opt, reviewer: state.reviewer }).catch(() => []));
    personCombo.setValue(state.person);
  };

  const loadClients = async () => {
    if (state.searchBy !== 'Client Name') return;
    const clients = await api.homeOptions({ kind: 'clients' }).catch(() => []);
    clientCombo.setItems(clients);
    clientCombo.setValue(clients.find(c => c.id === state.clientId) ?? null);
  };

  const params = () => ({
    status: state.status, year: state.status === 'Closed' ? state.year : '', state: state.office, searchBy: state.searchBy,
    q: TEXT_SEARCH.includes(state.searchBy) ? state.q : '', person: state.person, clientId: state.clientId,
    reviewer: state.reviewer, sortNum: state.sortNum, sortSub: state.sortSub, pageSize: PAGE_SIZE,
  });

  async function reload() {
    page = 0; items = [];
    clear(list).append(h('div', { class: 'gallery-empty' }, 'Loading…'));
    await loadPage();
  }

  async function loadPage() {
    if (loadingPage) return;
    loadingPage = true;
    const seq = ++requestSeq;
    try {
      const res = await api.projects({ ...params(), page });
      if (seq !== requestSeq) return;            // a newer filter change superseded this request
      if (page === 0) clear(list);
      total = res.total;
      items.push(...res.items);
      res.items.forEach(p => list.append(row(p)));
      if (!items.length) list.append(h('div', { class: 'gallery-empty' }, 'No projects match the current filters.'));
      countLbl.textContent = `${items.length.toLocaleString()} of ${total.toLocaleString()} projects`;
      sentinel.remove();
      if (items.length < total) list.append(sentinel);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      if (seq === requestSeq) loadingPage = false;
    }
  }

  new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && items.length < total && !loadingPage) { page++; loadPage(); }
  }, { root: null, rootMargin: '400px' }).observe(sentinel);

  function row(p) {
    const num = p.projectNumber > -1 ? p.projectNumber : '';
    const sub = p.subProjectNumber > -1 && !p.v5 ? String(p.subProjectNumber).padStart(2, '0') : '';
    const el = h('div', {
      class: `gallery-row ${p.id === state.selectedId ? 'selected' : ''}`, role: 'listitem', tabindex: '0',
      title: p.v5 && p.category ? p.category : null, 'data-id': p.id,
      onclick: () => { location.hash = `#/project/${p.id}`; },
      onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/project/${p.id}`; },
    },
      h('div', { class: 'num' }, num || h('span', { style: { color: 'var(--grey-text)', fontSize: '12px' } }, 'To be assigned')),
      h('div', { class: 'pname' }, p.projectName ?? ''),
      h('div', { class: 'sub' }, sub),
      h('div', { class: 'sname' }, p.subProjectName ?? ''),
      h('div', { class: 'preview' }, h('button', {
        class: 'icon-btn', type: 'button', title: 'Preview', 'aria-label': `Preview ${p.projectName ?? ''}`,
        onclick: (e) => { e.stopPropagation(); select(p.id); },
      }, icon('list'))));
    return el;
  }

  async function select(id) {
    state.selectedId = id;
    list.querySelectorAll('.gallery-row').forEach(r => r.classList.toggle('selected', +r.dataset.id === id));
    clear(panel).append(h('div', { class: 'summary-empty' }, 'Loading…'));
    try {
      renderSummary(panel, await api.status(id));
      if (window.matchMedia('(max-width: 1100px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------------------------------------------------------------- events
  statusSel.addEventListener('change', async () => { state.status = statusSel.value; state.year = ''; state.office = ''; yearSel.value = ''; syncVisibility(); await loadOffices(); reload(); });
  yearSel.addEventListener('change', () => { state.year = yearSel.value; reload(); });
  officeSel.addEventListener('change', () => { state.office = officeSel.value; reload(); });
  searchSel.addEventListener('change', () => {
    state.searchBy = searchSel.value; state.q = ''; state.person = null; state.clientId = null;
    textInput.value = ''; personCombo.setValue(null); clientCombo.setValue(null);
    syncVisibility(); loadPersonOptions(); loadClients(); reload();
  });
  reviewerSel.addEventListener('change', () => { state.reviewer = reviewerSel.value; state.person = null; personCombo.setValue(null); loadPersonOptions(); reload(); });
  let debounce;
  textInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { state.q = textInput.value.trim(); reload(); }, 350); });

  // Deep link: #/?preview=<masterId> opens the summary for that project (like the MasterID URL parameter).
  const hashParams = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const previewParam = +hashParams.get('preview');
  if (previewParam) state.selectedId = previewParam;
  // #/?search=pending (the admin bell) lists the jobs waiting for admin approval.
  if (hashParams.get('search') === 'pending') {
    Object.assign(state, { status: 'Open', searchBy: 'Waiting For Admin Approval', q: '', person: null, clientId: null });
    statusSel.value = 'Open'; searchSel.value = state.searchBy;
  }

  syncVisibility();
  renderSummaryEmpty(panel);
  await Promise.all([loadOffices(), loadPersonOptions(), loadClients()]);
  await reload();
  if (state.selectedId) select(state.selectedId);
}

function renderSummaryEmpty(panel) {
  clear(panel).append(h('h2', {}, 'Summary'),
    h('div', { class: 'summary-empty' }, 'Select the preview icon on a project to see its summary and workbook form status.'));
}

// ---------------------------------------------------------------- summary + workbook form status

function renderSummary(panel, data) {
  const p = data.project;
  const cell = (cls, text) => h('div', { class: cls }, text ?? '');
  const num = p.projectNumber > -1 ? p.projectNumber : '';
  const subNum = p.subProjectNumber > -1 ? String(p.subProjectNumber).padStart(2, '0') : '';

  const cardA = h('div', { class: 'card-grid' },
    cell('h span1 m1', 'Pro Num'), cell(`h ${p.v5 ? 'span3' : 'span5'}`, p.v5 ? 'Site Name' : 'Project Name'), p.v5 ? cell('h span2', 'Site Short Name') : null,
    cell('v span1 m1', num), cell(`v ${p.v5 ? 'span3' : 'span5'}`, p.projectName), p.v5 ? cell('v span2', p.siteShortName) : null,

    p.v5 ? null : cell('h span1 m1', 'Sub Pro Num'), cell(`h ${p.v5 ? 'span6' : 'span5'}`, p.v5 ? 'Project Descriptor' : 'Sub Project Name'),
    p.v5 ? null : cell('v span1 m1', subNum), cell(`v ${p.v5 ? 'span6' : 'span5'}`, p.subProjectName),

    cell(`h ${p.isV5Category ? 'span3' : 'span6'}`, 'Client Name'), p.isV5Category ? cell('h span3', 'Project Category') : null,
    cell(`v ${p.isV5Category ? 'span3' : 'span6'}`, p.clientName), p.isV5Category ? cell('v span3', p.category) : null,

    cell(`h ${p.v5 ? 'span3' : 'span2'}`, 'Project Director'), cell(`h ${p.v5 ? 'span3' : 'span2'}`, 'Project Manager'), p.v5 ? null : cell('h span2', 'Sub Project Manager'),
    cell(`v ${p.v5 ? 'span3' : 'span2'}`, p.projectDirector), cell(`v ${p.v5 ? 'span3' : 'span2'}`, p.projectManager), p.v5 ? null : cell('v span2', p.subProjectManager),

    cell('h span3', p.v5 ? 'Project Type' : 'Practise Discipline'), cell('h span3', 'Project Risk Category'),
    cell('v span3', p.projectType), cell('v span3', p.riskCategory),

    cell('h span6', 'Assigned Reviewers'), cell('v span6', p.reviewers));

  let guide = null;
  const infoBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Compliance Score Guide', 'aria-label': 'Compliance Score Guide', style: { width: '24px', height: '24px' },
    onclick: () => { guide.classList.toggle('hidden'); } }, icon('info'));
  const darkText = ['#FFFF00', '#98D046', '#FFA500'].includes(data.score.color);
  guide = h('div', { class: 'popover hidden' }, h('strong', {}, 'Compliance Score Guide'),
    h('table', {}, h('tr', {}, h('th', {}, 'Category'), h('th', {}, 'Score range')),
      [['Excellent', '100%', '#008000', '#fff'], ['Good', '85 – 99%', '#98D046'], ['Fair', '75 – 84%', '#FFFF00'],
       ['Needs Attention', '51 – 74%', '#FFA500'], ['Poor', '26 – 50%', '#FF0000', '#fff'], ['Critical', '≤ 25%', '#8B0000', '#fff']]
        .map(([c, r, bg, fg]) => h('tr', { style: { background: bg, color: fg ?? '#000' } }, h('td', {}, c), h('td', {}, r)))));

  const cardB = h('div', { class: 'status-card' },
    h('div', { class: 'title-row' }, h('span', { class: 't' }, 'Workbook Form Status'), infoBtn,
      h('span', { class: 'score-badge', title: data.score.band, style: { background: data.score.color, color: darkText ? '#000' : '#fff' } },
        `${data.score.percent}% (${data.score.completed}/${data.score.total})`)),
    guide,
    h('div', { class: 'status-head' }, h('div', {}, 'Form'), h('div', {}, 'Commenced'), h('div', {}, 'Submitted'), h('div', {}, 'Completed')),
    data.forms.map(f => statusRow(p.id, f)),
    data.watermarks.closed ? h('div', { class: 'watermark' }, h('span', {}, 'Project Closed')) : null,
    !data.watermarks.closed && data.watermarks.unsuccessful ? h('div', { class: 'watermark' }, h('span', {}, 'Proposal Unsuccessful')) : null,
    !data.watermarks.closed && data.watermarks.declined ? h('div', { class: 'watermark' }, h('span', {}, 'Project Declined')) : null);

  clear(panel).append(h('h2', {}, 'Summary'), cardA, cardB,
    h('div', { style: { marginTop: '10px', textAlign: 'right' } }, h('a', { class: 'btn', href: `#/project/${p.id}` }, 'Open dashboard')));
}

const REQ_TITLES = { M: 'Mandatory', O: 'Optional', N: 'Not Applicable' };

function statusRow(projectId, f) {
  // Only the furthest stage reached shows a tick (Completed beats Submitted beats Commenced).
  const comp = f.enabled && f.completedColumn && f.completed;
  const sub = f.enabled && f.submittedColumn && f.submitted && !comp;
  const comm = f.enabled && f.commencedColumn && f.commenced && !(f.submitted && f.submittedColumn) && !comp;
  const tick = (on, enabledCol) => h('div', { class: `cell ${enabledCol ? '' : 'off'}` }, on ? icon('check') : null);

  return h('div', { class: `status-row ${f.declined ? 'declined' : ''}` },
    h('div', { class: 'form-cell' },
      h('span', { class: 'req-badge', title: REQ_TITLES[f.requirement] }, icon('docOutline'), h('span', {}, f.requirement)),
      h('button', { type: 'button', disabled: !f.enabled, title: f.title, onclick: () => { location.hash = formHref(projectId, f.code); } }, f.name),
      f.enabled ? null : h('img', { class: 'padlock', src: 'img/padlock.png', alt: 'Locked' })),
    tick(comm, f.commencedColumn), tick(sub, f.submittedColumn), tick(comp, f.completedColumn),
    f.enabled ? null : h('div', { class: 'prereq' }, `Prerequisite: ${f.prerequisite}`));
}
