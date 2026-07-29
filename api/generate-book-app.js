const { json, readJson } = require('./_shared');

const DEFAULT_MODEL = 'gpt-5.6-terra';
const DEFAULT_CLASS_CODE = 'libraryhelper108';
const BOOK_VISION_URL = 'https://kidsgpt.vectorcraft.net/api/book-vision';
const MAX_HTML_CHARS = 180000;

function cleanText(value, max = 300) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function getOutputText(result) {
  if (typeof result.output_text === 'string') return result.output_text.trim();
  const chunks = [];
  for (const item of result.output || []) {
    for (const part of item.content || []) {
      if ((part.type === 'output_text' || part.type === 'text') && part.text) {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function extractHtml(text) {
  let html = String(text || '').trim();
  html = html
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const doctype = html.search(/<!doctype\s+html>/i);
  const end = html.toLowerCase().lastIndexOf('</html>');
  if (doctype >= 0 && end > doctype) html = html.slice(doctype, end + 7);

  if (!/^<!doctype\s+html>/i.test(html) || !/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    const error = new Error('The model did not return one complete HTML file. Please try again.');
    error.statusCode = 502;
    throw error;
  }
  if (html.length > MAX_HTML_CHARS) {
    const error = new Error('The generated app is too large. Try a simpler design.');
    error.statusCode = 502;
    throw error;
  }
  return html;
}

function validateHtml(html) {
  const blocked = [
    [/<script\b[^>]*\bsrc\s*=/i, 'The generated app tried to load an outside script.'],
    [/<iframe\b/i, 'The generated app tried to add an embedded outside page.'],
    [/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, 'The generated app tried to redirect the page.'],
    [/\beval\s*\(/i, 'The generated app used unsafe code.'],
    [/\bnew\s+Function\s*\(/i, 'The generated app used unsafe code.'],
    [/\bdocument\.cookie\b/i, 'The generated app tried to read browser cookies.'],
    [/\blocalStorage\b/i, 'The generated app tried to store cover photos in the browser.']
  ];
  for (const [pattern, message] of blocked) {
    if (pattern.test(html)) {
      const error = new Error(`${message} Please generate again.`);
      error.statusCode = 502;
      throw error;
    }
  }

  const urls = html.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];
  const unexpected = urls.filter(url => url.replace(/[.,;]+$/, '') !== BOOK_VISION_URL);
  if (unexpected.length) {
    const error = new Error('The generated app tried to contact an unexpected website. Please generate again.');
    error.statusCode = 502;
    throw error;
  }

  const required = [
    [new RegExp(BOOK_VISION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'the KIDSGPT book helper'],
    [/libraryhelper108/i, 'the classroom code'],
    [/type\s*=\s*["']file["']/i, 'a photo chooser'],
    [/\bmultiple\b/i, 'the three-cover chooser'],
    [/\bfetch\s*\(/i, 'the backend request'],
    [/\bresponse\s*\.\s*json\s*\(/i, 'the response reader']
  ];
  for (const [pattern, label] of required) {
    if (!pattern.test(html)) {
      const error = new Error(`The generated app is missing ${label}. Please generate again.`);
      error.statusCode = 502;
      throw error;
    }
  }

  const styleText = (html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
  const fileInputRules = styleText.match(/(?:input\s*\[\s*type\s*=\s*["']?file["']?\s*\]|#[a-z0-9_-]*(?:file|cover)[a-z0-9_-]*)\s*\{[^}]*\}/gi) || [];
  const hiddenInput = fileInputRules.some(rule =>
    /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|clip\s*:|width\s*:\s*1px|height\s*:\s*1px/i.test(rule)
  );
  if (hiddenInput) {
    const error = new Error('The generated app hid the real photo chooser. Please generate again.');
    error.statusCode = 502;
    throw error;
  }
  return html;
}

function designFromBody(body) {
  return {
    appName: cleanText(body.appName, 80) || 'My Book Matchmaker',
    audience: cleanText(body.audience, 160) || 'Kids choosing a book',
    readerWants: cleanText(body.readerWants, 300) || 'Something fun and adventurous',
    visualStyle: cleanText(body.visualStyle, 100) || 'Colorful comic-book lab',
    colors: cleanText(body.colors, 100) || 'Teal and yellow',
    personality: cleanText(body.personality, 100) || 'Cheerful and encouraging',
    specialFeature: cleanText(body.specialFeature, 300) || 'Explain every recommendation'
  };
}

function buildRequestPrompt(design, revision, currentHtml) {
  const outcome = [
    'Create one polished, standalone HTML app for an 11-year-old student builder.',
    'The app lets a visitor upload 1 to 3 book-cover photos and uses the KIDSGPT backend to recommend one book.',
    '',
    'Student design:',
    `- App name: ${design.appName}`,
    `- Audience: ${design.audience}`,
    `- Default reader request: ${design.readerWants}`,
    `- Visual style: ${design.visualStyle}`,
    `- Main colors: ${design.colors}`,
    `- Personality: ${design.personality}`,
    `- Special feature: ${design.specialFeature}`
  ];

  const appContract = [
    '',
    'Success criteria:',
    '- Return exactly one complete HTML document, starting with <!doctype html> and ending with </html>.',
    '- Put all CSS and JavaScript inside the file. Use no external libraries, fonts, images, scripts, iframes, or build tools.',
    '- Make it playful and intentionally designed, with a clear visual hierarchy and responsive phone/laptop layout.',
    '- Include a large, visible input type="file" with accept="image/png,image/jpeg,image/webp" and multiple.',
    '- Keep the actual native file input visible and clickable. Do not hide it, clip it, shrink it to 1px, make it transparent, or rely only on a styled label or custom button to open the picker.',
    '- Let visitors choose 1 to 3 covers, preview them, clear them, and enter mood, genre, age group, reading difficulty, and a free-text request.',
    '- Resize each image in the browser with canvas: preserve aspect ratio, maximum side 900 pixels, JPEG quality 0.72.',
    '- Include one clear Find my book button. Disable it while waiting and show loading, success, and friendly error states.',
    '- Send a POST fetch request to https://kidsgpt.vectorcraft.net/api/book-vision with Content-Type application/json.',
    '- The JSON body must contain classCode "libraryhelper108", images as resized data URLs, reader, preference, and notes.',
    '- Run const response = await fetch(...), then const result = await response.json(). If response.ok is false, show result.error.',
    '- Read books from result.data.books and the pick from result.data.recommendation.',
    '- Show the main recommendation, reason, who might like it, and readable cards for every detected book.',
    '- Show title, author, genre, moods, themes, age group, reading level, confidence, fact-check notes, and safety flags when available.',
    '- Insert model-returned text with textContent, or escape it before using innerHTML.',
    '- Do not use eval, new Function, document.cookie, localStorage, navigation, forms that submit, or any URL except the KIDSGPT endpoint.',
    '- Include a privacy reminder: covers only; no faces, names, library cards, addresses, or private papers.',
    '- Include an AI reminder: a human must check titles, authors, and age suitability.',
    '- Do not leave TODOs, fake data, placeholders, missing functions, or instructions for the student to finish coding.',
    '',
    'Before returning, silently check the chooser, previews, resizing, fetch request, loading state, errors, result rendering, reset control, keyboard access, and mobile layout.',
    'Return only the HTML. Do not use Markdown fences or add an explanation.'
  ];

  if (!revision) return outcome.concat(appContract).join('\n');

  return [
    ...outcome,
    '',
    `Requested improvement: ${revision}`,
    '',
    'Revise the complete working HTML below. Preserve every working feature and the exact KIDSGPT backend contract.',
    appContract.join('\n'),
    '',
    'Current HTML:',
    currentHtml
  ].join('\n');
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured on the backend yet.');
    error.statusCode = 501;
    throw error;
  }

  const model = process.env.BOOK_APP_MODEL || DEFAULT_MODEL;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: [
        'You create reliable, self-contained educational web apps.',
        'Follow the output contract exactly.',
        'Preserve the student design choices.',
        'Safety and a working end-to-end app outrank decoration.'
      ].join('\n'),
      input: prompt,
      reasoning: { effort: 'low' },
      text: { verbosity: 'medium' },
      max_output_tokens: 24000
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error && result.error.message ? result.error.message : 'OpenAI request failed.';
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return { model, html: validateHtml(extractHtml(getOutputText(result))) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Use POST to generate a Book Matchmaker.' });
  }

  try {
    const body = await readJson(req, 260000);
    const expectedCode = process.env.BOOK_VISION_CLASS_CODE || process.env.LIBRARY_CHAT_CLASS_CODE || DEFAULT_CLASS_CODE;
    if (String(body.classCode || '') !== expectedCode) {
      return json(res, 401, { error: 'Wrong class code.' });
    }

    const revision = cleanText(body.revision, 500);
    const currentHtml = String(body.currentHtml || '').trim().slice(0, MAX_HTML_CHARS);
    if (revision && !currentHtml) {
      return json(res, 400, { error: 'Generate the first app before asking for a change.' });
    }

    const design = designFromBody(body);
    const generated = await callOpenAI(buildRequestPrompt(design, revision, currentHtml));
    return json(res, 200, {
      ok: true,
      model: generated.model,
      html: generated.html,
      revised: Boolean(revision)
    });
  } catch (error) {
    return json(res, error.statusCode || 500, {
      error: error.message || 'The app generator is unavailable right now.'
    });
  }
};
