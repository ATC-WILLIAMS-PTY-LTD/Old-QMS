// Small DOM helpers shared by every page.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const icon = (name) => {
  const span = document.createElement('span');
  span.innerHTML = ICONS[name] ?? '';
  return span.firstElementChild;
};

const svg = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  sort: svg('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  reload: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  medical: svg('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'),
  heart: svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  radar: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>', '0 0 24 24'),
  checkBadge: svg('<path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  save: svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>'),
  docOutline: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  external: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>'),
};

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// ---------------------------------------------------------------- feedback

let loadingCount = 0;
export function loading(on) {
  loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
  let el = document.getElementById('loadingOverlay');
  if (loadingCount > 0 && !el) {
    el = h('div', { id: 'loadingOverlay', class: 'loading', role: 'status' }, h('img', { src: 'img/spinner.svg', alt: 'Loading' }));
    document.body.append(el);
  } else if (loadingCount === 0 && el) el.remove();
}

export function toast(message, kind = '') {
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

/** Opens a modal. Returns { close, body }. */
export function modal({ title, content, actions = [], wide = false, onClose, className = '' }) {
  const root = document.getElementById('overlayRoot');
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const body = h('div', { class: 'body' }, content);
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', {}, h('h2', {}, title), h('button', { type: 'button', 'aria-label': 'Close', onclick: close }, '×')),
      body,
      actions.length ? h('footer', {}, actions.map(a =>
        h('button', { type: 'button', class: `btn ${a.class ?? ''}`, onclick: () => a.onClick?.(close) }, a.label))) : null));
  root.append(backdrop);
  document.addEventListener('keydown', onKey);
  backdrop.querySelector('button, input, select, textarea')?.focus();
  return { close, body };
}

export function confirmDialog(title, message, yes = 'Yes', no = 'No') {
  return new Promise(resolve => {
    let done = false;
    modal({
      title, content: h('p', {}, message),
      actions: [
        { label: no, class: 'secondary', onClick: c => { done = true; c(); resolve(false); } },
        { label: yes, onClick: c => { done = true; c(); resolve(true); } },
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function alertList(title, intro, items) {
  modal({ title, content: [h('p', {}, intro), h('ul', {}, items.map(i => h('li', {}, i)))], actions: [{ label: 'OK', onClick: c => c() }] });
}

// ---------------------------------------------------------------- combobox

/**
 * Searchable combobox. items: array of anything; label(item) -> text; sub(item) -> secondary text.
 * multi: true keeps a list of chips. Returns { el, input, value, setValue, setItems, disable }.
 */
export function combo({ items = [], label = x => x, sub = null, placeholder = '', multi = false, onChange, id, maxShown = 80 }) {
  let all = items;
  let value = multi ? [] : null;
  const input = h('input', { class: 'field-input', id, type: 'text', placeholder, autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false' });
  const list = h('ul', { class: 'combo-list hidden', role: 'listbox' });
  const chips = multi ? h('div', { class: 'chips' }) : null;
  const el = h('div', { class: 'combo' }, input, list, chips);
  let active = -1, shown = [];

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const selectedLabel = !multi && value != null ? label(value).toLowerCase() : null;
    const filter = q && q !== selectedLabel ? q : '';
    shown = all.filter(it => !multi || !value.includes(it))
               .filter(it => !filter || `${label(it)} ${sub ? sub(it) ?? '' : ''}`.toLowerCase().includes(filter))
               .slice(0, maxShown);
    clear(list);
    if (!shown.length) list.append(h('li', { class: 'empty' }, 'No matches'));
    shown.forEach((it, i) => list.append(h('li', {
      role: 'option', 'aria-selected': i === active ? 'true' : 'false',
      onmousedown: (e) => { e.preventDefault(); pick(it); },
    }, label(it), sub && sub(it) ? h('small', {}, sub(it)) : null)));
  };
  const open = () => { if (input.disabled) return; list.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); render(); };
  const close = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
  const renderChips = () => {
    if (!multi) return;
    clear(chips);
    value.forEach(v => chips.append(h('span', { class: 'chip' }, label(v),
      input.disabled ? null : h('button', { type: 'button', 'aria-label': `Remove ${label(v)}`, onclick: () => { value = value.filter(x => x !== v); renderChips(); onChange?.(value); } }, '×'))));
  };
  const pick = (it) => {
    if (multi) { value = [...value, it]; input.value = ''; renderChips(); render(); }
    else { value = it; input.value = label(it); close(); }
    onChange?.(value);
  };

  input.addEventListener('focus', open);
  input.addEventListener('input', () => { active = -1; if (!multi && value != null && input.value !== label(value)) { value = null; onChange?.(null); } open(); });
  input.addEventListener('blur', () => setTimeout(() => { close(); if (!multi && value == null) input.value = ''; }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(); active = Math.min(active + 1, shown.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === 'Enter' && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') close();
  });

  return {
    el, input,
    get value() { return value; },
    setValue(v, silent = true) {
      value = multi ? [...(v ?? [])] : v ?? null;
      if (!multi) input.value = value != null ? label(value) : '';
      renderChips();
      if (!silent) onChange?.(value);
    },
    setItems(newItems) { all = newItems; },
    disable(on) { input.disabled = on; renderChips(); },
  };
}

export const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
