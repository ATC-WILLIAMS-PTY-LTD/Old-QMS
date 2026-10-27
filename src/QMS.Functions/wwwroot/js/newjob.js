// New Job Request - SY-QS-FM-01A "Opportunity Initiation Form - Part A" (Power Apps screen SY-QS-FM-01A_V5).
// The same screen shows an existing job's FM-01A read-only (route #/project/{id}/fm01a).
import { h, icon, clear, combo, modal, confirmDialog, alertList, toast, loading, fmtDate, fmtDateTime } from './ui.js';
import { api, ApiError } from './api.js';
import { setHeader } from './app.js';

const YES_NO = ['Yes', 'No'];

export async function renderNewJob(main, { masterId } = {}) {
  const viewMode = !!masterId;
  const [lookups, staff, clients, sites, job] = await Promise.all([
    api.lookups(), api.staff(), api.clients(), api.sites(), viewMode ? api.job(masterId) : null]);
  const L = (cat) => lookups[cat] ?? [];

  const projectHeader = job ? {
    projectNumber: job.master.ProjectNumber, projectName: job.master.ProjectName,
    subProjectNumber: job.master.SubProjectNumber, subProjectName: job.master.SubProjectName, v5: job.master.V5 === 1,
  } : null;
  setHeader({ kind: 'form', title: 'QMS SY-QS-FM-01A  OPPORTUNITY INITIATION FORM - PART A', job: projectHeader, back: viewMode ? `#/project/${masterId}` : '#/' });

  const fields = {};          // key -> { wrap, get, set, input }
  let relatedMasterId = null;
  let newRates = false;
  let selectedClient = null;  // full client record
  let contacts = [];

  // ---------------------------------------------------------------- field builders
  const infoTip = (text) => text ? h('span', { class: 'info', title: text, tabindex: '0', 'aria-label': text }, icon('info')) : null;
  const wrapField = (key, labelText, control, { required, info, hint, full, counter } = {}) => {
    const err = h('div', { class: 'err hidden', id: `${key}-err` });
    const wrap = h('div', { class: `field ${full ? 'full' : ''}`, 'data-key': key },
      h('label', { for: key }, h('span', {}, labelText), required ? h('span', { class: 'star', 'aria-hidden': 'true' }, '*') : null, infoTip(info), counter ?? null),
      control, hint ? h('div', { class: 'hint' }, hint) : null, err);
    return { wrap, err };
  };
  const reg = (key, def) => { fields[key] = def; return def.wrap; };

  function text(key, labelText, opts = {}) {
    const input = opts.multiline
      ? h('textarea', { class: 'field-input', id: key, maxlength: opts.max ?? null, rows: opts.rows ?? 3 })
      : h('input', { class: 'field-input', id: key, type: opts.type ?? 'text', step: opts.step ?? null, min: opts.min ?? null, max: opts.maxValue ?? null, inputmode: opts.inputmode ?? null });
    let counter = null;
    if (opts.max) {
      counter = h('span', { class: 'counter' }, `Length 0 / ${opts.max}`);
      input.addEventListener('input', () => { counter.textContent = `Length ${input.value.trim().length} / ${opts.max}`; });
    }
    const { wrap, err } = wrapField(key, labelText, opts.suffix ? h('div', { class: 'inline' }, h('div', { class: 'grow' }, input), opts.suffix) : input, { ...opts, counter });
    if (opts.onInput) input.addEventListener('input', opts.onInput);
    if (opts.onBlur) input.addEventListener('blur', opts.onBlur);
    return reg(key, { wrap, err, input, required: opts.required,
      get: () => input.value.trim(), set: (v) => { input.value = v ?? ''; input.dispatchEvent(new Event('input')); } });
  }

  function select(key, labelText, options, opts = {}) {
    const input = h('select', { class: 'field-input', id: key },
      h('option', { value: '' }, opts.placeholder ?? 'Select…'), options.map(o => h('option', { value: o }, o)));
    const { wrap, err } = wrapField(key, labelText, opts.suffix ? h('div', { class: 'inline' }, h('div', { class: 'grow' }, input), opts.suffix) : input, opts);
    if (opts.onChange) input.addEventListener('change', opts.onChange);
    const set = (v) => {
      if (v && ![...input.options].some(o => o.value === v)) input.append(h('option', { value: v }, v));   // legacy values
      input.value = v ?? '';
    };
    return reg(key, { wrap, err, input, required: opts.required, get: () => input.value, set });
  }

  function radios(key, labelText, options, opts = {}) {
    const group = h('div', { class: 'radio-group', role: 'radiogroup', id: key },
      options.map(o => h('label', {}, h('input', { type: 'radio', name: key, value: o }), o)));
    const { wrap, err } = wrapField(key, labelText, group, opts);
    group.addEventListener('change', () => opts.onChange?.(get()));
    const get = () => group.querySelector('input:checked')?.value ?? '';
    return reg(key, { wrap, err, input: group, required: opts.required, get,
      set: (v) => group.querySelectorAll('input').forEach(i => { i.checked = i.value === v; }) });
  }

  function comboField(key, labelText, opts) {
    const c = combo({ id: key, ...opts });
    const { wrap, err } = wrapField(key, labelText, opts.suffix ? h('div', { class: 'inline' }, h('div', { class: 'grow' }, c.el), opts.suffix) : c.el, opts);
    return reg(key, { wrap, err, input: c.input, combo: c, required: opts.required, get: () => c.value, set: (v) => c.setValue(v) });
  }

  const section = (title, ...children) => h('section', { class: 'form-section' }, h('h2', {}, title), h('div', { class: 'form-grid' }, children));
  const val = (k) => fields[k].get();

  // ---------------------------------------------------------------- related project + site
  const siteCombo = comboField('siteNameExisting', 'Site Name', {
    items: sites, label: s => s.name, sub: s => [s.code, s.state].filter(Boolean).join(' · '), placeholder: 'Find Site Name', required: true,
    onChange: (s) => {
      fields.siteShortName.set(s?.code ?? '');
      if (s) ['street1', 'street2', 'suburb', 'state', 'postCode', 'country'].forEach(k => { if (s[k]) fields[ADDRESS_MAP[k]].set(s[k].trim()); });
    },
  });
  const siteText = text('siteNameNew', 'Site Name', { required: true, onBlur: () => checkSite(), hint: 'Please minimise the characters used and avoid spaces, hyphens and commas.' });

  async function checkSite() {
    if (val('existingSite') !== 'No') return;
    const name = val('siteNameNew'), code = val('siteShortName');
    if (!name && !code) return;
    const res = await api.siteCheck(name, code).catch(() => null);
    showErr('siteNameNew', res?.nameExists ? `Site Name with ${name} already exists` : '');
    showErr('siteShortName', res?.codeExists ? `Site Short Name with ${code} already exists` : '');
  }

  const syncSiteMode = () => {
    const mode = val('existingSite');
    fields.siteNameExisting.wrap.classList.toggle('hidden', mode !== 'Yes');
    fields.siteNameNew.wrap.classList.toggle('hidden', mode !== 'No');
    fields.siteShortName.wrap.classList.toggle('hidden', !mode);
    fields.siteShortName.input.readOnly = mode === 'Yes';
  };

  // ---------------------------------------------------------------- financials
  const pctLabel = (key) => h('span', { class: 'pct', id: `${key}-pct` });
  const proposalFee = h('div', { class: 'calc', id: 'proposalFee' }, '0.00');
  const updateCalc = () => {
    const fee = parseFloat(val('fee')) || 0, prob = parseFloat(val('probability')) || 0, prop = parseFloat(val('proposal')) || 0;
    document.getElementById('probability-pct').textContent = val('probability') ? `= ${Math.round(prob * 100)}%` : '';
    document.getElementById('proposal-pct').textContent = val('proposal') ? `= ${+(prop * 100).toFixed(2)}%` : '';
    const v = fee * prob * prop;
    proposalFee.textContent = v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    proposalFeeLabel.textContent = `Estimated Proposal Fee ${val('feeCurrency') || 'AUD'}$`;
  };
  const proposalFeeLabel = h('label', {}, 'Estimated Proposal Fee AUD$');
  const currencySel = h('select', { class: 'field-input', id: 'feeCurrency', 'aria-label': 'Fee currency', style: { width: '90px' } },
    L('Currency').map(c => h('option', { value: c }, c)));
  currencySel.addEventListener('change', updateCalc);
  fields.feeCurrency = { get: () => currencySel.value, set: (v) => { currencySel.value = v || 'AUD'; }, input: currencySel };

  // ---------------------------------------------------------------- rates
  const ratesBtn = h('button', { class: 'btn secondary small', type: 'button', style: { minHeight: '32px' } }, 'New Rates');
  ratesBtn.addEventListener('click', () => setNewRates(!newRates));
  const setNewRates = (on) => {
    newRates = on;
    ratesBtn.textContent = on ? 'Current Rates' : 'New Rates';
    fields.rateGroup.input.classList.toggle('hidden', on);
    fields.rateNew.wrap.classList.toggle('hidden', !on);
  };

  // ---------------------------------------------------------------- client & contact
  const clientReadout = h('div', { class: 'readout full' });
  const contactReadout = h('div', { class: 'readout full' });
  const newClientBtn = h('button', { class: 'btn small', type: 'button', style: { minHeight: '32px' }, onclick: () => openNewClient() }, 'New Client');
  const newContactBtn = h('button', { class: 'btn small', type: 'button', style: { minHeight: '32px' }, disabled: true, onclick: () => openNewContact() }, 'New Contact');

  const readoutItems = (pairs) => pairs.map(([k, v]) => h('div', {}, h('span', {}, k), v || '—'));
  const renderClientReadout = (c) => {
    clear(clientReadout).append(...readoutItems([
      ['ABN', c?.CompanyABN ?? c?.ABN], ['Address Line 1', c?.CompanyAddressLine1 ?? c?.AddressLine1], ['Address Line 2', c?.CompanyAddressLine2 ?? c?.AddressLine2],
      ['Suburb / Town', c?.CompanySuburb ?? c?.SuburbTown], ['State', c?.CompanyState ?? c?.State], ['Post Code', c?.CompanyPostCode ?? c?.PostCode],
      ['Country', c?.CompanyCountry ?? c?.Country], ['Phone Number', c?.CompanyPhone ?? c?.PhoneNumber], ['Email Address', c?.CompanyEmailAddress ?? c?.EmailAddress],
      ['Web Site', c?.CompanyWebSite]]));
  };
  const renderContactReadout = (c) => {
    clear(contactReadout).append(...readoutItems([
      ['Contact Salutation', c?.ContactSalutation], ['Contact Position', c?.ContactPosition], ['Contact Phone', c?.ContactPhone],
      ['Contact Mobile', c?.ContactMobile], ['Contact Email', c?.ContactEmail], ['ATC Link', c?.ATCLink], ['Sourced Contact At', c?.SourcedContactAt]]));
  };

  // contactId selects a contact by ID; match ({ name, email }) selects the contact copied onto a related project's FM-01A.
  async function selectClient(c, contactId, match) {
    selectedClient = null; contacts = [];
    fields.contact.combo.setValue(null); fields.contact.combo.setItems([]); renderContactReadout(null);
    newContactBtn.disabled = !c;
    fields.contact.combo.disable(!c || viewMode);
    if (!c) { renderClientReadout(null); return; }
    const res = await api.client(c.id);
    selectedClient = res.client; contacts = res.contacts;
    renderClientReadout(selectedClient);
    fields.contact.combo.setItems(contacts);
    const norm = (v) => (v ?? '').trim().toLowerCase();
    const ct = contactId ? contacts.find(x => x.ID === contactId)
      : match ? (match.email && contacts.find(x => norm(x.ContactEmail) === norm(match.email)))
                || (match.name && contacts.find(x => norm(x.ContactName) === norm(match.name)))
      : null;
    if (ct) { fields.contact.combo.setValue(ct); renderContactReadout(ct); }
    return ct ?? null;
  }

  // ---------------------------------------------------------------- layout
  const relatedInfo = 'Select "Yes" only if the new project is linked to an existing project with the same site and client, allowing the system to pre-fill the first 4 forms with information from that project and streamline form completion.';
  const tcInfo = 'Please select the primary Technical Community in which your project will be completed. Please be aware that TC leaders will be notified when a new opportunity is created in their TCs.';
  const categoryInfo = 'Standard: Projects under our standard review process for deliverables. EOR: Engineer of Record projects. ITRB - On Board: Independent Technical Review Board with PM being a Board member. ITRB - Individual: PM is not part of the Board.';

  const form = h('form', { class: 'page', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'form-banner' }, 'This form should be completed for all new opportunities in order to assign a project number. Once a contract is awarded, please complete Part B of the form SY-QS-FM-01B.'),
    viewMode ? approvalsPanel(job) : null,

    section('Project / Site',
      radios('isExisting', 'Is this new project related to an existing one?', YES_NO, { required: true, info: relatedInfo,
        onChange: (v) => { if (v === 'Yes' && !viewMode) openRelated(); if (v === 'No') relatedMasterId = null; } }),
      select('existingSite', 'Existing Site', YES_NO, { required: true, onChange: () => {
        fields.siteNameExisting.set(null); fields.siteNameNew.set(''); fields.siteShortName.set('');
        showErr('siteNameNew', ''); showErr('siteShortName', ''); syncSiteMode();
      } }),
      siteCombo, siteText,
      text('siteShortName', 'Site Short Name', { required: true, max: 6, onBlur: () => checkSite(), hint: 'Maximum 6 characters.' })),

    section('Project Details',
      text('descriptor', 'Project Descriptor', { required: true, multiline: true, rows: 2, max: 30,
        hint: 'Please ensure to minimise the characters used in the project description & avoid using commas.' }),
      text('projectNumber', 'Project Number', { type: 'number', inputmode: 'numeric', min: 1, hint: 'Leave blank - assigned by Admin once the job is set up in Synergy.' }),
      comboField('pm', 'Project Manager', { items: staff, label: s => s.name, sub: s => s.email, placeholder: 'Search staff', required: true }),
      h('div', { class: 'field' }),
      text('startDate', 'Tentative Project Start Date', { type: 'date', required: true }),
      text('endDate', 'Tentative Project End Date', { type: 'date', required: true })),

    section('Project Specific Requirements',
      select('lab', 'Will you need to undertake laboratory testing?', YES_NO, { required: true, info: 'If yes is selected, please be aware that the Laboratory Team will be notified.' }),
      select('mechanical', 'Do you require Mechanical Engineering Components for the project? E.g. mechanical design and/or testing?', YES_NO, { required: true, info: 'If yes is selected, the Mechanical Engineering team will be notified.' }),
      select('siteWork', 'Will there be site work? E.g. Investigations, construction supervision, site inspections, etc?', YES_NO, { required: true, info: 'If yes is selected, the Site Work Team will be notified.' }),
      select('seismic', 'Do you require Seismic Hazard Integrity Services (e.g., PSHA, DSHA, Fault Investigations, Site Response Analysis, etc)?', YES_NO, { required: true, info: 'If yes is selected, the Seismic Hazard team will be notified.' })),

    section('Financial Estimates',
      h('div', { class: 'full hint', style: { fontSize: '12px' } }, 'Please note that this is an estimation of the proposal, not the project budget.'),
      text('fee', 'Estimated Project Fee Value', { type: 'number', step: '0.01', min: 0, inputmode: 'decimal', required: true, onInput: updateCalc, suffix: currencySel }),
      text('probability', 'Probability of Success (% Value Entered as Decimal)', { type: 'number', step: '0.01', min: 0, maxValue: 1, inputmode: 'decimal', required: true, onInput: updateCalc, suffix: pctLabel('probability'), hint: 'e.g. 0.5 for 50%' }),
      text('proposal', 'Estimated Proposal Value (% Based on Project Fee Entered as Decimal)', { type: 'number', step: '0.001', min: 0, maxValue: 1, inputmode: 'decimal', required: true, onInput: updateCalc, suffix: pctLabel('proposal') }),
      h('div', { class: 'field' }, proposalFeeLabel, proposalFee)),

    section('Scope',
      text('scope', 'Scope of Work', { required: true, multiline: true, rows: 5, full: true })),

    section('Project Category',
      h('div', { class: 'full' }, select('category', 'Please select a project category from the list below. Note that form requirements will vary depending on the category you choose', L('ProjectCategory'), { required: true, info: categoryInfo }))),

    section('General Details',
      select('feeType', 'Fee Type', L('FeeType'), { required: true }),
      select('status', 'Project Status', L('SubProjectStatus'), { required: true }),
      select('rateGroup', 'Default Rate Group', L('RateGroup'), { required: true, suffix: ratesBtn, placeholder: 'Find Rate Group' }),
      text('rateNew', 'File path of the new Rates document', { required: true, hint: 'A new rate group request is also e-mailed to the QMS manager.' }),
      select('invoiceCurrency', 'Invoice Currency', L('InvoiceCurrency'), { required: true, placeholder: 'Select Currency Type',
        onChange: () => fields.invoiceOther.wrap.classList.toggle('hidden', val('invoiceCurrency') !== 'Other (Please specify)') }),
      text('invoiceOther', 'Type Invoice Currency', { required: true }),
      select('specificRates', 'Specific Rate(s)', ['No', 'Yes'], { required: true }),
      select('tax', 'Tax Rule', L('TaxRule'), { required: true }),
      select('localBuy', 'Subject to Local Buy', ['No', 'Yes'], { required: true }),
      select('commodity', 'Commodity', L('Commodity'), { required: true }),
      select('projectType', 'Project Type', L('TechnicalCommunity'), { required: true, info: tcInfo }),
      select('costCentre', 'Office', L('CostCentre'), { required: true }),
      h('div', { class: 'full' }, comboField('tcs', 'Multiple Technical Communities', { items: L('TechnicalCommunity'), multi: true, placeholder: 'Select multiple items',
        info: 'Select any additional Technical Communities involved. TC leaders will be notified.' }).valueOf())),

    section('Site Address',
      text('street1', 'Address Line 1', { required: true }), text('street2', 'Address Line 2'),
      text('suburb', 'Suburb/Town', { required: true }), text('siteState', 'State', { required: true }),
      text('postCode', 'Post code', { required: true, hint: 'Use 0000 for sites outside Australia.' }), text('country', 'Country', { required: true })),

    section('Contacts - Client / Company',
      h('div', { class: 'full' }, comboField('client', 'Client / Company Name', { items: clients, label: c => c.name, placeholder: 'Search clients', required: true,
        suffix: viewMode ? null : newClientBtn, onChange: (c) => selectClient(c) })),
      clientReadout),

    section('Primary Contact',
      h('div', { class: 'full' }, comboField('contact', 'Contact Name', { items: [], label: c => c.ContactName, sub: c => c.ContactPosition, placeholder: 'Select a client first',
        suffix: viewMode ? null : newContactBtn, onChange: (c) => renderContactReadout(c) })),
      contactReadout),

    section('Form Submission Details',
      h('div', { class: 'full' }, radios('office', 'Office for Form Submission', L('OfficeForSubmission'), { required: true })),
      viewMode ? h('div', { class: 'readout full' }, readoutItems([
        ['Submitted By', job.fm01a?.SubmittedByName], ['Submitted Date', fmtDateTime(job.fm01a?.SubmittedDateTime ?? job.fm01a?.Created)]])) : null));

  const actions = h('div', { class: 'form-actions' },
    h('button', { class: 'btn secondary', type: 'button', onclick: () => { location.hash = viewMode ? `#/project/${masterId}` : '#/'; } }, 'Back'),
    viewMode ? null : h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
      if (await confirmDialog('CLEAR FORM', 'Clear all entered values?')) { clear(main); renderNewJob(main, {}); }
    } }, 'Clear'),
    viewMode ? null : h('button', { class: 'btn', type: 'button', onclick: submit }, 'Submit'));

  main.append(form, actions);
  fields.contact.combo.disable(true);
  fields.invoiceOther.wrap.classList.add('hidden');
  fields.rateNew.wrap.classList.add('hidden');
  currencySel.value = 'AUD';
  renderClientReadout(null); renderContactReadout(null);
  syncSiteMode();
  updateCalc();

  if (viewMode) fillFromJob(job);

  // ---------------------------------------------------------------- related project popup
  // Mirrors the Power Apps "Lookup Project Details" popup: details fill in as the Project Number is typed,
  // Sub Project Number is required only for legacy (non-V5) projects, Validate pre-fills the form and closes.
  function openRelated() {
    // Answering "Yes" defaults Existing Site to "Yes" (the related project's site).
    if (val('existingSite') !== 'Yes') { fields.existingSite.set('Yes'); syncSiteMode(); }

    const ro = (placeholder) => h('input', { class: 'field-input', readonly: true, tabindex: '-1', placeholder });
    const num = h('input', { class: 'field-input lookup-search', type: 'search', inputmode: 'numeric', placeholder: 'Search by Project Number', 'aria-label': 'Project Number' });
    const projectName = ro('Project Name'), subName = ro('Sub Project Name'), clientName = ro('Client Name'), pmName = ro('Project Manager');
    const subSel = h('select', { class: 'field-input', 'aria-label': 'Sub Project Number', disabled: true }, h('option', { value: '' }, 'Select Sub Project Number'));
    const msg = h('div', { class: 'lookup-msg', role: 'status' });
    const validateBtn = h('button', { class: 'lookup-validate', type: 'button', disabled: true }, 'Validate');

    const row = (label, control, required = false) => h('div', { class: 'lookup-row' },
      h('label', {}, required ? h('span', { class: 'star', 'aria-hidden': 'true' }, '*') : null, label), control);
    const subRow = row('Sub Project Number', subSel, true);

    let found = null, requiresSub = false, seq = 0, timer;

    const showDetails = (p) => {
      found = p;
      subName.value = p?.subProjectName ?? '';
      clientName.value = p?.clientName ?? '';
      pmName.value = p?.projectManager ?? '';
      validateBtn.disabled = !p;
    };

    const reset = (text = '') => {
      projectName.value = ''; requiresSub = false; showDetails(null);
      clear(subSel).append(h('option', { value: '' }, 'Select Sub Project Number'));
      subSel.disabled = true; subRow.classList.remove('hidden');
      msg.textContent = text;
    };

    const lookup = async (sub = '') => {
      const number = num.value.trim();
      const mySeq = ++seq;
      if (!/^\d+$/.test(number)) { reset(number ? 'Enter a valid Project Number' : ''); return; }
      try {
        const res = await api.related(number, sub);
        if (mySeq !== seq) return;                       // a newer keystroke superseded this lookup
        msg.textContent = '';
        projectName.value = res.projectName ?? '';
        requiresSub = res.requiresSubProject;
        subRow.classList.toggle('hidden', !requiresSub);   // V5 projects have no sub-project number
        if (requiresSub && !sub) {
          clear(subSel).append(h('option', { value: '' }, 'Select Sub Project Number'),
            ...res.subProjectNumbers.map(n => h('option', { value: n }, String(n).padStart(2, '0'))));
          subSel.disabled = false;
        }
        showDetails(res.project);
      } catch (e) {
        if (mySeq === seq) reset(e.status === 404 ? `No project found with number ${number}` : e.message);
      }
    };

    num.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => lookup(), 350); });
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); lookup(); } });
    subSel.addEventListener('change', () => { if (subSel.value) lookup(subSel.value); else showDetails(null); });

    const m = modal({
      title: 'Lookup Project Details',
      className: 'lookup-modal',
      content: h('div', { class: 'lookup-body' },
        row('Project Number', num, true),
        row('Project Name', projectName),
        subRow,
        row('Sub Project Name', subName),
        row('Client Name', clientName),
        h('div', { class: 'lookup-row' }, h('label', {}, 'Project Manager'), h('div', { class: 'lookup-last' }, pmName, validateBtn)),
        msg),
      onClose: () => { if (!relatedMasterId) fields.isExisting.set('No'); },
    });

    validateBtn.addEventListener('click', () => {
      if (!num.value.trim() || (requiresSub && !subSel.value) || !found) {
        alertList('Mandatory fields can not be empty', 'Please fill all the fields marked with a red asterisk.', []);
        return;
      }
      prefillFromRelated(found);
      m.close();
    });
    setTimeout(() => num.focus(), 0);
    return m;
  }

  // Validate on the lookup popup: copy the related project's site and FM-01A answers into this request
  // (Project Specific Requirements, Financial Estimates, Project Category, General Details, Site Address,
  //  Client / Company, Primary Contact and Office for Form Submission). Scope of Work is left for the new job.
  async function prefillFromRelated(p) {
    relatedMasterId = p.masterId;
    const a = p.fm01a ?? {};
    fields.existingSite.set('Yes'); syncSiteMode();
    const site = sites.find(s => s.name?.trim() === p.projectName?.trim());
    if (site) fields.siteNameExisting.combo.setValue(site, false);
    else showErr('siteNameExisting', "Please Select Valid Site Name or change existing site name to 'no'");
    fields.siteShortName.set(p.siteCode ?? site?.code ?? '');
    setFromFm01a(a);   // after the site, so the related project's own address wins over the site list's

    const norm = (v) => (v ?? '').trim().toLowerCase();
    const client = clients.find(x => x.id === p.clientId) ?? clients.find(x => a.CompanyName && norm(x.name) === norm(a.CompanyName));
    if (client) {
      fields.client.combo.setValue(client);
      try {
        const contact = await selectClient(client, null, { name: a.ContactName, email: a.ContactEmail });
        if (!contact && a.ContactName) {
          // As in Power Apps, keep the contact recorded on the related FM-01A even if it is not in the client's contact list.
          const copied = {
            ID: null, fromRelated: true, ContactName: a.ContactName, ContactSalutation: a.ContactSalutation,
            ContactPosition: a.ContactPosition, ContactPhone: a.ContactPhone, ContactMobile: a.ContactMobile,
            ContactEmail: a.ContactEmail, ATCLink: a.ATCLink, SourcedContactAt: a.SourcedContactAt,
          };
          fields.contact.combo.setValue(copied);
          renderContactReadout(copied);
        }
      } catch (e) { toast(e.message, 'error'); }
    }
    toast('Details pre-filled from the related project');
  }

  // ---------------------------------------------------------------- new client / contact popups
  function openNewClient() {
    const f = {};
    const inp = (k, label, req, attrs = {}) => { f[k] = h('input', { class: 'field-input', ...attrs }); return h('div', { class: 'field' }, h('label', {}, label, req ? h('span', { class: 'star' }, '*') : null), f[k]); };
    f.CompanyCountry = h('input', { class: 'field-input', value: 'Australia', list: 'countryList' });
    const body = h('div', { class: 'form-grid', style: { padding: 0 } },
      inp('CompanyName', 'Company Name', true), inp('CompanyABN', 'ABN Number', true),
      inp('CompanyAddressLine1', 'Address Line 1', true), inp('CompanyAddressLine2', 'Address Line 2'),
      inp('CompanySuburb', 'Suburb / Town', true), inp('CompanyState', 'State', true),
      inp('CompanyPostCode', 'Post Code', true, { inputmode: 'numeric' }),
      h('div', { class: 'field' }, h('label', {}, 'Country', h('span', { class: 'star' }, '*')), f.CompanyCountry,
        h('datalist', { id: 'countryList' }, COUNTRIES.map(c => h('option', { value: c })))),
      inp('CompanyPhone', 'Phone', true, { type: 'tel' }), inp('CompanyEmailAddress', 'Email Address', false, { type: 'email' }),
      inp('CompanyWebSite', 'Web Site'));
    modal({ title: 'Add New Client / Company', wide: true, content: body, actions: [
      { label: 'Back', class: 'secondary', onClick: c => c() },
      { label: 'Submit', onClick: async (close) => {
        const payload = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
        try {
          loading(true);
          const res = await api.createClient(payload);
          const all = await api.clients();
          fields.client.combo.setItems(all);
          clients.splice(0, clients.length, ...all);
          const c = all.find(x => x.id === res.id);
          fields.client.combo.setValue(c); await selectClient(c);
          close(); toast(`The New Client / Company ${res.name} Added`);
        } catch (e) { showApiErrors(e); } finally { loading(false); }
      } }] });
  }

  function openNewContact() {
    if (!selectedClient) return;
    const f = {};
    const inp = (k, label, req, attrs = {}) => { f[k] = h('input', { class: 'field-input', ...attrs }); return h('div', { class: 'field' }, h('label', {}, label, req ? h('span', { class: 'star' }, '*') : null), f[k]); };
    f.ContactSalutation = h('select', { class: 'field-input' }, h('option', { value: '' }, 'Select…'), L('Salutation').map(s => h('option', { value: s }, s)));
    const atc = combo({ items: staff, label: s => s.name, sub: s => s.email, placeholder: 'Search staff' });
    const body = h('div', { class: 'form-grid', style: { padding: 0 } },
      inp('ContactName', 'Contact Name', true),
      h('div', { class: 'field' }, h('label', {}, 'Contact Salutation', h('span', { class: 'star' }, '*')), f.ContactSalutation),
      inp('ContactPosition', 'Contact Position', true), inp('ContactEmail', 'Contact Email', true, { type: 'email' }),
      inp('ContactPhone', 'Contact Phone', false, { type: 'tel' }), inp('ContactMobile', 'Contact Mobile', false, { type: 'tel' }),
      h('div', { class: 'field' }, h('label', {}, 'ATC Link'), atc.el), inp('SourcedContactAt', 'Sourced Contact At'));
    modal({ title: `Add New Client Contact Personnel - ${selectedClient.CompanyName}`, wide: true, content: body, actions: [
      { label: 'Back', class: 'secondary', onClick: c => c() },
      { label: 'Submit', onClick: async (close) => {
        const payload = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
        payload.ATCLink = atc.value?.name ?? '';
        try {
          loading(true);
          const res = await api.createContact(selectedClient.ID, payload);
          await selectClient({ id: selectedClient.ID }, res.id);
          close(); toast(`The New Client Contact Personnel ${res.name} Added`);
        } catch (e) { showApiErrors(e); } finally { loading(false); }
      } }] });
  }

  // ---------------------------------------------------------------- validation & submit
  function showErr(key, msg) {
    const f = fields[key];
    if (!f?.err) return;
    f.err.textContent = msg; f.err.classList.toggle('hidden', !msg);
    f.wrap.classList.toggle('invalid', !!msg);
  }

  function activeRequired() {
    const keys = ['isExisting', 'existingSite', 'siteShortName', 'descriptor', 'pm', 'startDate', 'endDate', 'lab', 'mechanical', 'siteWork', 'seismic',
      'fee', 'probability', 'proposal', 'scope', 'category', 'feeType', 'status', 'invoiceCurrency', 'specificRates', 'tax', 'localBuy',
      'commodity', 'projectType', 'costCentre', 'street1', 'suburb', 'siteState', 'postCode', 'country', 'client', 'office'];
    keys.push(val('existingSite') === 'No' ? 'siteNameNew' : 'siteNameExisting');
    keys.push(newRates ? 'rateNew' : 'rateGroup');
    if (val('invoiceCurrency') === 'Other (Please specify)') keys.push('invoiceOther');
    return keys;
  }

  function validate() {
    const missing = [];
    for (const f of Object.values(fields)) if (f.wrap) showErr(Object.keys(fields).find(k => fields[k] === f), '');
    for (const key of activeRequired()) {
      const v = val(key);
      if (v === null || v === '' || (Array.isArray(v) && !v.length)) {
        showErr(key, 'This field is required');
        missing.push(fields[key].wrap.querySelector('label span')?.textContent ?? key);
      }
    }
    const limits = [];
    if (val('descriptor').length > 30) { limits.push('Project Descriptor (max 30 characters)'); showErr('descriptor', 'Maximum 30 characters'); }
    if (val('siteShortName').length > 6) { limits.push('Site Short Name (max 6 characters)'); showErr('siteShortName', 'Maximum 6 characters'); }
    const p = parseFloat(val('probability')), pv = parseFloat(val('proposal'));
    if (val('probability') && (p < 0 || p > 1)) { limits.push('Probability of Success must be between 0 and 1'); showErr('probability', 'Enter a decimal between 0 and 1'); }
    if (val('proposal') && (pv < 0 || pv > 1)) { limits.push('Estimated Proposal Value must be between 0 and 1'); showErr('proposal', 'Enter a decimal between 0 and 1'); }
    if (val('startDate') && val('endDate') && val('endDate') < val('startDate')) { limits.push('End date is before the start date'); showErr('endDate', 'Must be on or after the start date'); }
    return { missing, limits };
  }

  async function submit() {
    const { missing, limits } = validate();
    if (missing.length) {
      alertList('Mandatory fields can not be empty', 'Please fill all the fields marked with a red asterisk:', missing);
      form.querySelector('.field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (limits.length) { alertList('Check the Site Short Name / Project Descriptor character limit', 'Please correct the following:', limits); return; }
    if (!(await confirmDialog('SUBMIT FORM', 'Are you sure, you want to proceed?'))) return;

    const existing = val('existingSite') === 'Yes';
    const payload = {
      isExistingProject: val('isExisting'), relatedMasterId, existingSite: val('existingSite'),
      siteName: existing ? val('siteNameExisting')?.name : val('siteNameNew'), siteShortName: val('siteShortName'),
      projectDescriptor: val('descriptor'), projectNumber: val('projectNumber') ? +val('projectNumber') : null,
      projectManagerEmail: val('pm')?.email, subProjectManagerEmail: val('pm')?.email,
      tentativeProjectStartDate: val('startDate'), tentativeProjectEndDate: val('endDate'),
      labTestingRequired: val('lab'), mechanicalComponentsRequired: val('mechanical'), siteWorkExpected: val('siteWork'),
      seismicHazardIntegrityRequired: val('seismic'),
      estimatedProjectFeeValue: +val('fee'), projectFeeCurrency: currencySel.value, probabilityOfSuccess: +val('probability'),
      estimatedProposalValue: +val('proposal'), scopeOfWork: val('scope'), projectCategory: val('category'),
      feeType: val('feeType'), subProjectStatus: val('status'), newRates, practiseStaffRate: val('rateGroup'), practiseStaffRateNew: val('rateNew'),
      invoiceCurrency: val('invoiceCurrency'), invoiceCurrencyOther: val('invoiceOther'), specificRates: val('specificRates'),
      taxRule: val('tax'), subjectToLocalBuy: val('localBuy'), commodity: val('commodity'), projectType: val('projectType'),
      practiseCostCentre: val('costCentre'), multipleTechnicalCommunities: val('tcs'),
      streetLine1: val('street1'), streetLine2: val('street2'), siteSuburbTown: val('suburb'), siteState: val('siteState'),
      sitePostCode: val('postCode'), siteCountry: val('country'),
      clientId: val('client')?.id, contactId: val('contact')?.ID ?? null, contactFromRelated: !!val('contact')?.fromRelated,
      officeForFormSubmission: val('office'),
    };
    try {
      loading(true);
      const res = await api.createJob(payload);
      api.invalidate('sites');
      toast('Project created - it is now waiting for OM Approval');
      location.hash = `#/project/${res.masterId}`;
    } catch (e) { showApiErrors(e); } finally { loading(false); }
  }

  // ---------------------------------------------------------------- view mode
  function setFromFm01a(a) {
    const s = (k, v) => { if (v !== null && v !== undefined && v !== '') fields[k].set(String(v)); };
    s('lab', a.LabTestingRequired); s('mechanical', a.MechanicalComponentsRequired); s('siteWork', a.SiteWorkExpected);
    s('seismic', a.SeismicHazardIntegrityRequired); s('fee', a.EstimatedProjectFeeValue); s('probability', a.ProbabilityOfSuccess);
    s('proposal', a.EstimatedProposalValue); fields.feeCurrency.set(a.ProjectFeeCurrency);
    s('category', a.ProjectCategory);
    if (a.PractiseStaffRateNew) { setNewRates(true); s('rateNew', a.PractiseStaffRateNew); }
    else if (a.PractiseStaffRate) { setNewRates(false); s('rateGroup', a.PractiseStaffRate); }
    // Invoice currencies outside the choice list were typed in via "Other (Please specify)".
    if (a.InvoiceCurrency && !L('InvoiceCurrency').includes(a.InvoiceCurrency)) {
      s('invoiceCurrency', 'Other (Please specify)'); s('invoiceOther', a.InvoiceCurrency);
    } else s('invoiceCurrency', a.InvoiceCurrency);
    fields.invoiceOther.wrap.classList.toggle('hidden', val('invoiceCurrency') !== 'Other (Please specify)');
    s('feeType', a.FeeType); s('status', a.SubProjectStatus); s('specificRates', a.SpecificRates);
    s('tax', a.TaxRule); s('localBuy', a.SubjectToLocalBuy); s('commodity', a.Commodity); s('projectType', a.ProjectType);
    s('costCentre', a.PractiseCostCentre); s('office', a.OfficeForFormSubmission);
    s('street1', a.StreetLine1); s('street2', a.StreetLine2); s('suburb', a.SiteSuburbTown); s('siteState', a.SiteState);
    s('postCode', a.SitePostCode); s('country', a.SiteCountry);
    try { if (a.MultipleTechnicalCommunities) fields.tcs.combo.setValue(JSON.parse(a.MultipleTechnicalCommunities)); } catch { /* legacy text */ }
    updateCalc();
  }

  function fillFromJob({ master: m, fm01a: a }) {
    a ??= {};
    fields.isExisting.set(a.IsExistingProject ?? 'No');
    fields.existingSite.set(a.ExistingProject ?? 'Yes'); syncSiteMode();
    fields.siteNameExisting.combo.setValue({ name: m.SiteName ?? a.SiteName ?? m.ProjectName });
    fields.siteNameNew.set(m.SiteName ?? m.ProjectName);
    fields.siteShortName.set(m.SiteShortName ?? a.SiteShortName);
    fields.descriptor.set(m.SubProjectName); fields.projectNumber.set(m.ProjectNumber > 0 ? m.ProjectNumber : '');
    fields.pm.combo.setValue({ name: a.ProjectManager ?? m.ProjectManagerName, email: a.ProjectManagerEmail });
    fields.startDate.set(a.TentativeProjectStartDate?.slice(0, 10)); fields.endDate.set(a.TentativeProjectEndDate?.slice(0, 10));
    fields.scope.set(a.ScopeOfWork);
    setFromFm01a(a);
    fields.client.combo.setValue({ id: m.ID_Client, name: a.CompanyName ?? '' });
    renderClientReadout(a);
    fields.contact.combo.setValue(a.ContactName ? { ContactName: a.ContactName } : null);
    renderContactReadout(a);

    form.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
    form.querySelectorAll('.form-section button').forEach(el => { el.disabled = true; });
    ratesBtn.classList.add('hidden');
    fields.tcs.combo.disable(true);
  }
}

const ADDRESS_MAP = { street1: 'street1', street2: 'street2', suburb: 'suburb', state: 'siteState', postCode: 'postCode', country: 'country' };

function showApiErrors(e) {
  if (e instanceof ApiError && e.errors.length) alertList('Please correct the following', 'The form could not be saved:', e.errors);
  else toast(e.message || 'Sorry, something went wrong.', 'error');
}

/** Operations Manager approval and Admin confirmation status (read-only), as shown on the Power Apps form. */
function approvalsPanel({ master: m }) {
  const om = m.FM01AOMApprovalStatus, admin = m.FM01AApprovalStatus;
  const omText = om === 'Approved'
    ? `This opportunity has been approved by ${m.FM01AOMApprovedBy ?? ''} on the ${fmtDate(m.FM01AOMApprovedDate)} with the following recommendations: ${m.FM01AOMRecommendations ?? ''}`
    : om === 'Declined'
      ? `This opportunity has been declined by the Operations Manager with the following comments. Please contact your OM for further details: ${m.FM01AOMRecommendations ?? ''}`
      : 'This opportunity is awaiting for Operations Manager Approval. Please contact your OM for further details';
  const adminText = om === 'Declined' ? "This request doesn't require admin approval as it was declined by the OM."
    : admin === 'Approved' ? `The opportunity has been setup within Synergy by ${m.FM01AApprovedBy ?? ''} and project directories have been created on the ${fmtDate(m.FM01AApprovedDate)}.`
      : om === 'Approved' ? 'This form is awaiting Admin confirmation and project setup within Synergy.'
        : 'The opportunity is awaiting OM Approval before admin confirmation and project setup within Synergy';
  return h('section', { class: 'form-section' }, h('h2', {}, 'Approvals & Confirmation'),
    h('div', { class: 'status-panel' }, h('p', {}, h('strong', {}, 'Operations Manager Approval: '), omText),
      h('p', { style: { marginBottom: 0 } }, h('strong', {}, 'Admin Confirmation: '), adminText)));
}

const COUNTRIES = ['Australia', 'New Zealand', 'Papua New Guinea', 'Indonesia', 'Philippines', 'Laos', 'Vietnam', 'Cambodia', 'Singapore', 'India',
  'Mongolia', 'Kazakhstan', 'Armenia', 'Georgia', 'Saudi Arabia', 'Oman', 'Jordan', 'United Arab Emirates', 'Iran', 'Turkey', 'Morocco', 'Tunisia',
  'Burkina Faso', 'Gabon', 'Angola', 'South Africa', 'Chile', 'Peru', 'Colombia', 'Brazil', 'Mexico', 'Dominican Republic', 'Canada', 'United States',
  'United Kingdom', 'France', 'Germany', 'Greece', 'Poland', 'Switzerland', 'Monaco', 'Hong Kong SAR China', 'New Caledonia', 'Cayman Islands', 'Afghanistan'];
