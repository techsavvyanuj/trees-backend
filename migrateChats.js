import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = 'mongodb://localhost:27017/social-media-platform';

const migrateChats = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const chatsCollection = db.collection('chats');

    // Count existing chats
    const totalChats = await chatsCollection.countDocuments();
    console.log(`📊 Found ${totalChats} total chats\n`);

    // Update chats with matchId to be "arcade" type
    const arcadeResult = await chatsCollection.updateMany(
      { matchId: { $exists: true, $ne: null } },
      { $set: { chatType: 'arcade' } }
    );
    console.log(`🎮 Updated ${arcadeResult.modifiedCount} chats to type "arcade" (chats with matchId)`);

    // Update chats without matchId to be "trees" type
    const treesResult = await chatsCollection.updateMany(
      { $or: [
        { matchId: { $exists: false } },
        { matchId: null }
      ]},
      { $set: { chatType: 'trees' } }
    );
    console.log(`🌳 Updated ${treesResult.modifiedCount} chats to type "trees" (regular chats)\n`);

    // Verify the migration
    const arcadeCount = await chatsCollection.countDocuments({ chatType: 'arcade' });
    const treesCount = await chatsCollection.countDocuments({ chatType: 'trees' });
    const nullCount = await chatsCollection.countDocuments({ chatType: { $exists: false } });

    console.log('📈 Migration Summary:');
    console.log(`   - Arcade chats: ${arcadeCount}`);
    console.log(`   - Trees chats: ${treesCount}`);
    console.log(`   - Chats without type: ${nullCount}`);
    
    if (nullCount > 0) {
      console.log('\n⚠️  Warning: Some chats still don\'t have a chatType!');
    } else {
      console.log('\n✅ All chats have been successfully migrated!');
    }

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrateChats();
