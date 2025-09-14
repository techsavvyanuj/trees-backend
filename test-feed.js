#!/usr/bin/env node

import fetch from 'node-fetch';

const testFeed = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/posts/feed?page=1&limit=10', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGM2NmEwMTY5YmJmYjQxMTMzMjNiNmIiLCJpYXQiOjE3NTc4MzM3MjksImV4cCI6MTc1ODQzODUyOX0.juPmLsIed5jHV9D3vUnZVMIuvaVZkg8nSCBT18lAFRQ',
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('Feed response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.data && Array.isArray(data.data)) {
      console.log(`\nFound ${data.data.length} posts in feed`);
      
      const psaPosts = data.data.filter(post => post.content && post.content.includes('🚨'));
      console.log(`PSA posts found: ${psaPosts.length}`);
      
      psaPosts.forEach((post, index) => {
        console.log(`\nPSA Post ${index + 1}:`);
        console.log(`Content: ${post.content.substring(0, 100)}...`);
        console.log(`Type: ${post.type}`);
        console.log(`Author: ${post.user?.name || 'Unknown'}`);
      });
    }
  } catch (error) {
    console.error('Error testing feed:', error.message);
  }
};

testFeed();