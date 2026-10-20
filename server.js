/* WebLab server.js
 * Express server that serves the playground UI and proxies AI-tutor chat
 * requests to a green-pt (OpenAI-compatible) backend.
 *
 * Environment variables (all set on Railway under Variables):
 *   PORT              - set automatically by Railway
 *   GREENPT_API_KEY   - your green-pt API key (required for the AI tutor)
 *   GREENPT_BASE_URL  - optional, default https://api.greenpt.ai/v1
 *   GREENPT_MODEL     - optional, default glm-5.3
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const GREENPT_BASE_URL = (process.env.GREENPT_BASE_URL || 'https://api.greenpt.ai/v1').replace(/\/+$/, '');
const GREENPT_API_KEY = process.env.GREENPT_API_KEY || '';
const GREENPT_MODEL = process.env.GREENPT_MODEL || 'glm-5.3';

const MAX_FILE_CHARS = 8000;   // per-file code context sent to the model
const MAX_HISTORY = 12;        // recent chat messages sent to the model

// ---------------------------------------------------------------------------
// Middleware

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve JSZip straight from node_modules so the app has zero CDN deps.
// (res.sendFile misbehaves with absolute paths on Express 5.3; streams work.)
app.get('/vendor/jszip.min.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  fs.createReadStream(path.join(__dirname, 'node_modules', 'jszip', 'dist', 'jszip.min.js')).pipe(res);
});

// ---------------------------------------------------------------------------
// Tiny in-memory rate limiter (40 requests / minute / IP) for the chat API.

const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(ip) || []).filter((t) => t > windowStart);
  if (list.length >= 40) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // safety valve
  return false;
}

// ---------------------------------------------------------------------------
// AI tutor

const SYSTEM_PROMPT = [
  'You are the AI Tutor inside WebLab, a live web-coding playground for high-school students',
  'who are learning HTML, CSS, and JavaScript.',
  '',
  'Style rules:',
  '- Friendly, encouraging, and clear. Never condescending.',
  '- Keep answers short and focused. Prefer small, copy-pasteable examples over long lectures.',
  '- When showing code, always use fenced code blocks with the language: ```html, ```css, or ```javascript.',
  '- When fixing a bug, explain the "why" in one or two simple sentences, not just the corrected code.',
  '- If the student has not written much code yet, suggest a fun next step they can build.',
  '- If a question is unrelated to web development, you may answer very briefly, then steer back to their project.',
  '',
  'You will receive the student\'s current project files (index.html, style.css, script.js) as context.',
  'Use them so your help is specific to their actual code. Do not rewrite the whole project unless asked.'
].join('\n');

function buildCodeContext(code) {
  const clip = (s) => {
    s = String(s || '');
    return s.length > MAX_FILE_CHARS ? s.slice(0, MAX_FILE_CHARS) + '\n/* …truncated… */' : s;
  };
  return [
    '[Teacher note: this is the student\'s current project code, for context.]',
    '=== index.html ===', clip(code.html),
    '=== style.css ===', clip(code.css),
    '=== script.js ===', clip(code.js)
  ].join('\n');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(GREENPT_API_KEY), model: GREENPT_MODEL });
});

app.post('/api/chat', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages too fast — take a breath and try again in a minute. 🐢' });
  }

  if (!GREENPT_API_KEY) {
    return res.status(503).json({
      error: 'The AI tutor is not configured on this server yet.',
      hint: 'The teacher/admin must set the GREENPT_API_KEY environment variable (e.g. in Railway → Variables).'
    });
  }

  const { messages = [], code = {} } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No message sent.' });
  }

  // Sanitize + cap history: keep only user/assistant turns, strings only.
  const history = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  if (!lastUser) {
    return res.status(400).json({ error: 'No message to send.' });
  }

  const payloadMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildCodeContext(code) + '\n\n[End of project code. Now the conversation begins.]' },
    ...history
  ];

  try {
    const upstream = await fetch(GREENPT_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GREENPT_API_KEY
      },
      body: JSON.stringify({
        model: GREENPT_MODEL,
        messages: payloadMessages,
        temperature: 0.7,
        max_tokens: 1400
      }),
      signal: AbortSignal.timeout(90_000)
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 400);
      console.error('green-pt upstream error', upstream.status, detail);
      return res.status(502).json({
        error: 'The AI tutor service had a problem (' + upstream.status + '). Try again in a moment.'
      });
    }

    const data = await upstream.json();
    const reply = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;

    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({ error: 'The AI tutor returned an empty answer. Try asking again.' });
    }

    res.json({ reply: reply.trim() });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error('chat proxy failure:', err && err.message);
    res.status(502).json({
      error: timedOut
        ? 'The AI tutor took too long to answer. Try a shorter question.'
        : 'Could not reach the AI tutor service. Check with your teacher.'
    });
  }
});

app.listen(PORT, () => {
  console.log('WebLab running on port ' + PORT +
    (GREENPT_API_KEY ? ' (AI tutor: ' + GREENPT_MODEL + ')' : ' (AI tutor NOT configured)'));
});
