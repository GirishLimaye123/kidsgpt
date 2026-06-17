const {
  json,
  readJson,
  safeId,
  randomSlug,
  originFromRequest,
  requireBlobToken
} = require('./_shared');

function looksLikeHtml(html) {
  return /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Use POST to upload a story.' });
  }
  if (!requireBlobToken(res)) return;

  try {
    const body = await readJson(req, 700000);
    const html = String(body.html || '').trim();
    if (!html) return json(res, 400, { error: 'Upload or paste one HTML file first.' });
    if (html.length > 600000) return json(res, 413, { error: 'That story file is too large for class today.' });
    if (!looksLikeHtml(html)) return json(res, 400, { error: 'That does not look like a complete HTML file yet.' });

    const slug = randomSlug('story');
    const student = safeId(body.student, 'student');
    const title = String(body.title || 'Story deck').slice(0, 120);
    const { put } = await import('@vercel/blob');

    await put(`stories/${slug}/index.html`, html, {
      access: 'public',
      contentType: 'text/html; charset=utf-8',
      allowOverwrite: false
    });
    await put(`stories/${slug}/meta.json`, JSON.stringify({
      slug,
      title,
      student,
      uploadedAt: new Date().toISOString()
    }, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      allowOverwrite: false
    });

    return json(res, 200, {
      ok: true,
      slug,
      url: `${originFromRequest(req)}/share/${slug}`
    });
  } catch (error) {
    return json(res, error.statusCode || 400, {
      error: error.message || 'Could not upload the story.'
    });
  }
};
