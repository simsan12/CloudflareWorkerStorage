# Cloudflare R2 文件管理器

这是一个用于在Cloudflare Pages上部署的文件管理系统，支持大文件分块存储和S3-like API。

## 项目结构

```
cloudflareR2/
├── src/
│   └── server.js              # 本地文件管理服务
├── pages/
│   ├── api/
│   │   ├── files.js           # 文件列表和信息API
│   │   └── download/          # 文件下载API
│   ├── metadata/              # 文件元数据存储
│   └── chunks/                # 文件分块存储
├── functions/
│   └── api/
│       ├── files.js           # Cloudflare Pages文件列表API
│       └── download/[fileId].js # Cloudflare Pages文件下载API
├── public/
│   └── index.html             # Web管理界面
├── uploads/                   # 临时上传目录
├── chunks/                    # 临时分块目录
├── package.json
├── wrangler.toml              # Cloudflare Pages配置
```

## 核心函数流程

### 1. 文件上传流程 (`src/server.js`)

#### 1.1 `decodeFilename()` - 文件名编码修复
```javascript
// 位置: src/server.js:23-50
// 功能: 修复UTF-8双重编码的文件名
// 流程:
// 1. 检查文件名是否包含典型的UTF-8双重编码特征
// 2. 将字符串作为Latin-1字节序列重新解释为UTF-8
// 3. 验证解码结果是否包含中文字符且没有替换字符
// 4. 返回修复后的文件名或原文件名
```

#### 1.2 `chunkFile()` - 文件分块处理
```javascript
// 位置: src/server.js:98-142
// 功能: 将大文件分割为固定大小的块，避免内存问题
// 流程:
// 1. 获取文件大小并计算需要的分块数量
// 2. 对每个分块创建读写流
// 3. 流式读取文件指定范围的数据
// 4. 同时计算每个分块的MD5哈希值
// 5. 将分块保存到临时目录
// 6. 返回分块信息数组、文件大小和分块数量
```

#### 1.3 `generateFileMetadata()` - 生成文件元数据
```javascript
// 位置: src/server.js:145-169
// 功能: 生成包含文件信息的元数据，支持文件校验
// 流程:
// 1. 读取文件统计信息
// 2. 计算整个文件的MD5哈希值
// 3. 与原始哈希值进行比较验证
// 4. 生成包含文件ID、名称、大小、分块信息、哈希值等元数据
// 5. 返回完整的元数据对象
```

#### 1.4 `POST /api/upload` - 文件上传主流程
```javascript
// 位置: src/server.js:174-225
// 功能: 处理文件上传的完整流程
// 流程:
// 1. 接收上传的文件并生成唯一文件ID
// 2. 调用chunkFile()将文件分块
// 3. 调用generateFileMetadata()生成元数据
// 4. 将元数据保存到pages/metadata目录
// 5. 复制分块文件到pages/chunks目录
// 6. 清理临时文件和分块目录
// 7. 返回上传结果，包含文件ID、哈希验证状态等信息
```

### 2. 文件下载流程

#### 2.1 Cloudflare Pages下载 (`functions/api/download/[fileId].js`)
```javascript
// 位置: functions/api/download/[fileId].js:2-129
// 功能: 支持分块下载和断点续传
// 流程:
// 1. 获取文件ID和Range请求头
// 2. 读取文件元数据
// 3. 如果没有Range头，返回完整文件
// 4. 如果有Range头，解析请求范围
// 5. 计算需要哪些分块来满足范围请求
// 6. 从静态文件中读取并合并所需分块
// 7. 返回206状态码和Content-Range头
```

#### 2.2 本地服务下载 (`src/server.js:276-308`)
```javascript
// 功能: 本地开发环境的文件下载
// 流程:
// 1. 读取文件元数据
// 2. 重新组装所有分块
// 3. 设置下载响应头
// 4. 返回完整文件
```

### 3. 文件管理流程

#### 3.1 `GET /api/files` - 文件列表
```javascript
// 位置: src/server.js:228-256 (本地服务)
// 位置: functions/api/files.js:2-51 (Cloudflare Pages)
// 功能: 获取所有可用文件的列表
// 流程:
// 1. 扫描metadata目录
// 2. 读取所有JSON元数据文件
// 3. 提取文件基本信息（ID、名称、大小、上传时间等）
// 4. 返回文件列表
```

#### 3.2 `DELETE /api/files/:fileId` - 文件删除
```javascript
// 位置: src/server.js:311-335
// 功能: 删除文件及其所有分块
// 流程:
// 1. 读取文件元数据
// 2. 删除元数据文件
// 3. 删除所有关联的分块文件
// 4. 返回删除成功状态
```

### 4. 文件校验流程

#### 4.1 前端MD5计算 (`public/index.html`)
```javascript
// 功能: 在上传前计算文件MD5哈希
// 流程:
// 1. 使用FileReader读取文件
// 2. 调用自定义MD5算法计算哈希
// 3. 将哈希值包含在上传请求中
// 4. 上传完成后验证服务端返回的哈希
```

#### 4.2 服务端哈希验证 (`src/server.js:155`)
```javascript
// 功能: 验证上传文件的完整性
// 流程:
// 1. 计算上传文件的MD5哈希
// 2. 与客户端提供的原始哈希比较
// 3. 在元数据中记录验证结果
// 4. 返回验证状态给客户端
```

## 功能特性

- 大文件分块上传和存储（25MB分块大小）
- 文件元数据管理
- S3-like API接口
- 支持断点续传下载
- Web管理界面
- 静态托管平台部署
- 文件完整性校验（MD5哈希验证）
- UTF-8文件名编码修复
- 支持中文文件名

## API端点

### 本地管理服务

- `POST /api/upload` - 上传文件
- `GET /api/files` - 获取文件列表
- `GET /api/files/:fileId` - 获取文件信息
- `DELETE /api/files/:fileId` - 删除文件
- `GET /api/files/:fileId/download` - 下载文件

### Pages部署API

- `GET /api/files` - 获取文件列表
- `GET /api/download/:fileId` - 下载文件（支持Range请求）

## 使用方法

### 1. 安装依赖

```bash
npm install
```

### 2. 启动本地服务

```bash
npm start
```

### 3. 访问Web界面

打开浏览器访问 `http://localhost:3000`

### 4. 部署到Pages平台

#### Cloudflare Pages部署
```bash
npm install -g wrangler
wrangler pages deploy pages
```

## 配置参数

### 服务端配置
- **分块大小**: 25MB (`src/server.js:90`)
- **端口**: 3000（可修改环境变量PORT）
- **元数据目录**: `pages/metadata/`
- **分块目录**: `pages/chunks/`

### 支持的文件类型
- 所有文件类型（无限制）
- 特别优化了大文件处理
- 支持中文文件名

## 文件校验机制

### 校验流程
1. **前端计算**: 上传前计算文件MD5哈希
2. **服务端验证**: 上传后重新计算哈希进行比对
3. **结果记录**: 在元数据中记录验证状态
4. **用户反馈**: 显示校验结果

### 哈希算法
- 使用MD5算法进行文件校验
- 前端和后端使用相同的MD5实现
- 支持大文件的流式哈希计算

## 部署说明

### 两阶段部署
1. **本地服务阶段**: 用于文件上传和管理，生成元数据和分块文件
2. **静态部署阶段**: 将pages目录部署到Cloudflare Pages，提供只读访问

### Cloudflare Pages配置
- **部署工具**: Wrangler CLI
- **函数运行时**: Cloudflare Workers
- **区域覆盖**: 全球
- **备案要求**: 不需要
- **配置文件**: `wrangler.toml`

## 注意事项

- Pages平台需要配置路由规则
- 文件分块会自动合并提供下载
- 支持Range请求实现断点续传
- 需要确保CORS配置正确
- 中文文件名会自动进行编码修复
- 文件校验失败时会在前端显示警告信息