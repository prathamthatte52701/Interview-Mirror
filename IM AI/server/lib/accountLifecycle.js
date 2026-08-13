import User from '../models/User.js';
import InterviewSession from '../models/InterviewSession.js';

export async function deleteUserAndSessions(userId) {
  const user = await User.findByIdAndDelete(userId);
  if (!user) return null;
  await InterviewSession.deleteMany({ userId });
  return user;
}
