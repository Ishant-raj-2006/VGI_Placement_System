export const ok = (res, data = null, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
export const created = (res, data, meta) => ok(res, data, meta, 201);
export const noContent = (res) => res.status(204).end();
