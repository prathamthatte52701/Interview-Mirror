import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock }
  }))
}));

async function loadAiProvider(apiKey) {
  vi.resetModules();
  // Setting to '' (not deleting) stops env.js's dotenv.config() from
  // reloading a real key from .env — dotenv skips keys already present.
  process.env.GEMINI_API_KEY = apiKey || '';
  return import('../lib/aiProvider.js');
}

const transcript = [
  { question: 'Tell me about your role at Acme Corp.', answer: 'I led the backend team of 3 engineers for 2 years.' }
];

function jsonResponse(payload) {
  return { text: JSON.stringify(payload) };
}

beforeEach(() => {
  generateContentMock.mockReset();
});

describe('analyzeResumeConsistency', () => {
  it('returns null without calling the AI when no resume is uploaded', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider('test-key');
    const result = await analyzeResumeConsistency('', transcript);
    expect(result).toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('returns null without calling the AI when AI mode is the deterministic fallback (no Gemini key)', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider(null);
    const result = await analyzeResumeConsistency('Some resume text', transcript);
    expect(result).toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('parses a mocked response with 2 valid flags', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider('test-key');
    generateContentMock.mockResolvedValueOnce(jsonResponse({
      flags: [
        { questionIndex: 0, resumeLine: 'Led team of 5 engineers', answerExcerpt: 'led the backend team of 3 engineers', confidence: 95, explanation: 'Team size differs.' },
        { questionIndex: 0, resumeLine: 'Worked at Acme for 5 years', answerExcerpt: 'for 2 years', confidence: 92, explanation: 'Duration differs.' }
      ]
    }));

    const result = await analyzeResumeConsistency('Resume text', transcript);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      resumeLine: 'Led team of 5 engineers',
      answerExcerpt: 'led the backend team of 3 engineers',
      confidence: 95
    });
  });

  it('returns null gracefully on a malformed/unparseable AI response, without throwing', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider('test-key');
    generateContentMock.mockResolvedValueOnce({ text: 'not valid json {{{' });

    await expect(analyzeResumeConsistency('Resume text', transcript)).resolves.toBeNull();
  });

  it('truncates a response with more than 3 flags down to 3', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider('test-key');
    generateContentMock.mockResolvedValueOnce(jsonResponse({
      flags: [
        { questionIndex: 0, resumeLine: 'A', answerExcerpt: 'a', confidence: 99, explanation: 'x' },
        { questionIndex: 0, resumeLine: 'B', answerExcerpt: 'b', confidence: 98, explanation: 'x' },
        { questionIndex: 0, resumeLine: 'C', answerExcerpt: 'c', confidence: 97, explanation: 'x' },
        { questionIndex: 0, resumeLine: 'D', answerExcerpt: 'd', confidence: 96, explanation: 'x' }
      ]
    }));

    const result = await analyzeResumeConsistency('Resume text', transcript);
    expect(result).toHaveLength(3);
  });

  it('discards a flag with confidence below 90 even though the model included it — server-side floor', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider('test-key');
    generateContentMock.mockResolvedValueOnce(jsonResponse({
      flags: [
        { questionIndex: 0, resumeLine: 'Kept', answerExcerpt: 'kept', confidence: 95, explanation: 'x' },
        { questionIndex: 0, resumeLine: 'Dropped', answerExcerpt: 'dropped', confidence: 89, explanation: 'weak' }
      ]
    }));

    const result = await analyzeResumeConsistency('Resume text', transcript);
    expect(result).toHaveLength(1);
    expect(result[0].resumeLine).toBe('Kept');
    expect(result.some((f) => f.resumeLine === 'Dropped')).toBe(false);
  });

  it('returns an empty array, not null, when the AI finds zero contradictions', async () => {
    const { analyzeResumeConsistency } = await loadAiProvider('test-key');
    generateContentMock.mockResolvedValueOnce(jsonResponse({ flags: [] }));

    const result = await analyzeResumeConsistency('Resume text', transcript);
    expect(result).toEqual([]);
    expect(result).not.toBeNull();
  });
});
