import { describe, it, expect } from 'vitest';
import { computeDeliveryMetrics, FILLER_WORDS } from '../lib/speechMetrics.js';

describe('computeDeliveryMetrics', () => {
  it('counts known filler words exactly', () => {
    const transcript = [
      { answer: 'Um, so I basically, like, worked on this, you know.', responseSeconds: 30 }
    ];
    // um(1) so(1) basically(1) like(1) you know(1) = 5
    expect(computeDeliveryMetrics(transcript).fillerWordCount).toBe(5);
  });

  it('does not match filler words as substrings (e.g. "like" inside "likely")', () => {
    const transcript = [
      { answer: 'This is likely the correct outcome for the task.', responseSeconds: 20 }
    ];
    expect(computeDeliveryMetrics(transcript).fillerWordCount).toBe(0);
  });

  it('returns 0, not undefined/null, for a transcript with zero filler words', () => {
    const transcript = [
      { answer: 'I designed a clean data pipeline with clear ownership and results.', responseSeconds: 20 }
    ];
    const result = computeDeliveryMetrics(transcript);
    expect(result.fillerWordCount).toBe(0);
    expect(result.fillerWordRate).toBe(0);
  });

  it('computes WPM matching hand-computed values for known word count + duration', () => {
    // 30 words in 30 seconds = 60 wpm
    const answer = Array(30).fill('word').join(' ');
    const transcript = [{ answer, responseSeconds: 30 }];
    const result = computeDeliveryMetrics(transcript);
    expect(result.averageWpm).toBe(60);
    expect(result.perAnswer[0].wpm).toBe(60);
  });

  it('averages overall WPM by total words/total time, not by averaging per-answer WPMs', () => {
    // answer 1: 10 words in 10s -> 60wpm; answer 2: 100 words in 100s -> 60wpm
    // naive per-answer average would coincidentally match, so use skewed lengths instead
    const transcript = [
      { answer: Array(10).fill('word').join(' '), responseSeconds: 5 },   // 120 wpm
      { answer: Array(100).fill('word').join(' '), responseSeconds: 100 } // 60 wpm
    ];
    const result = computeDeliveryMetrics(transcript);
    // total words 110, total seconds 105 -> (110/105)*60 = 62.857 -> round 63
    expect(result.averageWpm).toBe(63);
    // naive average of per-answer wpm would be (120+60)/2 = 90, must NOT equal that
    expect(result.averageWpm).not.toBe(90);
  });

  it('guards against divide-by-zero when responseSeconds is 0 — returns 0, does not throw', () => {
    const transcript = [{ answer: 'Some words here for this answer.', responseSeconds: 0 }];
    expect(() => computeDeliveryMetrics(transcript)).not.toThrow();
    const result = computeDeliveryMetrics(transcript);
    expect(result.perAnswer[0].wpm).toBe(0);
    expect(result.averageWpm).toBe(0);
  });

  it('guards against divide-by-zero for an empty answer', () => {
    const transcript = [{ answer: '', responseSeconds: 20 }];
    expect(() => computeDeliveryMetrics(transcript)).not.toThrow();
    const result = computeDeliveryMetrics(transcript);
    expect(result.perAnswer[0].wpm).toBe(0);
    expect(result.fillerWordCount).toBe(0);
  });

  it('handles an empty transcript without throwing', () => {
    const result = computeDeliveryMetrics([]);
    expect(result).toEqual({ fillerWordCount: 0, fillerWordRate: 0, averageWpm: 0, perAnswer: [] });
  });

  it('exports the filler word list as a tunable constant', () => {
    expect(FILLER_WORDS).toContain('um');
    expect(FILLER_WORDS).toContain('you know');
  });
});
