// ─── Delivery Metrics (filler words + speaking pace) ───────────────────────────
export const FILLER_WORDS = [
  'um', 'uh', 'umm', 'uhh', 'like', 'you know', 'i mean', 'sort of',
  'kind of', 'basically', 'actually', 'so', 'right', 'okay so'
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FILLER_REGEXES = FILLER_WORDS.map(
  (phrase) => new RegExp(`\\b${escapeRegex(phrase).replace(/\s+/g, '\\s+')}\\b`, 'gi')
);

function countFillerWords(text) {
  const lower = (text || '').toLowerCase();
  return FILLER_REGEXES.reduce((count, regex) => count + (lower.match(regex) || []).length, 0);
}

function countWords(text) {
  return (text || '').trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function wpm(wordCount, responseSeconds) {
  if (!wordCount || !responseSeconds) return 0;
  return Math.round(wordCount / (responseSeconds / 60));
}

export function computeDeliveryMetrics(transcript = []) {
  const entries = transcript || [];

  let totalFillers = 0;
  let totalWords = 0;
  let totalSeconds = 0;

  const perAnswer = entries.map((entry, questionIndex) => {
    const text = entry.answer || '';
    const wordCount = countWords(text);
    const fillerCount = countFillerWords(text);
    const responseSeconds = entry.responseSeconds || 0;

    totalFillers += fillerCount;
    totalWords += wordCount;
    totalSeconds += responseSeconds;

    return { questionIndex, fillerCount, wpm: wpm(wordCount, responseSeconds) };
  });

  return {
    fillerWordCount: totalFillers,
    fillerWordRate: totalWords ? +((totalFillers / totalWords) * 100).toFixed(1) : 0,
    averageWpm: wpm(totalWords, totalSeconds),
    perAnswer
  };
}
