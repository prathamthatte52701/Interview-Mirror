import express from 'express';
import { generateATSAnalysis } from '../lib/aiProvider.js';
import logger from '../lib/logger.js';

const router = express.Router();

router.post('/analyze', async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText?.trim()) {
      return res.status(400).json({ error: 'Resume text is required for ATS analysis.' });
    }
    if (!jobDescription?.trim()) {
      return res.status(400).json({ error: 'Job description is required for ATS analysis.' });
    }

    const result = await generateATSAnalysis({ resumeText, jobDescription });
    res.json(result);
  } catch (error) {
    logger.error('ats_analysis_error', { message: error?.message || String(error) });
    res.status(500).json({
      error: error?.message || 'Failed to analyze ATS compatibility. Please try again later.'
    });
  }
});

export default router;
