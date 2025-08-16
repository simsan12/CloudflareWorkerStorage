const fs = require('fs-extra');
const path = require('path');

// 创建测试目录
async function setupTest() {
  console.log('Setting up test directories...');
  
  // 创建必要的目录
  await fs.ensureDir('uploads');
  await fs.ensureDir('chunks');
  await fs.ensureDir('workers-migration/static/metadata');
  await fs.ensureDir('workers-migration/static/chunks');
  await fs.ensureDir('public');
  
  console.log('Test directories created successfully');
  console.log('Project structure:');
  console.log('├── src/server.js - Local file management server');
  console.log('├── workers-migration/ - Workers deployment directory');
  console.log('│   ├── static/ - Static assets for Workers');
  console.log('│   │   ├── metadata/ - File metadata');
  console.log('│   │   └── chunks/ - File chunks');
  console.log('├── public/ - Web interface');
  console.log('└── uploads/ - Temporary upload directory');
  
  console.log('\nTo start the server:');
  console.log('npm start');
  console.log('\nThen visit http://localhost:3000');
}

setupTest().catch(console.error);