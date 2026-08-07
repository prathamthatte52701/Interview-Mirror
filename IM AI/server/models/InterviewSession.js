import mongoose from 'mongoose';

const { Mixed, ObjectId } = mongoose.Schema.Types;

const interviewSessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: ObjectId, ref: 'User', required: false, default: null, index: true },
  role: { type: String, required: true },
  candidateName: { type: String, required: true },
  interviewMode: { type: String, default: 'mixed' },
  difficulty: { type: String, default: 'medium' },
  persona: { type: String, default: 'calm-senior-interviewer' },
  pressureMode: { type: String, default: 'balanced' },
  resumeText: { type: String, default: '' },
  jdText: { type: String, default: '' },
  askedQuestions: { type: [String], default: [] },
  currentQuestion: { type: String, default: null },
  currentMeta: { type: Mixed, default: null },
  transcript: { type: [Mixed], default: [] },
  pressureScore: { type: Number, default: 48 },
  interviewer: { type: Mixed, default: null },
  endedAt: { type: Date, default: null },
  summary: { type: Mixed, default: null }
}, {
  timestamps: true
});

interviewSessionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('InterviewSession', interviewSessionSchema);
