import express from 'express';
import { auth } from '../middleware/auth.js';
import Stream from '../models/Stream.js';
import User from '../models/User.js';

const router = express.Router();

// Get all live streams
router.get('/live', auth, async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isLive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    const streams = await Stream.find(filter)
      .populate('streamer', 'username profileImage isVerified')
      .sort({ viewers: -1, startedAt: -1 });
    
    res.json(streams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top streamers leaderboard
router.get('/leaderboard', auth, async (req, res) => {
  try {
    const topStreamers = await Stream.aggregate([
      { $match: { isLive: true } },
      { $group: {
        _id: '$streamer',
        totalViewers: { $sum: { $size: '$viewers' } },
        streamCount: { $sum: 1 }
      }},
      { $sort: { totalViewers: -1 } },
      { $limit: 30 },
      { $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'streamer'
      }},
      { $unwind: '$streamer' },
      { $project: {
        streamer: {
          _id: '$streamer._id',
          username: '$streamer.username',
          profileImage: '$streamer.profileImage',
          isVerified: '$streamer.isVerified'
        },
        totalViewers: 1,
        streamCount: 1
      }}
    ]);
    
    res.json(topStreamers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get stream by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id)
      .populate('streamer', 'username profileImage isVerified')
      .populate('chat.user', 'username profileImage');
    
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    
    // Add viewer if not already viewing
    if (!stream.viewers.includes(req.user.id)) {
      stream.viewers.push(req.user.id);
      stream.totalViews += 1;
      if (stream.viewers.length > stream.maxViewers) {
        stream.maxViewers = stream.viewers.length;
      }
      await stream.save();
    }
    
    res.json(stream);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start stream
router.post('/start', auth, async (req, res) => {
  try {
    const { title, description, category, thumbnail } = req.body;
    
    // Check if user already has an active stream
    const existingStream = await Stream.findOne({
      streamer: req.user.id,
      isLive: true
    });
    
    if (existingStream) {
      return res.status(400).json({ error: 'You already have an active stream' });
    }
    
    const stream = new Stream({
      streamer: req.user.id,
      title,
      description,
      category,
      thumbnail,
      isLive: true,
      startedAt: new Date()
    });
    
    await stream.save();
    
    const populatedStream = await Stream.findById(stream._id)
      .populate('streamer', 'username profileImage isVerified');
    
    res.status(201).json(populatedStream);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// End stream
router.post('/:id/end', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    stream.isLive = false;
    stream.endedAt = new Date();
    stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
    stream.viewers = [];
    
    await stream.save();
    
    res.json({ message: 'Stream ended successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add chat message
router.post('/:id/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const stream = await Stream.findById(req.params.id);
    
    if (!stream || !stream.isLive) {
      return res.status(404).json({ error: 'Stream not found or not live' });
    }
    
    stream.chat.push({
      user: req.user.id,
      message,
      timestamp: new Date()
    });
    
    // Keep only last 100 messages
    if (stream.chat.length > 100) {
      stream.chat = stream.chat.slice(-100);
    }
    
    await stream.save();
    
    const populatedStream = await Stream.findById(stream._id)
      .populate('chat.user', 'username profileImage');
    
    const newMessage = populatedStream.chat[populatedStream.chat.length - 1];
    
    res.json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add reaction
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { type } = req.body;
    const stream = await Stream.findById(req.params.id);
    
    if (!stream || !stream.isLive) {
      return res.status(404).json({ error: 'Stream not found or not live' });
    }
    
    stream.reactions.push({
      user: req.user.id,
      type,
      timestamp: new Date()
    });
    
    await stream.save();
    
    res.json({ message: 'Reaction added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;