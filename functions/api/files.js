// 文件列表API - 从静态metadata文件中读取
export async function onRequest(context) {
  try {
    const files = [];
    
    // 已知的元数据文件列表
    const metadataFiles = [
      'a844c832ef148d67dd0138308ed3894a.json',
      '60a5fca44aa6d5213635253535de1e22.json',
      '7935ff9cd6ec3ed4c1a38389acd7799d.json'
    ];
    
    for (const metadataFile of metadataFiles) {
      try {
        const metadataUrl = new URL(`/metadata/${metadataFile}`, context.request.url);
        const metadataResponse = await fetch(metadataUrl);
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          files.push({
            id: metadata.id,
            name: metadata.name,
            size: metadata.size,
            chunks: metadata.totalChunks,
            uploadTime: metadata.uploadTime,
            mimeType: metadata.mimeType,
            hash: metadata.hash,
            hashVerified: metadata.hashVerified
          });
        }
      } catch (e) {
        console.log(`Failed to load metadata file ${metadataFile}:`, e.message);
      }
    }
    
    return new Response(JSON.stringify({ files }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Files API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get files', details: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}