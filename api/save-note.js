const { json, readJson, safeId, requireBlobToken } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Use POST to save a notebook entry.' });
  }
  if (!requireBlobToken(res)) return;

  try {
    const body = await readJson(req, 250000);
    const week = safeId(body.week, 'week');
    const student = safeId(body.student, 'student');
    const entry = {
      savedAt: new Date().toISOString(),
      week,
      student: body.student || 'unknown',
      data: body.data || {}
    };

    const { put } = await import('@vercel/blob');
    const pathname = `teacher-notes/${week}/${student}-${Date.now()}.json`;
    await put(pathname, JSON.stringify(entry, null, 2), {
      access: 'private',
      contentType: 'application/json; charset=utf-8',
      allowOverwrite: false
    });

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, error.statusCode || 400, {
      error: error.message || 'Could not save the notebook entry.'
    });
  }
};
