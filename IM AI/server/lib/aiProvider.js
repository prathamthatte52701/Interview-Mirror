import { GoogleGenAI } from '@google/genai';
import './env.js';
import logger from './logger.js';
import { groqChat, hasGroqPool } from './groqProvider.js';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// True if Gemini is configured OR at least one Groq fallback pool has a key —
// callers use this to decide whether to attempt an AI call at all before
// falling back to the heuristic path. The actual Gemini-then-Groq ordering
// happens inside each function below.
export function hasAI() {
  return !!ai || hasGroqPool('questions') || hasGroqPool('analysis') || hasGroqPool('docs');
}

function stripJsonFence(text) {
  return String(text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
}

// ─── Dynamic Question Generation ──────────────────────────────────────────────
export async function generateDynamicQuestion({ role, difficulty, resumeText, jdText, askedQuestions = [], persona }) {
  const context = [];
  if (resumeText) context.push(`Candidate resume:\n${resumeText.slice(0, 800)}`);
  if (jdText) context.push(`Job description:\n${jdText.slice(0, 600)}`);
  const askedList = askedQuestions.slice(-5).join(' | ');

  const prompt = `You are a ${persona} conducting a ${difficulty} ${role} interview.
${context.join('\n')}
Previously asked questions: ${askedList || 'None yet'}

Generate ONE unique interview question that:
- Is appropriate for ${difficulty} difficulty
- Is relevant to the ${role} role
- Has NOT been asked before
- Feels natural and conversational
- If resume/JD is provided, makes it personalized

Return ONLY the question text, nothing else. No quotes, no numbering.`;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.85 }
      });
      return (response.text || '').trim();
    } catch (err) {
      logger.warn('ai_fallback', { fn: 'generateDynamicQuestion', message: err.message });
    }
  }

  const groqText = await groqChat('questions', { prompt, temperature: 0.85 });
  return groqText ? groqText.trim() : null;
}

// ─── Answer Analysis ───────────────────────────────────────────────────────────
export async function generateAnalysisWithAI({ answer, question, role, rubric, presenceSnapshot }) {
  const presenceContext = presenceSnapshot
    ? `Non-verbal presence data: Eye contact ${presenceSnapshot.eyeContact}%, Posture ${presenceSnapshot.posture}%, Attention ${presenceSnapshot.attention}%.`
    : '';

  const systemInstruction = `You are an expert ${role} interviewer and communication coach.
Analyze the candidate's answer thoroughly and return a JSON object.

${presenceContext}

Return ONLY valid JSON with this exact schema:
{
  "metrics": {
    "relevance": <0-10>,
    "clarity": <0-10>,
    "structure": <0-10>,
    "specificity": <0-10>,
    "confidence": <0-10>,
    "delivery": <0-10>,
    "roleFit": <0-10>,
    "overall": <0-10>
  },
  "confidenceScore": <0-100>,
  "toneScore": <0-100>,
  "eyeContactScore": <0-100>,
  "evidence": ["<specific observation about their answer>"],
  "strengths": ["<strength observed>"],
  "weaknesses": ["<weakness to improve>"],
  "improvements": ["<actionable improvement tip>"],
  "idealAnswer": "<A model 2-3 sentence answer that would score 9-10>",
  "rewrite": "<A stronger version of their specific answer>"
}`;

  const prompt = `Question: "${question}"
Candidate Answer: "${answer}"
Expected points: ${JSON.stringify(rubric?.expectedPoints || [])}`;

  function shape(result) {
    return {
      fillerCount: countFillers(answer),
      wordCount: (answer || '').split(/\s+/).filter(Boolean).length,
      coveredPoints: [],
      missingPoints: [],
      ...result
    };
  }

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.3
        }
      });

      const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return shape(JSON.parse(stripJsonFence(text)));
    } catch (err) {
      logger.warn('ai_fallback', { fn: 'generateAnalysisWithAI', message: err.message });
    }
  }

  try {
    const groqText = await groqChat('analysis', { system: systemInstruction, prompt, json: true, temperature: 0.3 });
    if (!groqText) return null;
    return shape(JSON.parse(stripJsonFence(groqText)));
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'generateAnalysisWithAI', provider: 'groq', message: err.message });
    return null;
  }
}

// ─── Follow-up Generation ──────────────────────────────────────────────────────
export async function generateFollowUpWithAI({ answer, analysis, persona, previousQuestion }) {
  const prompt = `You are a ${persona} interviewer.
The candidate just answered: "${previousQuestion}"
Their answer: "${answer}"
Weaknesses noted: ${(analysis?.weaknesses || []).join(', ')}

Generate ONE short, natural follow-up question (1-2 sentences max) to probe deeper or clarify a weakness.
Return ONLY the follow-up question. No quotes, no preamble.`;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.75 }
      });
      return (response.text || '').trim();
    } catch (err) {
      logger.warn('ai_fallback', { fn: 'generateFollowUpWithAI', message: err.message });
    }
  }

  const groqText = await groqChat('questions', { prompt, temperature: 0.75 });
  return groqText ? groqText.trim() : null;
}

// ─── Session Summary ───────────────────────────────────────────────────────────
export async function generateSessionSummaryWithAI({ transcript, role, candidateName }) {
  const qa = transcript.slice(0, 8).map((t, i) =>
    `Q${i + 1}: ${t.question}\nA: ${t.answer?.slice(0, 200)}`
  ).join('\n\n');

  const prompt = `You reviewed a ${role} interview for ${candidateName}. Here are their Q&A pairs:\n${qa}\n\nProvide a holistic coaching assessment. Return ONLY JSON:
{
  "overallVerdict": "<2 sentence overall assessment>",
  "hiringRecommendation": "<Strong Hire | Hire | Borderline | No Hire>",
  "topStrengths": ["<strength>", "<strength>", "<strength>"],
  "criticalGaps": ["<gap>", "<gap>"],
  "coachingPlan": ["<actionable step>", "<actionable step>", "<actionable step>"]
}`;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0.4 }
      });
      return JSON.parse(stripJsonFence(response.text || '{}'));
    } catch (err) {
      logger.warn('ai_fallback', { fn: 'generateSessionSummaryWithAI', message: err.message });
    }
  }

  try {
    const groqText = await groqChat('analysis', { prompt, json: true, temperature: 0.4 });
    return groqText ? JSON.parse(stripJsonFence(groqText)) : null;
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'generateSessionSummaryWithAI', provider: 'groq', message: err.message });
    return null;
  }
}

// ─── Resume Consistency Check ─────────────────────────────────────────────────
export async function analyzeResumeConsistency(resumeText, transcript) {
  if (!resumeText) return null;
  if (!Array.isArray(transcript) || transcript.length === 0) return null;

  const systemInstruction = `You are a careful, conservative fact-checker reviewing an interview transcript against a candidate's resume — framed as a constructive self-review tool for the candidate, not an accusation.

Only flag CLEAR, DIRECT factual contradictions between a specific resume claim and a specific answer. Do NOT flag:
- Omissions (the answer simply didn't mention something the resume says)
- Different framing or emphasis of the same fact
- An answer that focuses on a narrower aspect of a broader resume claim

Every flag MUST include a self-reported confidence score (0-100). Only include a flag if confidence is 90 or above. If there is ANY reasonable alternative explanation for the difference — the candidate could be describing a different time period, a different project, a partial view of a larger claim, etc. — it is NOT a confirmed contradiction and must not be included, regardless of how it initially looks.

It is correct and expected to return zero flags most of the time. Do not manufacture a flag to have something to report.

Return at most 3 flags, only ones meeting the 90+ confidence bar. Return fewer (including zero) rather than pad the list with weak ones.

Return ONLY valid JSON with this exact schema:
{
  "flags": [
    {
      "questionIndex": <index of the question this relates to>,
      "resumeLine": "<exact quoted line from the resume>",
      "answerExcerpt": "<exact quoted excerpt from the candidate's answer>",
      "confidence": <0-100>,
      "explanation": "<short plain-language explanation of the contradiction>"
    }
  ]
}`;

  const qa = transcript.map((t, i) =>
    `Q${i}: ${t.question}\nA: ${(t.answer || '').slice(0, 500)}`
  ).join('\n\n');

  const prompt = `Resume:\n${resumeText.slice(0, 6000)}\n\nInterview transcript:\n${qa}`;

  function shape(parsed) {
    const rawFlags = Array.isArray(parsed.flags) ? parsed.flags : [];
    return rawFlags
      .filter((flag) => Number(flag?.confidence) >= 90 && flag?.resumeLine && flag?.answerExcerpt)
      .slice(0, 3)
      .map((flag) => ({
        questionIndex: flag.questionIndex ?? null,
        resumeLine: flag.resumeLine,
        answerExcerpt: flag.answerExcerpt,
        confidence: Number(flag.confidence),
        explanation: flag.explanation || ''
      }));
  }

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return shape(JSON.parse(stripJsonFence(text)));
    } catch (err) {
      logger.warn('ai_fallback', { fn: 'analyzeResumeConsistency', message: err.message });
    }
  }

  try {
    const groqText = await groqChat('docs', { system: systemInstruction, prompt, json: true, temperature: 0.1 });
    return groqText ? shape(JSON.parse(stripJsonFence(groqText))) : null;
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'analyzeResumeConsistency', provider: 'groq', message: err.message });
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const FILLERS = ['um', 'uh', 'like', 'basically', 'actually', 'you know', 'sort of', 'kind of'];
function countFillers(text) {
  const lower = (text || '').toLowerCase();
  return FILLERS.reduce((count, word) => {
    const regex = new RegExp(`\\b${word.replace(/\s/g, '\\s+')}\\b`, 'gi');
    return count + (lower.match(regex) || []).length;
  }, 0);
}

// ─── ATS Analysis ─────────────────────────────────────────────────────────────
export async function generateATSAnalysis({ resumeText, jobDescription }) {
  const systemInstruction = `You are a professional Applicant Tracking System (ATS) optimization engine.
Analyze the candidate's resume and job description. Evaluate the compatibility score, keyword match percentage, missing keywords, and recommendations.

Return ONLY valid JSON with this exact schema:
{
  "score": <number 0-100, ATS compatibility score>,
  "keywordMatch": <number 0-100, keyword coverage/match percentage>,
  "missingKeywords": ["<keyword1>", "<keyword2>", ...],
  "suggestions": ["<suggestion1>", "<suggestion2>", ...]
}`;

  const prompt = `Resume text:
${resumeText.slice(0, 6000)}

Job description:
${jobDescription.slice(0, 4000)}`;

  function shape(parsed) {
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 50,
      keywordMatch: typeof parsed.keywordMatch === 'number' ? parsed.keywordMatch : 50,
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    };
  }

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return shape(JSON.parse(stripJsonFence(text)));
    } catch (err) {
      logger.warn('ats_analysis_fallback', { message: err.message });
    }
  }

  try {
    const groqText = await groqChat('docs', { system: systemInstruction, prompt, json: true, temperature: 0.2 });
    if (!groqText) throw new Error('No Groq fallback keys configured.');
    return shape(JSON.parse(stripJsonFence(groqText)));
  } catch (err) {
    logger.warn('ats_analysis_fallback', { provider: 'groq', message: err.message });
    throw new Error('ATS analysis is temporarily unavailable. Please try again shortly.');
  }
}
