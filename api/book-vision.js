const { json, readJson } = require('./_shared');

const DEFAULT_MODEL = 'gpt-5-nano';
const DEFAULT_CLASS_CODE = 'libraryhelper108';
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 1500000;
const MAX_BODY_BYTES = 5200000;

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = new Set([
    'https://kidsgpt.vectorcraft.net',
    'http://localhost:3000',
    'http://localhost:5173',
    'null'
  ]);

  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kidsgpt.vectorcraft.net');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function cleanText(value, max = 500) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanImage(value) {
  const dataUrl = String(value || '').trim();
  if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl)) {
    const error = new Error('Use PNG, JPG, or WebP cover images.');
    error.statusCode = 400;
    throw error;
  }
  if (dataUrl.length > MAX_IMAGE_CHARS) {
    const error = new Error('One image is too large. Retake or choose a smaller photo.');
    error.statusCode = 413;
    throw error;
  }
  return dataUrl;
}

function getOutputText(result) {
  if (typeof result.output_text === 'string') return result.output_text.trim();
  const chunks = [];
  for (const item of result.output || []) {
    for (const part of item.content || []) {
      if (part.type === 'output_text' && part.text) chunks.push(part.text);
      if (part.type === 'text' && part.text) chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonText(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI did not return readable book data.');
  }
}

async function callOpenAI({ images, preference, reader, notes }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured on the backend yet.');
    error.statusCode = 501;
    throw error;
  }

  const model = process.env.BOOK_VISION_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const hasCovers = images.length > 0;
  const instructions = [
    'You are a safe classroom Book Matchmaker for 11-year-old builders.',
    hasCovers
      ? 'Use the uploaded book covers and student preferences. Recommend only from the uploaded books.'
      : 'No covers were uploaded. Recommend three real, well-known books from general knowledge that fit the student preferences, and choose one as the top recommendation.',
    'Do not invent exact plot details, titles, authors, awards, series names, or age ratings.',
    hasCovers
      ? 'If a cover detail is unclear, say "not visible" or mark it as an AI guess.'
      : 'Use only books whose title and author you know with high confidence. Mark genre, age group, and reading level as guidance that a human should check.',
    'Never identify people in images. If a face or private information appears, flag the safety issue.',
    'Never claim that a recommended book is available at the user\'s library.',
    'Return only compact JSON matching the requested shape.'
  ].join('\n');

  const content = [
    {
      type: 'input_text',
      text: [
        `Reader: ${reader}`,
        `What they want: ${preference}`,
        `Student notes: ${notes}`,
        `Mode: ${hasCovers ? 'choose from uploaded covers' : 'suggest from reader preferences only'}`,
        '',
        'Return JSON with this shape:',
        '{',
        '  "books": [',
        '    { "slot": 1, "title": "...", "author": "...", "genre": "...", "moods": ["..."], "themes": ["..."], "ageGroup": "...", "readingLevel": "...", "confidence": "high|medium|low", "factCheck": ["..."], "safetyFlags": ["..."] }',
        '  ],',
        '  "recommendation": { "slot": 1, "title": "...", "why": "...", "whoMightLikeIt": "...", "tryNextQuestion": "..." },',
        '  "filterIdeas": { "moods": ["..."], "genres": ["..."], "ageGroups": ["..."] },',
        '  "builderNote": "one short note for the student builder"',
        '}'
      ].join('\n')
    },
    ...images.map(image => ({ type: 'input_image', image_url: image, detail: 'low' }))
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: 'user', content }],
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 1800
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error && result.error.message ? result.error.message : 'OpenAI request failed.';
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return {
    model,
    data: parseJsonText(getOutputText(result))
  };
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return json(res, 405, { error: 'Use POST to analyze book covers.' });
  }

  try {
    const body = await readJson(req, MAX_BODY_BYTES);
    const expectedCode = process.env.BOOK_VISION_CLASS_CODE || process.env.LIBRARY_CHAT_CLASS_CODE || DEFAULT_CLASS_CODE;
    if (String(body.classCode || '') !== expectedCode) {
      return json(res, 401, { error: 'Wrong class code.' });
    }

    const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES).map(cleanImage) : [];

    const preference = cleanText(body.preference, 500) || 'Suggest a fun book for a kid reader.';
    const reader = cleanText(body.reader, 300) || 'A kid reader choosing a next book';
    const notes = cleanText(body.notes, 1000);
    const result = await callOpenAI({ images, preference, reader, notes });

    return json(res, 200, {
      ok: true,
      model: result.model,
      data: result.data
    });
  } catch (error) {
    return json(res, error.statusCode || 500, {
      error: error.message || 'Book Matchmaker is unavailable right now.'
    });
  }
};
