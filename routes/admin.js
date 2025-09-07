import express from 'express';
import { auth, adminAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Stream from '../models/Stream.js';
import Match from '../models/Match.js';
import Report from '../models/Report.js';
import Notification from '../models/Notification.js';
import AdminLog from '../models/AdminLog.js';

const router = express.Router();

// Admin middleware
router.use(auth, adminAuth);

// Dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [totalUsers, activeUsers, totalPosts, totalStreams, totalReports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      Post.countDocuments(),
      Stream.countDocuments(),
      Report.countDocuments({ status: 'pending' })
    ]);
    
    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      totalPosts,
      totalStreams,
      totalReports,
      userGrowth
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User management
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const filter = {};
    
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.isActive = status === 'active';
    }
    
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await User.countDocuments(filter);
    
    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block/unblock user
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    
    await User.findByIdAndUpdate(req.params.id, { isActive });
    
    await AdminLog.create({
      admin: req.user.id,
      action: isActive ? 'user_unblocked' : 'user_blocked',
      target: { type: 'user', id: req.params.id },
      details: `User ${isActive ? 'unblocked' : 'blocked'}`
    });
    
    res.json({ message: `User ${isActive ? 'unblocked' : 'blocked'} successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Content moderation
router.get('/content', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const filter = {};
    
    if (type) filter.type = type;
    if (status === 'reported') filter.isReported = true;
    if (status === 'pending') filter.isApproved = false;
    
    const posts = await Post.find(filter)
      .populate('author', 'username profileImage')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Post.countDocuments(filter);
    
    res.json({ posts, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/reject content
router.patch('/content/:id/moderate', async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    
    if (action === 'approve') {
      await Post.findByIdAndUpdate(req.params.id, { isApproved: true, isReported: false });
    } else {
      await Post.findByIdAndDelete(req.params.id);
    }
    
    await AdminLog.create({
      admin: req.user.id,
      action: `content_${action}d`,
      target: { type: 'post', id: req.params.id },
      details: `Content ${action}d`
    });
    
    res.json({ message: `Content ${action}d successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reports
router.get('/reports', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    
    const reports = await Report.find(filter)
      .populate('reporter', 'username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Report.countDocuments(filter);
    
    res.json({ reports, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle report
router.patch('/reports/:id', async (req, res) => {
  try {
    const { status, action } = req.body;
    
    await Report.findByIdAndUpdate(req.params.id, {
      status,
      action,
      reviewedBy: req.user.id,
      reviewedAt: new Date()
    });
    
    await AdminLog.create({
      admin: req.user.id,
      action: 'report_reviewed',
      target: { type: 'report', id: req.params.id },
      details: `Report ${status} with action: ${action}`
    });
    
    res.json({ message: 'Report updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send notification
router.post('/notifications', async (req, res) => {
  try {
    const { title, message, targetAudience, recipients } = req.body;
    
    let users = [];
    if (targetAudience === 'all') {
      users = await User.find({ isActive: true }).select('_id');
    } else if (recipients && recipients.length > 0) {
      users = recipients.map(id => ({ _id: id }));
    }
    
    const notifications = users.map(user => ({
      recipient: user._id,
      type: 'psa',
      title,
      message
    }));
    
    await Notification.insertMany(notifications);
    
    res.json({ message: `Notification sent to ${users.length} users` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;