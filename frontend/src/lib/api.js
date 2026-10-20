// Thin API client: attaches the bearer token, unwraps the { success, data, meta } envelope and throws ApiError on failure.
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + '/api/v1';
const TOKEN_KEY = 'cpms.token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Something went wrong');
    this.status = status; this.code = code; this.details = details;
  }
  /** field -> message map for form validation errors (zod details: [{path, message}]) */
  get fieldErrors() {
    const out = {};
    if (Array.isArray(this.details)) for (const d of this.details) if (d?.path && !out[d.path]) out[d.path] = d.message;
    return out;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

function qs(query) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') p.append(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function raw(method, path, { body, query, form, signal } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs(query)}`, { method, headers, body: payload, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  return res;
}

async function request(method, path, opts = {}) {
  const res = await raw(method, path, opts);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok || json?.success === false) {
    const err = new ApiError(res.status, json?.error?.code, json?.error?.message || `Request failed (${res.status})`, json?.error?.details);
    if (res.status === 401 && tokenStore.get() && !opts.noAuthRedirect) onUnauthorized(err);
    throw err;
  }
  return { data: json?.data, meta: json?.meta };
}

export const api = {
  get: (p, query, o) => request('GET', p, { query, ...o }),
  post: (p, body, o) => request('POST', p, { body: body ?? {}, ...o }),
  put: (p, body, o) => request('PUT', p, { body: body ?? {}, ...o }),
  del: (p, o) => request('DELETE', p, o),
  upload: (p, file, fields = {}, { method = 'POST', query, field = 'file' } = {}) => {
    const form = new FormData();
    form.append(field, file);
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, v);
    return request(method, p, { form, query });
  },
};

/** Fetch a protected file as a blob (files are private and need the bearer token). */
export async function fetchBlob(path, query) {
  const res = await raw('GET', path, { query });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* ignore */ }
    throw new ApiError(res.status, 'DOWNLOAD_FAILED', msg);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : null };
}

export async function downloadFile(path, fallbackName, query) {
  const { blob, filename } = await fetchBlob(path, query);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || fallbackName || 'download';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function openFile(path) {
  // Open the tab synchronously (inside the click) so pop-up blockers allow it, then point it at the downloaded blob.
  const win = window.open('', '_blank');
  try {
    const { blob } = await fetchBlob(path);
    const url = URL.createObjectURL(blob);
    if (win) { win.location.href = url; } else { window.location.href = url; }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { win?.close(); throw e; }
}
