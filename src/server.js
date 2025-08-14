const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保必要的目录存在
async function ensureDirectories() {
  await fsExtra.ensureDir('uploads');
  await fsExtra.ensureDir('chunks');
  await fsExtra.ensureDir('pages/metadata');
  await fsExtra.ensureDir('pages/chunks');
}

// 启动时创建目录
ensureDirectories().catch(console.error);

// 文件名编码修复函数
function decodeFilename(filename) {
  // 检查是否包含典型的UTF-8双重编码特征
  if (filename.includes('ä¸') || filename.includes('æ´') || filename.includes('ç¬') || 
      filename.includes('è®') || filename.includes('è¯') || filename.includes('æµ') ||
      filename.includes('ç¨') || filename.includes('åº')) {
    
    try {
      // 将字符串作为Latin-1字节序列重新解释为UTF-8
      const bytes = [];
      for (let i = 0; i < filename.length; i++) {
        bytes.push(filename.charCodeAt(i));
      }
      
      const buffer = Buffer.from(bytes);
      const decoded = buffer.toString('utf8');
      
      // 检查解码是否成功（包含中文字符且没有替换字符）
      if (/[\u4e00-\u9fff]/.test(decoded) && !decoded.includes('�')) {
        return decoded;
      }
    } catch (e) {
      // 如果解码失败，返回原文件名
    }
  }
  
  // 如果不需要解码或解码失败，返回原文件名
  return filename;
}

// 配置存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // 处理文件名编码问题
    const originalName = decodeFilename(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // 处理文件名编码
    file.originalname = decodeFilename(file.originalname);
    cb(null, true);
  }
});

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 添加UTF-8编码支持中间件
app.use((req, res, next) => {
  // 设置响应头
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 文件分块大小 (25MB)
const CHUNK_SIZE = 25 * 1024 * 1024;

// 生成文件ID
function generateFileId() {
  return crypto.randomBytes(16).toString('hex');
}

// 分块文件 - 使用流式处理避免内存问题
async function chunkFile(filePath, fileId) {
  const stats = await fs.promises.stat(filePath);
  const fileSize = stats.size;
  const chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
  
  const chunks = [];
  
  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileSize);
    const chunkSize = end - start;
    
    const chunkId = `${fileId}_${i}`;
    const chunkPath = path.join('chunks', chunkId);
    
    // 使用流式读取和写入
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath, { start, end: end - 1 });
      const writeStream = fs.createWriteStream(chunkPath);
      const hash = crypto.createHash('md5');
      
      readStream.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      readStream.on('end', () => {
        writeStream.end();
        chunks.push({
          id: chunkId,
          index: i,
          size: chunkSize,
          hash: hash.digest('hex')
        });
        resolve();
      });
      
      readStream.on('error', reject);
      writeStream.on('error', reject);
      
      readStream.pipe(writeStream);
    });
  }
  
  return { chunks, fileSize, chunkCount };
}

// 生成文件元数据
async function generateFileMetadata(originalPath, fileId, fileName, chunks, originalHash) {
  const stats = await fs.promises.stat(originalPath);
  const fileHash = crypto.createHash('md5');
  
  // 计算整个文件的MD5
  const fileBuffer = await fs.promises.readFile(originalPath);
  fileHash.update(fileBuffer);
  const calculatedHash = fileHash.digest('hex');
  
  // 验证哈希是否匹配
  const hashVerified = originalHash ? calculatedHash === originalHash : true;
  
  return {
    id: fileId,
    name: fileName,
    size: stats.size,
    chunks: chunks,
    totalChunks: chunks.length,
    hash: calculatedHash,
    originalHash: originalHash,
    hashVerified: hashVerified,
    uploadTime: new Date().toISOString(),
    mimeType: 'application/octet-stream'
  };
}

// API端点

// 上传文件
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileId = generateFileId();
    const originalPath = req.file.path;
    
    // 优先使用客户端传递的正确文件名，如果没有则使用文件的原始名
    const fileName = req.body.fileName || req.file.originalname;
    const originalHash = req.body.originalHash || null;
    
    // 分块文件
    const { chunks, fileSize, chunkCount } = await chunkFile(originalPath, fileId);
    
    // 生成元数据
    const metadata = await generateFileMetadata(originalPath, fileId, fileName, chunks, originalHash);
    
    // 将元数据保存到pages目录
    const metadataPath = path.join('pages', 'metadata', `${fileId}.json`);
    await fsExtra.ensureDir(path.dirname(metadataPath));
    await fsExtra.writeJSON(metadataPath, metadata);
    
    // 复制分块文件到pages目录
    for (const chunk of chunks) {
      const sourceChunkPath = path.join('chunks', chunk.id);
      const destChunkPath = path.join('pages', 'chunks', chunk.id);
      await fsExtra.ensureDir(path.dirname(destChunkPath));
      await fsExtra.copy(sourceChunkPath, destChunkPath);
    }
    
    // 清理临时文件
    await fs.promises.unlink(originalPath);
    await fsExtra.remove('chunks');
    
    res.json({
      success: true,
      fileId: fileId,
      fileName: fileName,
      fileSize: fileSize,
      chunkCount: chunkCount,
      hashVerified: metadata.hashVerified,
      hash: metadata.hash,
      originalHash: metadata.originalHash
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 获取文件列表
app.get('/api/files', async (req, res) => {
  try {
    const metadataDir = path.join('pages', 'metadata');
    const files = [];
    
    if (await fsExtra.pathExists(metadataDir)) {
      const metadataFiles = await fs.promises.readdir(metadataDir);
      
      for (const metadataFile of metadataFiles) {
        if (metadataFile.endsWith('.json')) {
          const metadataPath = path.join(metadataDir, metadataFile);
          const metadata = await fsExtra.readJSON(metadataPath);
          files.push({
            id: metadata.id,
            name: metadata.name,
            size: metadata.size,
            uploadTime: metadata.uploadTime,
            hash: metadata.hash
          });
        }
      }
    }
    
    res.json({ files });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

// 获取文件信息
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const metadataPath = path.join('pages', 'metadata', `${req.params.fileId}.json`);
    
    if (!await fsExtra.pathExists(metadataPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const metadata = await fsExtra.readJSON(metadataPath);
    res.json(metadata);
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

// 下载文件
app.get('/api/files/:fileId/download', async (req, res) => {
  try {
    const metadataPath = path.join('pages', 'metadata', `${req.params.fileId}.json`);
    
    if (!await fsExtra.pathExists(metadataPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const metadata = await fsExtra.readJSON(metadataPath);
    
    // 重新组装文件
    const chunks = [];
    for (const chunk of metadata.chunks) {
      const chunkPath = path.join('pages', 'chunks', chunk.id);
      if (await fsExtra.pathExists(chunkPath)) {
        const chunkBuffer = await fs.promises.readFile(chunkPath);
        chunks.push(chunkBuffer);
      }
    }
    
    // 合并所有分块
    const fileBuffer = Buffer.concat(chunks);
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.name}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// 删除文件
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const metadataPath = path.join('pages', 'metadata', `${req.params.fileId}.json`);
    
    if (!await fsExtra.pathExists(metadataPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const metadata = await fsExtra.readJSON(metadataPath);
    
    // 删除元数据文件
    await fsExtra.remove(metadataPath);
    
    // 删除分块文件
    for (const chunk of metadata.chunks) {
      const chunkPath = path.join('pages', 'chunks', chunk.id);
      await fsExtra.remove(chunkPath);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload files to: http://localhost:${PORT}`);
});