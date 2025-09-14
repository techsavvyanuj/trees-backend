import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import Report from './models/Report.js';

dotenv.config();

const seedReports = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get some existing users
    const users = await User.find().limit(10);
    if (users.length < 2) {
      console.log('Need at least 2 users to create reports');
      process.exit(1);
    }

    // Clear existing reports
    await Report.deleteMany({});
    console.log('Cleared existing reports');

    // Create sample reports
    const sampleReports = [
      {
        reporterId: users[0]._id,
        reportedUserId: users[1]._id,
        reportType: 'inappropriate',
        reason: 'This post contains inappropriate content that violates community guidelines',
        evidence: 'Screenshot attached showing explicit content',
        status: 'pending',
        priority: 'high'
      },
      {
        reporterId: users[1]._id,
        reportedUserId: users[2]._id,
        reportType: 'spam',
        reason: 'User is constantly posting spam content and promotional materials',
        evidence: 'Multiple spam posts in short time period',
        status: 'pending',
        priority: 'medium'
      },
      {
        reporterId: users[2]._id,
        reportedUserId: users[3]._id,
        reportType: 'harassment',
        reason: 'User is harassing me with offensive comments and messages',
        evidence: 'Screenshot of offensive comments',
        status: 'investigating',
        priority: 'high'
      },
      {
        reporterId: users[3]._id,
        reportedUserId: users[4]._id,
        reportType: 'fake_profile',
        reason: 'This appears to be a fake profile impersonating someone else',
        evidence: 'Profile picture appears to be stolen from social media',
        status: 'pending',
        priority: 'medium'
      },
      {
        reporterId: users[4]._id,
        reportedUserId: users[0]._id,
        reportType: 'other',
        reason: 'User is spreading misinformation about health topics',
        evidence: 'Post contains false medical claims',
        status: 'pending',
        priority: 'urgent'
      }
    ];

    // Only create reports if we have enough users
    const reportsToCreate = sampleReports.slice(0, Math.min(sampleReports.length, users.length - 1));
    
    for (let i = 0; i < reportsToCreate.length; i++) {
      if (i + 1 < users.length) {
        reportsToCreate[i].reportedUserId = users[i + 1]._id;
      }
    }

    const reports = await Report.insertMany(reportsToCreate);
    console.log(`Created ${reports.length} sample reports`);

    console.log('Sample reports created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding reports:', error);
    process.exit(1);
  }
};

seedReports();