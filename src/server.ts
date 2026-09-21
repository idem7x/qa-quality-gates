import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { quoteFare } from './fare.ts';
import { IdempotencyConflictError, RefundProcessor } from './refund.ts';

const refunds = new RefundProcessor({
  'TK-1001': { amountMinor: 45_000, currency: 'EUR' },
  'TK-1002': { amountMinor: 120_000, currency: 'USD' },
});

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && req.url === '/ready') {
      return json(res, 200, { status: 'ready', version: process.env.APP_VERSION ?? 'dev' });
    }
    if (req.method === 'POST' && req.url === '/fare/quote') {
      const body = (await readBody(req)) as Parameters<typeof quoteFare>[0];
      return json(res, 200, quoteFare(body));
    }
    if (req.method === 'POST' && req.url === '/refunds') {
      const key = req.headers['idempotency-key'];
      const body = (await readBody(req)) as Parameters<RefundProcessor['process']>[1];
      const result = refunds.process(typeof key === 'string' ? key : '', body);
      return json(res, result.replayed ? 200 : 201, result);
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      return json(res, 409, { error: err.message });
    }
    return json(res, 400, { error: err instanceof Error ? err.message : 'bad request' });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`fare service listening on :${port}`);
});
