import Groq from 'groq-sdk';
import './env.js';
import logger from './logger.js';

// llama-3.3-70b-versatile was retired from Groq's lineup; verified against
// the live /v1/models list before picking this replacement.
const MODEL = 'openai/gpt-oss-120b';

function loadKeys() {
  const raw = process.env.GROQ_API_KEYS || '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

const ALL_KEYS = loadKeys();

// Role pools — each pool gets its own slice of keys so a burst of traffic on
// one kind of call (e.g. answer analysis) doesn't starve a different kind
// (e.g. question generation) of its own fallback capacity.
const POOLS = {
  questions: ALL_KEYS.slice(0, 3), // generateDynamicQuestion, generateFollowUpWithAI
  analysis: ALL_KEYS.slice(3, 6), // generateAnalysisWithAI, generateSessionSummaryWithAI
  docs: ALL_KEYS.slice(6, 9) // analyzeResumeConsistency, generateATSAnalysis
};

const clients = new Map();
function clientFor(key) {
  // maxRetries: 0 — we already loop across every key in the pool ourselves;
  // the SDK's own default internal retries would multiply that into several
  // HTTP round-trips per key, which is exactly what made a Gemini outage
  // (every session-creation call falling through to Groq) badly slow.
  if (!clients.has(key)) clients.set(key, new Groq({ apiKey: key, maxRetries: 0, timeout: 8000 }));
  return clients.get(key);
}

const cursors = { questions: 0, analysis: 0, docs: 0 };

export function hasGroqPool(pool) {
  return (POOLS[pool] || []).length > 0;
}

// Loops through every key in the pool (starting from that pool's round-robin
// cursor) until one succeeds or all are exhausted. Returns null on total
// failure — callers already have a null-safe fallback path for the Gemini
// call this backs up, so this mirrors that contract rather than throwing.
export async function groqChat(pool, { system, prompt, json = false, temperature = 0.4 }) {
  // The test suite already exercises the real Gemini call path (pre-existing,
  // unrelated to this fallback) — adding a second real network provider on
  // top of that turns every Gemini failure into two slow round-trips across
  // many concurrently-running test files, which was destabilizing the whole
  // suite under worker-pool contention. Fallback is a production concern.
  if (process.env.NODE_ENV === 'test') return null;

  const keys = POOLS[pool] || [];
  if (!keys.length) return null;

  let lastErr = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (cursors[pool] + attempt) % keys.length;
    const key = keys[idx];
    try {
      const client = clientFor(key);
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {})
      });

      cursors[pool] = (idx + 1) % keys.length;
      return response.choices?.[0]?.message?.content || '';
    } catch (err) {
      lastErr = err;
      logger.warn('groq_key_failed', { pool, keyIndex: idx, message: err?.message });
    }
  }

  logger.warn('groq_pool_exhausted', { pool, message: lastErr?.message });
  return null;
}
