import mongoose from 'mongoose';

const NOT_ADMIN = function notAdmin() {
  return this.role !== 'admin';
};

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: NOT_ADMIN, trim: true },
  username: { type: String, required: NOT_ADMIN, trim: true },
  normalizedUsername: { type: String, required: NOT_ADMIN, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  address: { type: String, default: '', trim: true },
  // No longer required — the signup UI field was hidden (too many fields on the form).
  contactNumber: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  accountType: { type: String, default: 'Prototype User' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  recoveryCodeHash: { type: String, default: null },
  recoveryCodeCreatedAt: { type: Date, default: null },
  tokenVersion: { type: Number, default: 0 }
}, {
  timestamps: true
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ normalizedUsername: 1 });

export default mongoose.model('User', userSchema);
