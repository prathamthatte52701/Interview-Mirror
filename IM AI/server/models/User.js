import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  username: { type: String, required: true, trim: true },
  normalizedUsername: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  address: { type: String, default: '', trim: true },
  contactNumber: { type: String, required: true, trim: true },
  city: { type: String, default: '', trim: true },
  accountType: { type: String, default: 'Prototype User' }
}, {
  timestamps: true
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ normalizedUsername: 1 });

export default mongoose.model('User', userSchema);
