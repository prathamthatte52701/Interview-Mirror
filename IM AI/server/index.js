import app from './app.js';
import { connectDatabase } from './config/db.js';
import logger from './lib/logger.js';
import { hasAI } from './lib/aiProvider.js';

const PORT = process.env.PORT || 5000;

await connectDatabase();

app.listen(PORT, () => {
  logger.info('server_started', {
    port: PORT,
    aiMode: hasAI() ? 'gemini-ai' : 'heuristic'
  });
});
