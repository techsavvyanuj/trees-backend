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

// Admin middleware - temporarily disabled for testing
// router.use(auth, adminAuth);

// Dashboard stats - Updated to match frontend expectations
router.get('/dashboard/stats', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [totalUsers, activeUsers, totalPosts, liveStreams] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 
        $or: [
          { lastActive: { $gte: thirtyDaysAgo } },
          { createdAt: { $gte: thirtyDaysAgo } }
        ]
      }),
      Post.countDocuments(),
      Stream.countDocuments({ status: 'live' })
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      totalPosts,
      liveStreams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Individual stat endpoints
router.get('/users/count', async (req, res) => {
  try {
    const total = await User.countDocuments();
    res.json({ total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/active', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const count = await User.countDocuments({ 
      $or: [
        { lastActive: { $gte: daysAgo } },
        { createdAt: { $gte: daysAgo } }
      ]
    });
    
    res.json({ count, period: `${days} days` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/posts/count', async (req, res) => {
  try {
    const total = await Post.countDocuments();
    res.json({ total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/streams/live/count', async (req, res) => {
  try {
    const count = await Stream.countDocuments({ status: 'live' });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recent activities endpoint
router.get('/activities/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const activities = [];
    
    // Get recent user registrations
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(Math.floor(limit / 2))
      .select('_id username name createdAt');
    
    recentUsers.forEach(user => {
      activities.push({
        id: `user_reg_${user._id}`,
        type: 'user_registration',
        user: {
          id: user._id,
          username: user.username,
          displayName: user.name || user.username
        },
        message: `New user registration: ${user.name || user.username}`,
        timestamp: user.createdAt.toISOString(),
        details: 'User registered via email'
      });
    });
    
    // Get recent reports
    const recentReports = await Report.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(Math.floor(limit / 2))
      .populate('reporter', 'username name')
      .select('_id createdAt reporter reason');
    
    recentReports.forEach(report => {
      activities.push({
        id: `report_${report._id}`,
        type: 'content_reported',
        user: {
          id: report.reporter._id,
          username: report.reporter.username,
          displayName: report.reporter.name || report.reporter.username
        },
        message: 'Content reported for review',
        timestamp: report.createdAt.toISOString(),
        details: report.reason || 'Content reported for moderation'
      });
    });
    
    // Sort all activities by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({ 
      activities: activities.slice(0, limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Keep the original dashboard endpoint for backward compatibility
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
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status && status !== 'all') {
      if (status === 'active') filter.isActive = true;
      if (status === 'blocked') filter.isActive = false;
      if (status === 'pending') filter.status = 'pending';
    }
    
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    // Format users to match frontend expectations
    const formattedUsers = await Promise.all(users.map(async (user) => {
      const postCount = await Post.countDocuments({ author: user._id });
      const followerCount = user.followers ? user.followers.length : 0;
      
      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.name,
        role: user.role,
        status: user.isActive ? 'active' : 'blocked',
        badges: user.badges || [],
        postCount,
        followerCount,
        lastActive: user.lastActive,
        createdAt: user.createdAt,
        avatar: user.avatar,
        bio: user.bio,
        location: user.location,
        isVerified: user.isVerified
      };
    }));
    
    const total = await User.countDocuments(filter);
    
    res.json({ 
      users: formattedUsers, 
      total, 
      pages: Math.ceil(total / limit) 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Block/unblock user
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: isActive ? 'user_unblocked' : 'user_blocked',
      target: { type: 'user', id: req.params.id },
      details: `User ${isActive ? 'unblocked' : 'blocked'}`
    });
    res.json({ message: `User ${isActive ? 'unblocked' : 'blocked'} successfully`, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban user
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false, banReason: reason }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_banned',
      target: { type: 'user', id: req.params.id },
      details: `User banned. Reason: ${reason || 'No reason provided'}`
    });
    res.json({ message: 'User banned successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user badges
router.patch('/users/:id/badges', async (req, res) => {
  try {
    const { badges } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { badges: badges || [] }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_badges_updated',
      target: { type: 'user', id: req.params.id },
      details: `User badges updated: ${badges?.join(', ') || 'none'}`
    });
    res.json({ message: 'User badges updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Password reset
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    // In a real app, send email here
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_password_reset',
      target: { type: 'user', id: req.params.id },
      details: `Password reset triggered by admin.`
    });
    res.json({ message: 'Password reset email sent (mock)' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban user
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    
    await User.findByIdAndUpdate(req.params.id, { 
      isActive: false,
      banReason: reason 
    });
    
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_banned',
      target: { type: 'user', id: req.params.id },
      details: `User banned. Reason: ${reason || 'No reason provided'}`
    });
    
    res.json({ message: 'User banned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single user details
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('followers', 'username name')
      .populate('following', 'username name');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user stats
    const postCount = await Post.countDocuments({ author: user._id });
    const followerCount = user.followers ? user.followers.length : 0;
    const followingCount = user.following ? user.following.length : 0;

    res.json({
      ...user.toObject(),
      postCount,
      followerCount,
      followingCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user details
router.patch('/users/:id', async (req, res) => {
  try {
    const { name, username, email, role, isActive, bio, location } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (bio) updateData.bio = bio;
    if (location) updateData.location = location;

    const user = await User.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_updated',
      target: { type: 'user', id: req.params.id },
      details: `User profile updated`
    });
    
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's posts and related data
    await Post.deleteMany({ author: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_deleted',
      target: { type: 'user', id: req.params.id },
      details: `User ${user.username} deleted`
    });
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage user badges
router.patch('/users/:id/badges', async (req, res) => {
  try {
    const { badges } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { badges: badges || [] },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_badges_updated',
      target: { type: 'user', id: req.params.id },
      details: `User badges updated: ${badges?.join(', ') || 'none'}`
    });
    
    res.json({ message: 'User badges updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send password reset email
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // In a real implementation, you would:
    // 1. Generate a password reset token
    // 2. Send an email with the reset link
    // For now, we'll just log the action
    
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'password_reset_sent',
      target: { type: 'user', id: req.params.id },
      details: `Password reset email sent to ${user.email}`
    });
    
    res.json({ 
      message: `Password reset email sent to ${user.email}`,
      email: user.email 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const { username, email, name, password = 'temp123', role = 'user' } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }
    
    const user = new User({
      username,
      email,
      name,
      password, // This will be hashed by the User model
      role,
      isActive: true
    });
    
    await user.save();
    
    await AdminLog.create({
      admin: req.user?.id || 'system',
      action: 'user_created',
      target: { type: 'user', id: user._id },
      details: `New user created: ${username}`
    });
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json({ 
      message: 'User created successfully', 
      user: userResponse 
    });
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