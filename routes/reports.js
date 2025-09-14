import express from 'express';
import { body, validationResult } from 'express-validator';
import Report from '../models/Reports.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Report a user
router.post('/', authenticateToken, [
  body('reportedUserId').isMongoId(),
  body('reportType').isIn([
    'inappropriate_behavior',
    'harassment',
    'fake_profile',
    'spam',
    'underage',
    'violence',
    'hate_speech',
    'sexual_content',
    'other'
  ]),
  body('reason').isString().trim().isLength({ min: 10, max: 1000 }),
  body('evidence').optional().isArray(),
  body('evidence.*.type').optional().isIn(['screenshot', 'message', 'profile', 'other']),
  body('evidence.*.description').optional().isString().trim(),
  body('evidence.*.url').optional().isURL()
], async (req, res) => {
  try {
    const { reportedUserId, reportType, reason, evidence = [] } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if user is reporting themselves
    if (reportedUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot report yourself'
      });
    }

    // Check if reported user exists
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        message: 'Reported user not found'
      });
    }

    // Check if user has already reported this user
    const hasReported = await UserReport.hasUserReported(req.user.id, reportedUserId);
    if (hasReported) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this user'
      });
    }

    // Create report using new Report model
    const report = new Report({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      reportType,
      reason,
      evidence,
      category: req.body.category || 'behavior',
      severity: req.body.severity || 5,
      metadata: {
        reporterIP: req.ip,
        reporterUserAgent: req.get('User-Agent'),
        // Add more metadata fields as needed
      }
    });

    await report.save();

    res.status(201).json({
      success: true,
      message: 'User reported successfully',
      data: report
    });
  } catch (error) {
    console.error('Error reporting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to report user'
    });
  }
});

// Get user's report history
router.get('/my-reports', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = { reporter: req.user.id };
    if (status) {
      query.status = status;
    }

    const reports = await UserReport.find(query)
      .populate('reportedUser', 'fullName username profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserReport.countDocuments(query);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

// Get reports against a user (admin only)
router.get('/against/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const query = { reportedUser: userId };
    if (status) {
      query.status = status;
    }

    const reports = await UserReport.find(query)
      .populate('reporter', 'fullName username profileImage')
      .populate('reportedUser', 'fullName username profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserReport.countDocuments(query);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching reports against user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

// Get all reports (admin only)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const { status, type, priority, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const query = {};
    if (status) query.status = status;
    if (type) query.reportType = type;
    if (priority) query.priority = priority;

    const reports = await UserReport.find(query)
      .populate('reporter', 'fullName username profileImage')
      .populate('reportedUser', 'fullName username profileImage')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserReport.countDocuments(query);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching all reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

// Get high priority reports (admin only)
router.get('/high-priority', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const reports = await UserReport.getHighPriorityReports(parseInt(limit));

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching high priority reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch high priority reports'
    });
  }
});

// Update report status (admin only)
router.put('/:reportId/status', authenticateToken, [
  body('status').isIn(['pending', 'investigating', 'resolved', 'dismissed']),
  body('note').optional().isString().trim()
], async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, note } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const report = await UserReport.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.updateStatus(status, req.user.id, note);

    res.json({
      success: true,
      message: 'Report status updated successfully',
      data: report.getReportSummary()
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update report status'
    });
  }
});

// Take action on report (admin only)
router.put('/:reportId/action', authenticateToken, [
  body('action').isIn([
    'none',
    'warning',
    'temporary_ban',
    'permanent_ban',
    'content_removal',
    'profile_restriction'
  ]),
  body('details').isString().trim().isLength({ min: 10, max: 1000 })
], async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, details } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const report = await UserReport.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.takeAction(action, details, req.user.id);

    // Apply action to reported user if necessary
    if (action === 'temporary_ban' || action === 'permanent_ban') {
      const banDuration = action === 'temporary_ban' ? 7 * 24 * 60 * 60 * 1000 : null; // 7 days for temp ban
      
      await User.findByIdAndUpdate(report.reportedUser, {
        status: 'suspended',
        ...(banDuration && { 'suspendedUntil': new Date(Date.now() + banDuration) })
      });
    }

    res.json({
      success: true,
      message: 'Action taken successfully',
      data: report.getReportSummary()
    });
  } catch (error) {
    console.error('Error taking action on report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to take action on report'
    });
  }
});

// Get report statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const stats = await UserReport.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const typeStats = await UserReport.aggregate([
      {
        $group: {
          _id: '$reportType',
          count: { $sum: 1 }
        }
      }
    ]);

    const priorityStats = await UserReport.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalReports = await UserReport.countDocuments();
    const pendingReports = await UserReport.countDocuments({ status: 'pending' });
    const highPriorityReports = await UserReport.countDocuments({ 
      priority: { $in: ['high', 'urgent'] },
      status: { $in: ['pending', 'investigating'] }
    });

    res.json({
      success: true,
      data: {
        total: totalReports,
        pending: pendingReports,
        highPriority: highPriorityReports,
        byStatus: stats,
        byType: typeStats,
        byPriority: priorityStats
      }
    });
  } catch (error) {
    console.error('Error fetching report statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report statistics'
    });
  }
});

// Get report by ID
router.get('/:reportId', authenticateToken, async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await UserReport.findById(reportId)
      .populate('reporter', 'fullName username profileImage')
      .populate('reportedUser', 'fullName username profileImage')
      .populate('adminNotes.admin', 'fullName username');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check if user can access this report
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.role !== 'moderator') {
      // Users can only see their own reports
      if (report.reporter.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this report'
        });
      }
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report'
    });
  }
});

export default router;
