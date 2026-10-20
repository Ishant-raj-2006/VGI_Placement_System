// Blocks NoSQL operator injection ({"email": {"$ne": null}}, ?role[$ne]=x, "a.b" path keys).
// Keys starting with "$" or containing "." are removed from body, query and params before they reach any handler.
function clean(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

export function sanitizeInput(req, _res, next) {
  if (req.body) req.body = clean(req.body);
  if (req.query) {
    const q = clean(req.query);
    for (const k of Object.keys(req.query)) delete req.query[k];
    Object.assign(req.query, q);
  }
  if (req.params) req.params = clean(req.params);
  next();
}

export { clean as _clean };
