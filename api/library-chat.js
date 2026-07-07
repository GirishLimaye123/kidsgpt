const { json, readJson } = require('./_shared');

const BPL_LOCATION_URL = 'https://bpl.bc.ca/people-help/locations-hours/bob-prittie-metrotown';
const DEFAULT_MODEL = 'gpt-5-nano';
const DEFAULT_CLASS_CODE = 'libraryhelper108';
const MAX_QUESTION_CHARS = 500;
const MAX_CONFIG_CHARS = 1600;

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

function cleanText(value, max = 300) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanList(value, maxItems = 6, maxItemChars = 160) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanText(item, maxItemChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactConfig(botConfig = {}) {
  const config = {
    botName: cleanText(botConfig.botName, 80) || 'Library Helper',
    creatorName: cleanText(botConfig.creatorName, 80),
    personality: cleanText(botConfig.personality, 300),
    greeting: cleanText(botConfig.greeting, 220),
    specialStyle: cleanText(botConfig.specialStyle, 220),
    etiquette: cleanList(botConfig.etiquette, 8, 180)
  };
  const text = JSON.stringify(config);
  return text.length > MAX_CONFIG_CHARS ? text.slice(0, MAX_CONFIG_CHARS) : text;
}

async function fetchLibraryFacts() {
  const response = await fetch(BPL_LOCATION_URL, {
    headers: {
      'User-Agent': 'KIDSGPT classroom library helper (https://kidsgpt.vectorcraft.net)'
    }
  });
  if (!response.ok) throw new Error('Could not fetch the library facts page.');
  const html = await response.text();
  const text = stripHtml(html);
  return text.slice(0, 9000);
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

async function callOpenAI({ question, language, botConfigText, libraryFacts }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured on the backend yet.');
    error.statusCode = 501;
    throw error;
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = [
    'You are a safe classroom library-helper chatbot.',
    'Use only the approved library facts provided by the backend.',
    'Follow the student bot style unless it conflicts with safety.',
    'Do not pretend to be a real librarian, library employee, real person, celebrity, or fictional character.',
    'Do not invent library policies, prices, dates, rooms, phone numbers, URLs, or event details.',
    'If the facts do not answer the question, say to ask library staff or check the official Burnaby Public Library website.',
    'Reply in the selected language.',
    'Keep answers short, friendly, and useful.'
  ].join('\n');

  const input = [
    `Selected language: ${language}`,
    `Student bot style JSON: ${botConfigText}`,
    `Approved live library facts from ${BPL_LOCATION_URL}:`,
    libraryFacts,
    `Visitor question: ${question}`
  ].join('\n\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 900
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
    answer: getOutputText(result) || 'I could not make an answer from the library facts.',
    model
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
    return json(res, 405, { error: 'Use POST to chat with Library Helper.' });
  }

  try {
    const body = await readJson(req, 30000);
    const expectedCode = process.env.LIBRARY_CHAT_CLASS_CODE || DEFAULT_CLASS_CODE;
    if (String(body.classCode || '') !== expectedCode) {
      return json(res, 401, { error: 'Wrong class code.' });
    }

    const question = cleanText(body.question, MAX_QUESTION_CHARS + 1);
    const language = cleanText(body.language, 60) || 'English';
    if (!question) return json(res, 400, { error: 'Ask a question first.' });
    if (question.length > MAX_QUESTION_CHARS) {
      return json(res, 413, { error: `Question is too long. Keep it under ${MAX_QUESTION_CHARS} characters.` });
    }

    const botConfigText = compactConfig(body.botConfig || {});
    const libraryFacts = await fetchLibraryFacts();
    const result = await callOpenAI({ question, language, botConfigText, libraryFacts });

    return json(res, 200, {
      ok: true,
      answer: result.answer,
      language,
      model: result.model,
      source: BPL_LOCATION_URL
    });
  } catch (error) {
    return json(res, error.statusCode || 500, {
      error: error.message || 'Library Helper is unavailable right now.'
    });
  }
};
