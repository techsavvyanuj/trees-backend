import mongoose from 'mongoose';

mongoose.connect('mongodb://localhost:27017').then(async () => {
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  console.log('All Databases:', dbs.databases.map(d => d.name));
  
  for (const db of dbs.databases) {
    if (db.name.includes('social') || db.name.includes('tree') || db.name === 'test') {
      console.log(`\nChecking database: ${db.name}...`);
      const conn = mongoose.connection.useDb(db.name);
      const streams = await conn.collection('streams').find({}).toArray();
      console.log(`  Found ${streams.length} streams`);
      
      if (streams.length > 0) {
        console.log(`  Deleting all streams...`);
        const result = await conn.collection('streams').deleteMany({});
        console.log(`  ✅ Deleted: ${result.deletedCount} streams`);
      }
    }
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
