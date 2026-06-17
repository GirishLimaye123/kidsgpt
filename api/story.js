const { json, requireBlobToken } = require('./_shared');

function validSlug(value) {
  return /^story-[a-f0-9]{10}$/.test(String(value || ''));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Use GET to open a story.' });
  }
  if (!requireBlobToken(res)) return;

  const slug = String(req.query.slug || '');
  if (!validSlug(slug)) return json(res, 404, { error: 'Story not found.' });

  try {
    const { list } = await import('@vercel/blob');
    const result = await list({ prefix: `stories/${slug}/index.html`, limit: 1 });
    const blob = result.blobs && result.blobs[0];
    if (!blob) return json(res, 404, { error: 'Story not found.' });

    const upstream = await fetch(blob.url);
    if (!upstream.ok) return json(res, 404, { error: 'Story not found.' });
    const html = await upstream.text();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Security-Policy',
      [
        'sandbox allow-scripts allow-popups',
        "default-src 'none'",
        "img-src data: https: blob:",
        "style-src 'unsafe-inline'",
        "script-src 'unsafe-inline'",
        "font-src https: data:",
        "media-src none",
        "connect-src none",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
      ].join('; ')
    );
    res.end(html);
  } catch (error) {
    return json(res, 500, { error: 'Could not open this story yet.' });
  }
};
