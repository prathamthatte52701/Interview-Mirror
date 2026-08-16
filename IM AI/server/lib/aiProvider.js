import { GoogleGenAI } from '@google/genai';
import './env.js';
import logger from './logger.js';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export function hasAI() {
  return !!ai;
}

// ─── Dynamic Question Generation ──────────────────────────────────────────────
export async function generateDynamicQuestion({ role, difficulty, resumeText, jdText, askedQuestions = [], persona }) {
  if (!ai) return null;

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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.85 }
    });
    return (response.text || '').trim();
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'generateDynamicQuestion', message: err.message });
    return null;
  }
}

// ─── Answer Analysis ───────────────────────────────────────────────────────────
export async function generateAnalysisWithAI({ answer, question, role, rubric, presenceSnapshot }) {
  if (!ai) return null;

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
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(clean);

    return {
      fillerCount: countFillers(answer),
      wordCount: (answer || '').split(/\s+/).filter(Boolean).length,
      coveredPoints: [],
      missingPoints: [],
      ...result
    };
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'generateAnalysisWithAI', message: err.message });
    return null;
  }
}

// ─── Follow-up Generation ──────────────────────────────────────────────────────
export async function generateFollowUpWithAI({ answer, analysis, persona, previousQuestion }) {
  if (!ai) return null;

  const prompt = `You are a ${persona} interviewer.
The candidate just answered: "${previousQuestion}"
Their answer: "${answer}"
Weaknesses noted: ${(analysis?.weaknesses || []).join(', ')}

Generate ONE short, natural follow-up question (1-2 sentences max) to probe deeper or clarify a weakness. 
Return ONLY the follow-up question. No quotes, no preamble.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.75 }
    });
    return (response.text || '').trim();
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'generateFollowUpWithAI', message: err.message });
    return null;
  }
}

// ─── Session Summary ───────────────────────────────────────────────────────────
export async function generateSessionSummaryWithAI({ transcript, role, candidateName }) {
  if (!ai) return null;

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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0.4 }
    });
    const text = response.text || '{}';
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'generateSessionSummaryWithAI', message: err.message });
    return null;
  }
}

// ─── Resume Consistency Check ─────────────────────────────────────────────────
export async function analyzeResumeConsistency(resumeText, transcript) {
  if (!ai) return null;
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
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

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
  } catch (err) {
    logger.warn('ai_fallback', { fn: 'analyzeResumeConsistency', message: err.message });
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
  if (!ai) {
    throw new Error('AI provider is not configured on the server.');
  }

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
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      score: typeof parsed.score === 'number' ? parsed.score : 50,
      keywordMatch: typeof parsed.keywordMatch === 'number' ? parsed.keywordMatch : 50,
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    };
  } catch (err) {
    logger.warn('ats_analysis_fallback', { message: err.message });
    throw new Error('ATS analysis is temporarily unavailable. Please try again shortly.');
  }
}
