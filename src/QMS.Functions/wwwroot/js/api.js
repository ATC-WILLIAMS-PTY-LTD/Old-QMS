// Thin fetch wrapper for the Azure Functions API.

export class ApiError extends Error {
  constructor(status, errors) {
    super(errors?.join('\n') || `Request failed (${status})`);
    this.status = status;
    this.errors = errors ?? [];
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.errors ?? (data?.error ? [data.error] : null));
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
};

export const api = {
  me: () => cached('me', () => request('GET', 'api/me')),
  projects: (params) => request('GET', `api/projects${qs(params)}`),
  homeOptions: (params) => request('GET', `api/home/options${qs(params)}`),
  status: (id) => request('GET', `api/projects/${id}/status`),
  form: (id, code) => request('GET', `api/projects/${id}/forms/${code}`),
  lookups: () => cached('lookups', () => request('GET', 'api/lookups')),
  staff: () => cached('staff', () => request('GET', 'api/staff')),
  clients: () => request('GET', 'api/clients'),
  client: (id) => request('GET', `api/clients/${id}`),
  createClient: (body) => request('POST', 'api/clients', body),
  createContact: (clientId, body) => request('POST', `api/clients/${clientId}/contacts`, body),
  sites: () => cached('sites', () => request('GET', 'api/sites')),
  siteCheck: (name, code) => request('GET', `api/sites/check${qs({ name, code })}`),
  related: (number, sub) => request('GET', `api/projects/related${qs({ number, sub })}`),
  createJob: (body) => request('POST', 'api/jobs', body),
  job: (id) => request('GET', `api/jobs/${id}`),
  adminSummary: () => request('GET', 'api/admin/summary'),
  adminRegister: (name, params) => request('GET', `api/admin/registers/${name}${qs(params)}`),
  adminMaster: (id) => request('GET', `api/admin/master/${id}`),
  updateAdminMaster: (id, body) => request('PUT', `api/admin/master/${id}`, body),
  adminRecord: (table, id) => request('GET', `api/admin/records/${table}/${id}`),
  updateAdminRecord: (table, id, body) => request('PUT', `api/admin/records/${table}/${id}`, body),
  adminForms: () => request('GET', 'api/admin/forms'),
  adminFormRegister: (code, params) => request('GET', `api/admin/forms/${code}${qs(params)}`),
  adminResponsibility: () => request('GET', 'api/admin/responsibility'),
  createResponsibility: (body) => request('POST', 'api/admin/responsibility', body),
  updateResponsibility: (id, body) => request('PUT', `api/admin/responsibility/${id}`, body),
  deleteResponsibility: (id) => request('DELETE', `api/admin/responsibility/${id}`),
  invalidate: (key) => cache.delete(key),
};
