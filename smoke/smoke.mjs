// Post-deploy smoke test: runs against a real deployed instance (BASE_URL).
// Exit code is the promotion criterion — non-zero blocks/rolls back the release.
// Checks are few, fast and business-shaped: is the service up, does it answer
// a real fare quote correctly, is idempotency behaving.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 5000);

let failures = 0;

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    console.log(`  ok   ${name} (${Date.now() - started}ms)`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

async function http(method, path, { body, headers } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, body: await res.json() };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

console.log(`smoke tests against ${BASE_URL}`);

await check('liveness: GET /health', async () => {
  const { status, body } = await http('GET', '/health');
  assert(status === 200 && body.status === 'ok', `got ${status} ${JSON.stringify(body)}`);
});

await check('readiness: GET /ready reports a version', async () => {
  const { status, body } = await http('GET', '/ready');
  assert(status === 200 && typeof body.version === 'string', `got ${status}`);
});

await check('business path: fare quote computes base + taxes', async () => {
  const { status, body } = await http('POST', '/fare/quote', {
    body: { baseMinor: 10_000, currency: 'EUR', taxes: [{ code: 'IVA', ratePct: 21 }] },
  });
  assert(status === 200, `got ${status}`);
  assert(body.total.amountMinor === 12_100, `wrong total: ${body.total.amountMinor}`);
});

await check('idempotency: replaying a refund does not refund twice', async () => {
  const key = `smoke-${process.env.GITHUB_RUN_ID ?? 'local'}-${process.pid}`;
  const payload = { body: { ticketId: 'TK-1001', amountMinor: 100, currency: 'EUR' }, headers: { 'idempotency-key': key } };
  const first = await http('POST', '/refunds', payload);
  const replay = await http('POST', '/refunds', payload);
  assert(first.status === 201, `first refund: got ${first.status}`);
  assert(replay.status === 200 && replay.body.replayed === true, 'replay was not detected');
  assert(replay.body.remainingMinor === first.body.remainingMinor, 'balance decremented twice!');
});

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed — do not promote this deploy`);
  process.exit(1);
}
console.log('\nall smoke checks passed — deploy is promotable');
