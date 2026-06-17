const crypto = require('crypto');

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJson(req, maxBytes = 700000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      const error = new Error('That upload is too large for class today.');
      error.statusCode = 413;
      throw error;
    }
  }
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function safeId(value, fallback = 'item') {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

function randomSlug(prefix = 'story') {
  return `${prefix}-${crypto.randomBytes(5).toString('hex')}`;
}

function originFromRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'kidsgpt.vectorcraft.net';
  return `${proto}://${host}`;
}

function requireBlobToken(res) {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  json(res, 501, {
    error: 'Backend storage is not configured yet. Connect a Vercel Blob store to this project.'
  });
  return false;
}

module.exports = {
  json,
  readJson,
  safeId,
  randomSlug,
  originFromRequest,
  requireBlobToken
};
