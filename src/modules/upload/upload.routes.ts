import { Router } from 'express';
import multer from 'multer';

// Use memory storage for multer to get the buffer for R2
const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = file.originalname.split('.').pop();
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const isCF = typeof globalThis !== 'undefined' && (
      'WebSocketPair' in globalThis || 
      'cinema_db' in globalThis || 
      (globalThis as any).MINIFLARE === true
    );

    let r2Bucket = (globalThis as any).R2_BUCKET;
    if (!r2Bucket && isCF) {
      try {
        // @ts-ignore
        const cfWorkers = await import('cloudflare:workers');
        r2Bucket = cfWorkers.env?.R2_BUCKET;
      } catch (e) {
        console.error("► Ошибка импорта cloudflare:workers в upload роуте:", e);
      }
    }
    
    if (r2Bucket) {
      // Upload to R2 Bucket
      await r2Bucket.put(filename, file.buffer, {
        httpMetadata: {
          contentType: file.mimetype
        }
      });
      // the base URL will simply be /api/upload/public/filename
    } else {
      // Fallback for local development
      const fs = await import('fs');
      const path = await import('path');
      const uploadDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
    }
    
    // We serve the file relative to the API domain
    return res.json({ url: `/api/upload/public/${filename}` });
  } catch (error: any) {
    console.error('Upload Error:', error);
    res.status(500).json({
      error: 'File upload failed',
      details: error.message || String(error),
      stack: error.stack || 'Нет стека'
    });
  }
});

router.get('/public/:filename', async (req, res) => {
  const filename = req.params.filename;
  
  try {
    const isCF = typeof globalThis !== 'undefined' && (
      'WebSocketPair' in globalThis || 
      'cinema_db' in globalThis || 
      (globalThis as any).MINIFLARE === true
    );

    let r2Bucket = (globalThis as any).R2_BUCKET;
    if (!r2Bucket && isCF) {
      try {
        // @ts-ignore
        const cfWorkers = await import('cloudflare:workers');
        r2Bucket = cfWorkers.env?.R2_BUCKET;
      } catch (e) {
        console.error("► Ошибка импорта cloudflare:workers в download роуте:", e);
      }
    }

    if (r2Bucket) {
      const object = await r2Bucket.get(filename);
      if (object === null) {
        return res.status(404).json({ error: 'File not found in R2' });
      }
      
      if (object.httpMetadata && object.httpMetadata.contentType) {
        res.setHeader('Content-Type', object.httpMetadata.contentType);
      }
      res.setHeader('Content-Length', object.size);
      res.setHeader('ETag', object.httpEtag);
      
      const arrayBuffer = await object.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
      return;
    }
    
    // Local fallback
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'uploads', filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error: any) {
    console.error('Download Error:', error);
    res.status(500).json({
      error: 'Error fetching file',
      details: error.message || String(error),
      stack: error.stack || 'Нет стека'
    });
  }
});

export default router;
