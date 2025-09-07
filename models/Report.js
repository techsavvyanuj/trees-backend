import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportType: {
    type: String,
    enum: ['inappropriate', 'spam', 'harassment', 'fake_profile', 'other'],
    required: true
  },
  reason: {
    type: String,
    required: true,
    maxlength: [1000, 'Reason cannot be more than 1000 characters']
  },
  evidence: {
    type: String,
    maxlength: [2000, 'Evidence cannot be more than 2000 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'investigating', 'resolved', 'dismissed'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin/Moderator
  },
  adminNotes: {
    type: String,
    maxlength: [2000, 'Admin notes cannot be more than 2000 characters']
  },
  actionsTaken: [{
    action: {
      type: String,
      enum: ['warning', 'suspension', 'ban', 'content_removal', 'no_action'],
      required: true
    },
    duration: {
      type: Number // Duration in days (for suspensions/bans)
    },
    reason: {
      type: String,
      maxlength: [500, 'Action reason cannot be more than 500 characters']
    },
    takenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    takenAt: {
      type: Date,
      default: Date.now
    }
  }],
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  appealStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },
  appealReason: {
    type: String,
    maxlength: [1000, 'Appeal reason cannot be more than 1000 characters']
  },
  appealDate: {
    type: Date
  },
  appealDecision: {
    type: String,
    enum: ['approved', 'rejected']
  },
  appealDecisionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  appealDecisionDate: {
    type: Date
  },
  appealDecisionNotes: {
    type: String,
    maxlength: [1000, 'Appeal decision notes cannot be more than 1000 characters']
  }
}, {
  timestamps: true
});

// Index for efficient queries
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ reportedUserId: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: 1 });
reportSchema.index({ assignedTo: 1 });
reportSchema.index({ reportType: 1 });

// Virtual for report age
reportSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Virtual for is resolved
reportSchema.virtual('isResolved').get(function() {
  return this.status === 'resolved' || this.status === 'dismissed';
});

// Virtual for is urgent
reportSchema.virtual('isUrgent').get(function() {
  return this.priority === 'urgent' || this.priority === 'high';
});

// Method to assign to admin/moderator
reportSchema.methods.assignTo = function(adminId) {
  this.assignedTo = adminId;
  this.status = 'investigating';
  return this.save();
};

// Method to add admin note
reportSchema.methods.addAdminNote = function(note) {
  this.adminNotes = note;
  return this.save();
};

// Method to take action
reportSchema.methods.takeAction = function(action, duration, reason, takenBy) {
  this.actionsTaken.push({
    action,
    duration,
    reason,
    takenBy,
    takenAt: new Date()
  });
  return this.save();
};

// Method to resolve report
reportSchema.methods.resolve = function(resolvedBy, status = 'resolved') {
  this.status = status;
  this.resolvedAt = new Date();
  this.resolvedBy = resolvedBy;
  return this.save();
};

// Method to appeal report
reportSchema.methods.appeal = function(reason) {
  this.appealStatus = 'pending';
  this.appealReason = reason;
  this.appealDate = new Date();
  return this.save();
};

// Method to decide appeal
reportSchema.methods.decideAppeal = function(decision, notes, decidedBy) {
  this.appealStatus = decision;
  this.appealDecision = decision;
  this.appealDecisionBy = decidedBy;
  this.appealDecisionDate = new Date();
  this.appealDecisionNotes = notes;
  return this.save();
};

// Static method to find user reports
reportSchema.statics.findUserReports = function(userId) {
  return this.find({
    reporterId: userId
  })
    .populate('reportedUserId', 'username name avatar')
    .populate('assignedTo', 'username name')
    .populate('resolvedBy', 'username name')
    .sort({ createdAt: -1 });
};

// Static method to find reports against user
reportSchema.statics.findReportsAgainstUser = function(userId) {
  return this.find({
    reportedUserId: userId
  })
    .populate('reporterId', 'username name avatar')
    .populate('assignedTo', 'username name')
    .populate('resolvedBy', 'username name')
    .sort({ createdAt: -1 });
};

// Static method to find pending reports
reportSchema.statics.findPendingReports = function() {
  return this.find({
    status: { $in: ['pending', 'investigating'] }
  })
    .populate('reporterId', 'username name avatar')
    .populate('reportedUserId', 'username name avatar')
    .populate('assignedTo', 'username name')
    .sort({ priority: -1, createdAt: 1 });
};

// Static method to find urgent reports
reportSchema.statics.findUrgentReports = function() {
  return this.find({
    priority: { $in: ['urgent', 'high'] },
    status: { $in: ['pending', 'investigating'] }
  })
    .populate('reporterId', 'username name avatar')
    .populate('reportedUserId', 'username name avatar')
    .populate('assignedTo', 'username name')
    .sort({ createdAt: 1 });
};

export default mongoose.model('Report', reportSchema);
