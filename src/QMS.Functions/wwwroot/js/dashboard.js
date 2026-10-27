// Per-job dashboard: ScreenMenu_Standard_EOR_ITRB ("road map", V5 jobs) and ScreenMenu (legacy flow chart).
// Both are laid out on the original 1366 x 718 canvas (below the 50 px header) and scaled to fit; phones get a card list.
import { h, icon, clear } from './ui.js';
import { api } from './api.js';
import { setHeader } from './app.js';
import { procedureUrl, PROCEDURES } from './config.js';

export const formHref = (projectId, code) => code === 'FM01A' ? `#/project/${projectId}/fm01a` : `#/project/${projectId}/form/${code}`;

const W = 1366, H = 718;
const add = (el, ...items) => el.append(...items.flat(Infinity));
const img = (src, x, y, w, hgt) => h('img', { class: 'layer', src: `img/roadmap/${src}`, alt: '', style: pos(x, y, w, hgt) });
const pos = (x, y, w, hgt) => ({ left: `${x}px`, top: `${y}px`, width: w ? `${w}px` : null, height: hgt ? `${hgt}px` : null });
const lbl = (text, x, y, w, cls = '', extra = {}) => h('div', { class: `lbl ${cls}`, style: { ...pos(x, y, w), ...extra } }, text);
const pin = (text, cx, cy) => {
  const lines = text.split('\n').length;
  return lbl(text, cx - 32, cy - lines * 5.5, 64, '', { fontSize: '9.5px', lineHeight: '11px' });
};
const proc = (key, text, x, y, w = 125, hgt = 30) => h('a', {
  class: 'proc', href: procedureUrl(key), target: '_blank', rel: 'noopener', title: `Open PDF ${PROCEDURES[key].name}`,
  style: { ...pos(x, y, w, hgt), display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', textAlign: 'center' },
}, text);

export async function renderDashboard(main, id) {
  const data = await api.status(id);
  const p = data.project;
  setHeader({ kind: 'dash', title: 'Project Delivery Workbook - Dashboard', job: p, back: '#/' });

  const forms = Object.fromEntries(data.forms.map(f => [f.code, f]));
  const stage = h('div', { class: 'stage' });
  const wrap = h('div', { class: 'stage-wrap' }, stage);
  (data.dashboard.variant === 'v5' ? buildRoadMap : buildLegacy)(stage, forms, id, data);

  main.append(h('div', { class: 'dash' }, wrap, mobileList(forms, id, data)));

  const fit = () => {
    const s = Math.min(1.25, wrap.clientWidth / W);
    stage.style.transform = `scale(${s})`;
    stage.style.left = `${Math.max(0, (wrap.clientWidth - W * s) / 2)}px`;
    wrap.style.height = `${H * s}px`;
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  window.addEventListener('hashchange', () => ro.disconnect(), { once: true });
}

// ---------------------------------------------------------------- tile states

function tileState(f) {
  if (!f.enabled) return { locked: true };
  if (f.completed) return { icon: 'checkBadge', label: 'Completed' };
  if (f.submitted) return { icon: 'doc', label: 'Submitted' };
  if (f.commenced) return { icon: 'save', label: 'Commenced' };
  return {};
}

function tileTitle(f, s) {
  if (s.locked) return f.code === 'FM18' ? 'Not Applicable at this stage' : f.requirement === 'N' ? 'Not Applicable' : `Locked to view - Prerequisite: ${f.prerequisite}`;
  return `Navigate to ${f.name}${s.label ? ` (${s.label})` : ''}`;
}

const REQ = { M: 'Mandatory', O: 'Optional', N: 'Not Applicable' };

function v5Tile(f, projectId, text, x, y, w = 101, hgt = 110) {
  const s = tileState(f);
  return h('button', {
    class: 'tile', type: 'button', disabled: s.locked, title: tileTitle(f, s), style: pos(x, y, w, hgt),
    onclick: () => { location.hash = formHref(projectId, f.code); },
  },
    h('span', { class: 'name' }, text),
    h('span', { class: 'req', title: REQ[f.requirement] }, f.requirement),
    s.icon ? h('span', { class: 'state', title: s.label }, icon(s.icon)) : null,
    s.locked ? h('span', { class: 'lock' }, f.requirement === 'N' ? 'Not\nApplicable' : 'Locked') : null);
}

// ---------------------------------------------------------------- V5 road map

function buildRoadMap(stage, forms, id, data) {
  const t = (code, text, x, y, w, hgt) => v5Tile(forms[code], id, text, x, y, w, hgt);
  const green = (x, y) => img('circle-green.png', x, y, 108, 123);
  const orange = (x, y) => img('circle-orange.png', x, y, 108, 123);
  const yellow = (x) => img('circle-yellow.png', x, 557, 108, 123);

  add(stage,
    // artwork layers, bottom to top
    img('bg-proposal.png', 0, 0, 1366, 258), img('bg-project.png', 0, 258, 1366, 460),
    img('road6.png', 941, 337, 228, 126), img('road7.png', 672, 355, 352, 146), img('road4.png', 833, 65, 433, 151),
    img('car.svg', 173, 87, 84, 70), img('right-direction.png', 116, 114, 64, 64), img('client-request.svg', 50, 114, 67, 64),
    img('road8.png', 429, 245, 347, 148), img('road5.png', 1087, 196, 153, 220), img('road2.png', 421, 98, 359, 106),
    img('road3.png', 420, 145, 753, 141), img('road1.png', 287, 116, 234, 154), img('road9.png', 177, 374, 360, 133),
    green(264, 83), img('cycle-blue1.png', 692, 24, 199, 168), green(625, 83), green(458, 112), green(871, 76),
    img('phase-down.png', 1037, 103, 75, 135), green(1116, 122),
    orange(1080, 285), orange(917, 313), orange(799, 385), orange(673, 293), orange(195, 317), orange(409, 311),
    img('phase-up.png', 1028, 323, 75, 120), img('phase-up.png', 557, 185, 75, 135), img('phase-up.png', 998, 5, 75, 135),
    img('phase-up.png', 303, 327, 75, 135), img('phase-down.png', 777, 225, 75, 135),
    img('ongoing-action.png', 365, 263, 191, 238), img('cycle-blue2.png', 500, 324, 178, 158),
    img('individual-task.svg', 1196, 371, 70, 87), img('ongoing-tasks.svg', 1266, 555, 75, 87),
    img('client-satisfaction.svg', 50, 355, 67, 64), img('left-direction.png', 116, 355, 64, 64), img('flag.svg', 119, 428, 67, 89),
    [46, 166, 297, 422, 539, 655, 775, 895, 1015, 1132].map(yellow),

    // text
    h('div', { class: 'phase-title', style: pos(1294, 53, 46, 184) }, 'Proposal Phase'),
    h('div', { class: 'phase-title', style: pos(1294, 332, 46, 184) }, 'Project Phase'),
    lbl('Inputs & References', 713, 0, 178, 'italic'), lbl('Inputs & References', 510, 477, 178, 'italic'),
    lbl('- Latest Relevant Codes/Guidelines\n- ATCW Technical & Design Guidelines\n- ATCW Standards & Guidelines: IL-TR-GD-01\n- ATCW Templates for Documents & Figures', 731, 49, 128, '', { fontSize: '10px' }),
    lbl('- Latest Relevant Codes/Guidelines\n- ATCW Technical & Design Guidelines\n- ATCW Standards & Guidelines: IL-TR-GD-01\n- ATCW Templates for Documents & Figures', 529, 341, 128, '', { fontSize: '10px' }),
    // step names centred on the red road-side pins
    pin('Proposal\nto Client', 1036, 34), pin('Proposal\nAcceptance', 1075, 205), pin('Review\nPlan\nImplem', 1063, 346),
    pin('Proposal\nPreparation', 814, 324), pin('Project\nExecution', 595, 216), pin('Send\nDeliverables\nto Client', 341, 359),
    lbl('Client\nSatisfaction', 37, 423, 92), lbl('Client Request\nfor Proposal', 27, 186, 112),
    lbl('Individual Tasks', 1174, 452, 120, 'italic bold'), lbl('Ongoing Tasks', 1237, 645, 120, 'italic bold'),
    lbl('Client Feedback', 36, 527, 113, 'italic'), lbl('Document Transmittal', 160, 527, 120, 'italic'), lbl('CADD Request', 299, 527, 113, 'italic'),
    lbl('Work Package', 419, 527, 113, 'italic'), lbl('Basis of Design', 539, 527, 113, 'italic'),
    lbl('Project Communications and Change Management', 673, 527, 295, 'italic'),
    lbl('Document Control (Populated from FM-16)', 1009, 527, 263, 'italic', { textAlign: 'left' }),
    h('div', { class: 'legend', style: pos(4, 7, 140) }, 'N: Not Applicable\nM: Mandatory\nO: Optional'),
    trafficLight(data.dashboard, 1123, 5),

    // procedure buttons
    proc('PR01', 'Project Mgmt Workbook\nProc SY-QS-PR-01', 259, 78), proc('PR01', 'Project Mgmt Workbook\nProc SY-QS-PR-01', 660, 291),
    proc('PR01', 'Project Mgmt Workbook\nProc SY-QS-PR-01', 186, 314), proc('PR01', 'Project Mgmt Workbook\nProc SY-QS-PR-01', 1107, 119),
    proc('PR02', 'Proposal & Project Risk\nProc SY-QS-PR-02', 450, 105),
    [[609, 78], [861, 72], [1077, 280], [914, 309], [789, 381], [395, 305]].map(([x, y]) => proc('PR03', 'Proposal & Proj Review\nProc SY-QS-PR-03', x, y)),
    [36, 167, 299, 419, 539].map(x => proc('PR01', 'Project Mgmt Workbook\nProc SY-QS-PR-01', x, 559, 113, 25)),
    [658, 776, 895].map(x => proc('PR05', 'Comm & Change Mgmt\nProc SY-QS-PR-05', x, 559, 113, 25)),
    [1014, 1133].map(x => proc('PR04', 'Document Control\nProc SY-QS-PR-04', x, 559, 113, 25)),

    // form tiles
    t('FM01A', 'FM-01A\nOpportunity\nInitiation', 267, 113), t('FM02', 'FM-02\nGo/No Go\nAssessment', 462, 142),
    t('FM03A', 'FM-03A\nProposal Reviewer Allocation', 628, 118), t('FM04', 'FM-04\nProposal\nReview', 874, 106),
    t('FM01B', 'FM-01B\nProject\nInitiation\nPart B', 1120, 156),
    t('FM03B', 'FM-03B\nProject Reviewer Allocation', 1083, 317), t('FM05', 'FM-05\nProject\nReview Plan', 920, 345),
    t('FM06', 'FM-06\nProject Plan', 802, 418), t('FM07', 'FM-07\nSafety In\nDesign', 677, 327),
    t('FM16', 'FM-16\nProject\nReview', 412, 345, 105), t('FM19', 'FM-19\nProject\nClosure', 198, 350, 101, 118),
    t('FM18', 'FM-18\nClient\nFeedback', 48, 588), t('FM17', 'FM-17\nDocument\nTransmittal', 170, 588),
    t('FM15', 'FM-15\nCADD\nRequest', 301, 588), t('FM14', 'FM-14\nWork\nPackage Plan', 426, 588),
    t('FM13', 'FM-13\nBasis Of\nDesign', 542, 588), t('FM12', 'FM-12\nChange\nRegister', 659, 588),
    t('FM11', 'FM-11\nChange\nRequest', 779, 588), t('FM10', 'FM-10\nCommunications\nMatrix', 899, 588),
    t('FM09', 'FM-09\nDrawings & Figures\nRegister', 1020, 590), t('FM08', 'FM-08\nDocument Register', 1136, 588));
}

function trafficLight(dash, x, y) {
  const lamp = (color, cy, on) => `<circle cx="60" cy="${cy}" r="13" fill="${on ? color : '#A9A9A9'}" ${on ? `filter="url(#glow)"` : ''}/>`;
  const el = h('div', { style: pos(x, y, 120, 115), title: dash.trafficLightTooltip, role: 'img', 'aria-label': `Project health: ${dash.trafficLight}. ${dash.trafficLightTooltip}` });
  el.innerHTML = `<svg viewBox="0 0 120 115" width="120" height="115">
    <defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d="M30 18h12M30 48h12M30 78h12M78 18h12M78 48h12M78 78h12" stroke="#2F3744" stroke-width="7" stroke-linecap="round"/>
    <rect x="42" y="2" width="36" height="96" rx="8" fill="#464F5D"/>
    <rect x="56" y="98" width="8" height="17" fill="#2F3744"/>
    ${lamp('#FF2B2B', 20, dash.trafficLight === 'red')}${lamp('#FFC400', 50, dash.trafficLight === 'yellow')}${lamp('#33CC33', 80, dash.trafficLight === 'green')}
  </svg>`;
  return el;
}

// ---------------------------------------------------------------- legacy flow chart (ScreenMenu)

const C = { proposal: '#7FB239', project: '#FFAA00', ongoing: '#FA05B4', procG: '#36B04B', procO: '#FF8800', procR: '#FF0000',
            stepG: '#638B2C', stepO: '#DD4F0E', blue: '#0079BB', red: '#FF0000' };

function legacyTile(f, projectId, text, color, x, y) {
  const s = tileState(f);
  return h('button', { class: 'lg-tile', type: 'button', disabled: s.locked, title: tileTitle(f, s), style: { ...pos(x, y, 101, 100), background: color },
    onclick: () => { location.hash = formHref(projectId, f.code); } },
    h('span', { class: 'name' }, text),
    h('span', { class: 'req', title: REQ[f.requirement] }, f.requirement),
    s.icon ? h('span', { class: 'state', title: s.label }, icon(s.icon === 'checkBadge' ? 'check' : s.icon)) : null,
    s.locked ? h('span', { class: 'lock' }, 'Locked') : null);
}

const box = (text, color, x, y, w, hgt) => h('div', { class: 'lg-box', style: { ...pos(x, y, w, hgt), background: color } }, text);
const lproc = (key, text, color, x, y, w = 100, hgt = 72) => h('a', {
  class: 'lg-box lg-proc', href: procedureUrl(key), target: '_blank', rel: 'noopener', title: `Open PDF ${PROCEDURES[key].name}`,
  style: { ...pos(x, y, w, hgt), background: color, textDecoration: 'none' } }, text);
const bar = (x, y, w, hgt, color = C.red) => h('div', { style: { ...pos(x, y, w, hgt), background: color } });
const frame = (title, color, x, y, w, hgt) => [
  h('div', { class: 'lg-frame', style: { ...pos(x, y, w, hgt), borderColor: color } }),
  h('div', { class: 'lg-frame-head', style: { ...pos(x, y, w, 40), background: color } }, title)];

function arrow(dir, color, x, y) {
  const rot = { down: 0, right: 270, left: 90 }[dir];
  const el = h('div', { class: 'arrow', style: { ...pos(x, y, 30, 30), transform: `rotate(${rot}deg)` } });
  el.innerHTML = `<svg viewBox="0 0 50 50" width="30" height="30"><path d="M25 49L1 1L49 1L25 49Z" fill="${color}"/></svg>`;
  return el;
}

function buildLegacy(stage, forms, id) {
  const t = (code, text, color, x, y) => legacyTile(forms[code], id, text, color, x, y);
  const g = (x) => arrow('right', '#008000', x, 66), yv = (x) => arrow('right', '#FFBF00', x, 595);
  const redFrame = 'rgba(255,0,0,.6)', blueFrame = 'rgba(0,121,187,.6)';

  add(stage,
    // proposal phase (top row)
    box('To Synergy', C.blue, 111, 15, 100, 30), arrow('left', '#0000FF', 214, 16),
    box('CLIENT REQUEST', C.stepG, 5, 55, 208, 50), g(221),
    lproc('PR01', 'PROJECT INITIATION:\nPROCEDURE\nSY-QS-PR-01', C.procG, 251, 8), t('FM01A', 'Initiation\nSY-QS-FM-01A', C.proposal, 251, 86), g(356),
    lproc('PR02', 'PROPOSAL RISK REVIEW: PROCEDURE SY-QS-PR-02', C.procG, 386, 8), t('FM02', 'Risk Review\n"Go/No Go"\nSY-QS-FM-02', C.proposal, 386, 86), g(491),
    lproc('PR03', 'PROPOSAL REVIEW:\nPROCEDURE\nSY-QS-PR-03', C.procG, 526, 8), t('FM03A', 'Reviewer Allocation - Proposal\nSY-QS-FM-03A', C.proposal, 526, 86), g(631),
    box('Collate resources & inputs for proposal (incl. pricing from internal & external resources)', C.stepG, 666, 8, 90, 178), g(761),
    box('Preparation of Proposal', C.stepG, 796, 56, 90, 80), g(891),
    lproc('PR03', 'PROPOSAL REVIEW:\nPROCEDURE\nSY-QS-PR-03', C.procG, 926, 8), t('FM04', 'Proposal Review\nSY-QS-FM-04', C.proposal, 926, 86), g(1031),
    box('Proposal To Client', C.stepG, 1066, 38, 70, 80), g(1141),
    lproc('PR01', 'PROCEDURE INITIATION\nSY-QS-PR-01', C.procG, 1176, 8), t('FM01B', 'Initiation\nSY-QS-FM-01B', C.proposal, 1176, 86),

    // red connectors
    bar(1215, 183, 10, 20), bar(15, 195, 1210, 10), bar(15, 205, 10, 290), arrow('down', C.red, 5, 487),
    [[120, 110], [352, 342], [918, 908], [1186, 1176]].map(([sx, ax]) => [bar(sx, 200, 10, 20), arrow('down', C.red, ax, 210)]),
    arrow('down', '#0000FF', 585, 500),

    // ongoing groups
    frame('Review Plan Implementation', redFrame, 45, 245, 160, 246), lproc('PR03', 'PROCEDURE\nSY-QS-PR-03', C.procR, 76, 300),
    frame('Document Control & File Management', redFrame, 232, 245, 240, 246), lproc('PR04', 'PROCEDURE\nSY-QS-PR-04', C.procR, 245, 300),
    t('FM08', 'Document Register\nSY-QS-FM-08', C.ongoing, 245, 385), t('FM09', 'Drawing & Figure Register\nSY-QS-FM-09', C.ongoing, 360, 385),
    frame('Inputs / References', blueFrame, 501, 245, 205, 246),
    box('Latest Relevant Codes / Guidelines', C.blue, 507, 300, 90, 80), box('ATCW Technical & Design Guidelines', C.blue, 610, 300, 90, 80),
    box('ATCW CADD Standards & Guidelines:\nIL-TR-GD-01', C.blue, 507, 390, 90, 80), box('ATCW Templates For Documents & Figures', C.blue, 610, 390, 90, 80),
    frame('Project Communications & Change Management', redFrame, 736, 245, 353, 246), lproc('PR05', 'PROCEDURE\nSY-QS-PR-05', C.procR, 750, 300),
    t('FM10', 'Communications Matrix\nSY-QS-FM-10', C.ongoing, 750, 385), t('FM11', 'Change Request\nSY-QS-FM-11', C.ongoing, 863, 385),
    t('FM12', 'Change Register\nSY-QS-FM-12', C.ongoing, 975, 385),
    frame('Basis Of Design', redFrame, 1114, 245, 160, 246), t('FM13', 'Basis Of Design\nSY-QS-FM-13', C.ongoing, 1145, 300),

    // project phase (bottom row)
    lproc('PR03', 'PROJECT REVIEW:\nPROCEDURE\nSY-QS-PR-03', C.procO, 5, 535, 206, 72),
    t('FM03B', 'Reviewer Allocation - Project\nSY-QS-FM-03B', C.project, 5, 615), t('FM05', 'Project Review Plan\nSY-QS-FM-05', C.project, 110, 615), yv(212),
    lproc('PR01', 'PROJECT PLANNING:\nPROCEDURE\nSY-QS-PR-01', C.procO, 240, 535), t('FM06', 'Project Plan\nSY-QS-FM-06', C.project, 240, 615), yv(342),
    lproc('PR01', 'PROJECT SAFETY & RISK REVIEW:\nPROCEDURE\nSY-QS-PR-01', C.procO, 370, 535), t('FM07', 'Safety In Design\nSY-QS-FM-07', C.project, 370, 615), yv(472),
    box('PROJECT EXECUTION', C.stepO, 500, 535, 205, 72),
    t('FM14', 'Work Package Plan\nSY-QS-FM-14', C.project, 500, 615), t('FM15', 'Drawing / Figure\nCADD Request\nSY-QS-FM-15', C.project, 605, 615), yv(707),
    lproc('PR03', 'PROJECT\nREVIEW:\nPROCEDURE\nSY-QS-PR-03', C.procO, 735, 535), t('FM16', 'Project Review\nSY-QS-FM-16', C.project, 735, 615), yv(842),
    box('DELIVERABLES:\nReports, Documents, Drawings, Specifications', C.stepO, 870, 535, 140, 72), t('FM17', 'Document\nTransmittal\nSY-QS-FM-17', C.project, 891, 615), yv(1012),
    lproc('PR01', 'PROJECT FEEDBACK PROCEDURE\nSY-QS-PR-01', C.procO, 1040, 535), t('FM18', 'Project Feedback\nRequest Form\nSY-QS-FM-18', C.project, 1040, 615), yv(1147),
    lproc('PR01', 'PROJECT CLOSURE:\nPROCEDURE\nSY-QS-PR-01', C.procO, 1175, 535), t('FM19', 'Project Closure\nSY-QS-FM-19', C.project, 1175, 615),

    // right phase bar
    h('div', { style: { ...pos(1286, 1, 80, 717), border: '2px solid #000', background: '#fff' } }),
    h('div', { class: 'phase-title', style: { ...pos(1286, 1, 80, 199), background: C.procG, color: '#fff', fontSize: '16px' } }, 'Proposal Phase'),
    h('div', { class: 'phase-title', style: { ...pos(1286, 200, 40, 308), background: C.red, color: '#fff', fontSize: '14px' } }, 'Ongoing Tasks'),
    h('div', { class: 'phase-title', style: { ...pos(1286, 508, 40, 210), background: C.project, color: '#fff', fontSize: '14px' } }, 'Individual Tasks'),
    h('div', { class: 'phase-title', style: { ...pos(1326, 200, 40, 518), fontSize: '16px' } }, 'Project Phase'));
}

// ---------------------------------------------------------------- phone layout

const PHASES = [
  ['proposal', 'Proposal Phase', ['FM01A', 'FM02', 'FM03A', 'FM04', 'FM01B']],
  ['project', 'Project Phase', ['FM03B', 'FM05', 'FM06', 'FM07', 'FM16', 'FM19']],
  ['ongoing', 'Ongoing Tasks', ['FM08', 'FM09', 'FM10', 'FM11', 'FM12', 'FM13', 'FM14', 'FM15', 'FM17', 'FM18']],
];

function mobileList(forms, id, data) {
  const d = data.dashboard;
  return h('div', { class: 'dash-mobile' },
    data.dashboard.variant === 'v5' ? h('div', { class: 'light-row' },
      h('span', { class: 'lamps', role: 'img', 'aria-label': `Project health: ${d.trafficLight}` },
        ['red', 'yellow', 'green'].map(c => h('i', { class: `${c} ${d.trafficLight === c ? 'on' : ''}` }))),
      h('span', {}, d.trafficLightTooltip)) : null,
    h('p', { class: 'legend', style: { fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px' } }, 'M: Mandatory · O: Optional · N: Not Applicable'),
    PHASES.map(([cls, title, codes]) => h('section', { class: `phase ${cls}` }, h('h3', {}, title),
      h('div', { class: 'mtiles' }, codes.map(code => {
        const f = forms[code], s = tileState(f);
        return h('button', { class: 'mtile', type: 'button', disabled: s.locked, title: tileTitle(f, s),
          onclick: () => { location.hash = formHref(id, code); } },
          h('span', { class: 'code' }, `FM-${code.slice(2)}`),
          h('span', { class: 'ttl' }, f.title),
          h('span', { class: 'foot' }, h('span', { class: 'r', title: REQ[f.requirement] }, f.requirement),
            s.locked ? [icon('lock'), f.requirement === 'N' ? 'Not Applicable' : 'Locked'] : s.icon ? [icon(s.icon), s.label] : 'Not started'));
      })))),
    h('section', { class: 'phase' }, h('h3', { style: { background: 'var(--muted)' } }, 'Procedures'),
      h('div', { class: 'proc-list' }, ['PR01', 'PR02', 'PR03', 'PR04', 'PR05'].map(k =>
        h('a', { class: 'btn secondary small', href: procedureUrl(k), target: '_blank', rel: 'noopener' }, PROCEDURES[k].name)))));
}
