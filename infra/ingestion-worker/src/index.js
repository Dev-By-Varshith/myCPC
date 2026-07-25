import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

const app = new Hono()

// Basic health check
app.get('/', (c) => c.text('MyCPC Ingestion Worker is online!'))

// Ingestion endpoint (protected by JWT)
app.post('/ingest', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.split(' ')[1];
  
  // Verify JWT (Using basic subtle crypto or hono/jwt in a real worker, 
  // but for Phase 2 we use Hono's JWT logic dynamically bound to env.JWT_SECRET)
  let payload;
  try {
    const { verify } = await import('hono/jwt');
    payload = await verify(token, c.env.JWT_SECRET);
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const cfHandle = payload.cfHandle;
  if (!cfHandle) {
    return c.json({ error: 'Token missing cfHandle' }, 400);
  }

  // Parse trace
  let traceData;
  try {
    traceData = await c.req.json();
  } catch (e) {
    return c.json({ error: 'Invalid JSON trace body' }, 400);
  }

  // Deduplication & R2 Storage
  // We use the trace startedAt timestamp to ensure uniqueness per user per session
  const timestamp = traceData.startedAt || Date.now();
  const objectKey = `${cfHandle}/session-${timestamp}.json`;

  try {
    // Compress and store in Cloudflare R2
    await c.env.TRACES_BUCKET.put(objectKey, JSON.stringify(traceData), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        handle: cfHandle,
        ingestedAt: new Date().toISOString()
      }
    });

    return c.json({ success: true, key: objectKey });
  } catch (e) {
    console.error('R2 Put Error:', e);
    return c.json({ error: 'Failed to write trace to R2' }, 500);
  }
})

export default app
