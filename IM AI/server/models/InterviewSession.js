import mongoose from 'mongoose';

const { Mixed, ObjectId } = mongoose.Schema.Types;

// strict: false keeps this forgiving of whatever shape analysis/questionMeta/
// presenceSnapshot happen to be (heuristic vs AI scoring differ) — only
// bookmarked needs a real, typed, defaulted field.
const transcriptEntrySchema = new mongoose.Schema({
  question: { type: String },
  questionMeta: { type: Mixed },
  answer: { type: String },
  createdAt: { type: String },
  analysis: { type: Mixed },
  followUp: { type: String },
  responseSeconds: { type: Number },
  presenceSnapshot: { type: Mixed },
  pressureScoreBefore: { type: Number },
  bookmarked: { type: Boolean, default: false }
}, { _id: false, strict: false });

const interviewSessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: ObjectId, ref: 'User', required: false, default: null, index: true },
  guestId: { type: String, default: null, index: true },
  role: { type: String, required: true },
  candidateName: { type: String, required: true },
  interviewMode: { type: String, default: 'mixed' },
  difficulty: { type: String, default: 'medium' },
  persona: { type: String, default: 'calm-senior-interviewer' },
  pressureMode: { type: String, default: 'balanced' },
  sessionLength: { type: String, enum: ['quick', 'full'], default: 'full' },
  resumeText: { type: String, default: '' },
  jdText: { type: String, default: '' },
  askedQuestions: { type: [String], default: [] },
  currentQuestion: { type: String, default: null },
  currentMeta: { type: Mixed, default: null },
  transcript: { type: [transcriptEntrySchema], default: [] },
  pressureScore: { type: Number, default: 48 },
  interviewer: { type: Mixed, default: null },
  endedAt: { type: Date, default: null },
  summary: { type: Mixed, default: null }
}, {
  timestamps: true
});

interviewSessionSchema.index({ userId: 1, createdAt: -1 });
interviewSessionSchema.index({ guestId: 1, createdAt: -1 });

export default mongoose.model('InterviewSession', interviewSessionSchema);
