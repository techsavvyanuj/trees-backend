import mongoose from 'mongoose';

mongoose.connect('mongodb://localhost:27017/social-media-platform')
  .then(async () => {
    const chats = await mongoose.connection.db.collection('chats').find({}).toArray();
    
    console.log(`\n📊 Total chats: ${chats.length}\n`);
    
    const withChatType = chats.filter(c => c.chatType);
    const withoutChatType = chats.filter(c => !c.chatType);
    const withMatchId = chats.filter(c => c.matchId);
    
    console.log(`Chats WITH chatType: ${withChatType.length}`);
    console.log(`Chats WITHOUT chatType: ${withoutChatType.length}`);
    console.log(`Chats WITH matchId: ${withMatchId.length}\n`);
    
    if (chats.length > 0) {
      console.log('Sample chat:');
      const sample = chats[0];
      console.log({
        _id: sample._id,
        chatType: sample.chatType,
        matchId: sample.matchId,
        hasMatchId: !!sample.matchId,
        participants: sample.participants
      });
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
