import { h, icon, clear, modal, toast } from './ui.js';
import { APP_VERSION } from './config.js';
import { renderHome } from './home.js';
import { renderDashboard } from './dashboard.js';
import { renderNewJob } from './newjob.js';
import { renderFormView } from './formview.js';
import { renderAdmin, renderAdminSystem, renderRegister, renderForms, renderFormRegister, renderResponsibility } from './admin.js';

const header = document.getElementById('appHeader');
const main = document.getElementById('app');

const logo = () => h('a', { class: 'logo', href: '#/', 'aria-label': 'QMS home' }, h('img', { src: 'img/atcw-logo.png', alt: 'ATC Williams' }));

/** Header variants: the home screen's red title bar, the admin bar, or the purple workbook bar with a back arrow and job label. */
export function setHeader({ kind = 'home', title, job, back = '#/', me, pending = 0 } = {}) {
  clear(header);
  header.className = `app-header ${kind === 'admin' ? 'admin' : ''}`;
  if (kind === 'admin') { adminHeader(me ?? {}, pending); return; }
  if (kind === 'home') {
    header.append(
      logo(),
      h('div', { class: 'title red' }, 'Quality Management System'),
      h('button', { class: 'version', type: 'button', onclick: showReleaseNotes, title: 'Release notes' },
        APP_VERSION.replace(' Build', '\nBuild').split('\n').map((t, i) => [i ? h('br') : null, t])));
    return;
  }
  header.append(
    h('button', { class: 'back', type: 'button', 'aria-label': 'Back', onclick: () => { location.hash = back; } }, icon('back')),
    logo(),
    h('div', { class: 'title purple' }, title));
  if (job) header.append(h('div', { class: 'job-band' }, h('span', {}, jobLine1(job)), h('span', {}, jobLine2(job))));
}

// "{ProjectNumber} - {ProjectName}" / "{SubProjectNumber:00} - {SubProjectName}"; numbers omitted while unassigned (<= 0).
export const jobLine1 = (p) => `${p.projectNumber > 0 ? `${p.projectNumber} - ` : ''}${p.projectName ?? ''}`;
export const jobLine2 = (p) => `${p.subProjectNumber > 0 && !p.v5 ? `${String(p.subProjectNumber).padStart(2, '0')} - ` : ''}${p.subProjectName ?? ''}`;

// Admin header: logo, a bell with the number of jobs waiting for approval, and the signed-in user's menu.
function adminHeader(me, pending) {
  const initials = (me.displayName ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const menu = h('div', { class: 'ad-menu hidden', role: 'menu' },
    h('div', { class: 'ad-menu-head' }, h('span', { class: 'ad-avatar light' }, initials),
      h('div', {}, h('strong', {}, me.displayName ?? ''), h('span', {}, me.isSystemManager ? 'Administrator' : 'QMS user'))),
    h('div', { class: 'ad-menu-row' }, h('span', { class: 'ad-menu-label' }, 'Email'), h('span', {}, me.email ?? '')),
    me.roles?.length ? h('div', { class: 'ad-menu-row' }, h('span', { class: 'ad-menu-label' }, 'Roles'), h('span', {}, me.roles.join(', '))) : null,
    h('a', { class: 'ad-menu-item', href: '/.auth/logout', role: 'menuitem' }, 'Sign out'));
  const avatarBtn = h('button', { class: 'ad-avatar', type: 'button', 'aria-label': 'Account', 'aria-haspopup': 'menu',
    onclick: (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); } }, initials);
  header.append(
    h('a', { class: 'logo', href: '#/', 'aria-label': 'QMS home' }, h('img', { src: 'img/atcw-logo.png', alt: 'ATC Williams' })),
    h('div', { class: 'ad-header-right' },
      h('a', { class: 'ad-bell', href: '#/?search=pending', title: `${pending} jobs waiting for approval`, 'aria-label': `${pending} jobs waiting for approval` },
        icon('bell'), pending ? h('span', {}, pending > 99 ? '99+' : pending) : null),
      h('div', { class: 'ad-account' }, avatarBtn, menu)));
}

function showReleaseNotes() {
  modal({
    title: 'Release Notes',
    wide: true,
    content: h('div', { class: 'release' },
      h('h3', {}, `${APP_VERSION} (${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })})`),
      h('strong', { style: { color: 'blue' } }, 'IMPROVEMENTS'),
      h('ul', {},
        h('li', {}, 'QMS rebuilt as a web application (C# Azure Functions + SQL Server), usable on desktop and mobile.'),
        h('li', {}, 'Home page searches now run on the server across every project (no 2,000 row limit).'),
        h('li', {}, 'New Job Request (FM-01A) saves the project and form in a single transaction.')),
      h('strong', { style: { color: 'chocolate' } }, 'FIXES'),
      h('ul', {},
        h('li', {}, 'FM-18 Client Feedback tile now opens FM-18 (previously opened FM-17).'),
        h('li', {}, 'Site Short Name and Seismic Hazard questions are now enforced as mandatory on the New Job Request.'))),
    actions: [{ label: 'Close', onClick: c => c() }],
  });
}

function placeholder(name) {
  setHeader({ kind: 'form', title: name });
  main.append(h('div', { class: 'page' },
    h('div', { class: 'form-banner' }, `${name} has not been migrated to the web app yet. It is available in the Power Apps QMS in the meantime.`),
    h('a', { class: 'btn', href: '#/' }, 'Back to home')));
}

const routes = [
  [/^#?\/?(\?.*)?$/, () => renderHome(main)],
  [/^#\/new-job$/, () => renderNewJob(main, {})],
  [/^#\/project\/(\d+)$/, (m) => renderDashboard(main, +m[1])],
  [/^#\/project\/(\d+)\/fm01a$/, (m) => renderNewJob(main, { masterId: +m[1] })],
  [/^#\/project\/(\d+)\/form\/(FM\d{2}[AB]?)$/, (m) => renderFormView(main, +m[1], m[2])],
  [/^#\/admin$/, () => renderAdmin(main)],
  [/^#\/admin\/(master|clients|contacts|sites)$/, (m) => renderRegister(main, m[1])],
  [/^#\/admin\/forms$/, () => renderForms(main)],
  [/^#\/admin\/forms\/(FM\d{2}[AB]?)$/, (m) => renderFormRegister(main, m[1])],
  [/^#\/admin\/responsibility$/, () => renderResponsibility(main)],
  [/^#\/admin\/system$/, () => renderAdminSystem(main)],
  [/^#\/tools\/(health|audit|metrics|settings)$/, (m) => placeholder({
    health: 'Project Health Check', audit: 'QMS Audit', metrics: 'Check Metrics', settings: 'QMS Groups' }[m[1]])],
];

async function route() {
  clear(main);
  window.scrollTo(0, 0);
  const hash = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); }
      catch (e) { console.error(e); toast(e.message || 'Something went wrong', 'error'); }
      return;
    }
  }
  location.hash = '#/';
}

// Close the admin account menu on any outside click.
document.addEventListener('click', (e) => {
  const menu = header.querySelector('.ad-menu');
  if (menu && !menu.parentElement.contains(e.target)) menu.classList.add('hidden');
});

window.addEventListener('hashchange', route);
route();
