# Cloudflare R2 文件管理器

这是一个用于在Cloudflare Pages或EdgeOne Pages上部署的文件管理系统，支持大文件分块存储和S3-like API。

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
├── public/
│   └── index.html             # Web管理界面
├── uploads/                   # 临时上传目录
├── chunks/                    # 临时分块目录
└── package.json
```

## 功能特性

- 大文件分块上传和存储
- 文件元数据管理
- S3-like API接口
- 支持断点续传下载
- Web管理界面
- 静态托管平台部署

## API端点

### 本地管理服务

- `POST /api/upload` - 上传文件
- `GET /api/files` - 获取文件列表
- `GET /api/files/:fileId` - 获取文件信息
- `DELETE /api/files/:fileId` - 删除文件

### Pages部署API

- `GET /api/files` - 获取文件列表
- `POST /api/files` - 获取文件信息
- `GET /api/download/:fileId` - 下载文件

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

将 `pages` 目录的内容部署到Cloudflare Pages或EdgeOne Pages。

## 配置

- 分块大小：5MB（可在server.js中修改CHUNK_SIZE）
- 支持的文件类型：所有文件类型
- 元数据格式：JSON

## 部署说明

1. **本地服务**：用于文件上传和管理，生成元数据和分块文件
2. **Pages部署**：只读访问，提供文件下载和列表功能
3. **静态托管**：无需数据库，通过JSON文件管理元数据

## 注意事项

- Pages平台需要配置路由规则
- 文件分块会自动合并提供下载
- 支持Range请求实现断点续传
- 需要确保CORS配置正确