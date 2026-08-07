import { fetchSessions } from '../services/api.js';

export async function loadInterviewHistory() {
  return fetchSessions();
}
