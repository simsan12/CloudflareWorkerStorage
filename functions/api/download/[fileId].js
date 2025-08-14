// 文件下载API - 从静态chunks文件中读取并支持分块下载
export async function onRequest(context) {
  try {
    const fileId = context.params.fileId;
    const range = context.request.headers.get('range');
    
    // 获取文件元数据
    const metadataUrl = new URL(`/metadata/${fileId}.json`, context.request.url);
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      return new Response('File not found', { status: 404 });
    }
    
    const metadataJson = await metadataResponse.json();
    
    // 如果没有Range头，返回整个文件
    if (!range) {
      // 获取所有分块
      const chunks = [];
      for (const chunk of metadataJson.chunks) {
        try {
          const chunkUrl = new URL(`/chunks/${chunk.id}`, context.request.url);
          const chunkResponse = await fetch(chunkUrl);
          if (chunkResponse.ok) {
            const chunkArray = new Uint8Array(await chunkResponse.arrayBuffer());
            chunks.push(chunkArray);
          }
        } catch (e) {
          console.error(`Failed to fetch chunk ${chunk.id}:`, e);
        }
      }
      
      // 合并所有分块
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      
      // 返回完整文件
      return new Response(result, {
        status: 200,
        headers: {
          'Content-Length': totalLength.toString(),
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${metadataJson.name}"`,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // 解析Range头
    const rangeMatch = range.match(/bytes=(\d+)-(\d*)/);
    if (!rangeMatch) {
      return new Response('Invalid range header', { status: 400 });
    }
    
    const start = parseInt(rangeMatch[1]);
    const end = rangeMatch[2] ? parseInt(rangeMatch[2]) : metadataJson.size - 1;
    
    if (start >= metadataJson.size || end >= metadataJson.size) {
      return new Response('Range not satisfiable', { status: 416 });
    }
    
    // 计算需要哪些分块
    const neededChunks = [];
    let currentPos = 0;
    
    for (let i = 0; i < metadataJson.chunks.length; i++) {
      const chunk = metadataJson.chunks[i];
      const chunkEnd = currentPos + chunk.size - 1;
      
      if (start <= chunkEnd && end >= currentPos) {
        neededChunks.push({
          chunk,
          offset: Math.max(0, start - currentPos),
          length: Math.min(chunk.size, end - currentPos + 1) - Math.max(0, start - currentPos)
        });
      }
      
      currentPos = chunkEnd + 1;
    }
    
    // 从静态文件中读取并合并分块
    const chunks = [];
    for (const neededChunk of neededChunks) {
      try {
        const chunkUrl = new URL(`/chunks/${neededChunk.chunk.id}`, context.request.url);
        const chunkResponse = await fetch(chunkUrl);
        if (chunkResponse.ok) {
          const chunkArray = new Uint8Array(await chunkResponse.arrayBuffer());
          const chunkSlice = chunkArray.slice(neededChunk.offset, neededChunk.offset + neededChunk.length);
          chunks.push(chunkSlice);
        }
      } catch (e) {
        console.error(`Failed to fetch chunk ${neededChunk.chunk.id}:`, e);
      }
    }
    
    // 合并所有分块
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    // 返回响应
    return new Response(result, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${metadataJson.size}`,
        'Content-Length': (end - start + 1).toString(),
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    return new Response('Download failed', { status: 500 });
  }
}