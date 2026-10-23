import app from '../src/app.js';

export default function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const targetPath = requestUrl.searchParams.get('__path');

  if (!targetPath || !/^\/api\/v1(?:\/|$)/.test(targetPath) || targetPath.includes('..')) {
    return res.status(400).json({ success: false, error: { message: 'Invalid API route' } });
  }

  requestUrl.searchParams.delete('__path');
  req.url = `${targetPath}${requestUrl.search}`;
  return app(req, res);
}
