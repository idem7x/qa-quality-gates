// AI-assisted test generation: reads the coverage report, finds the
// worst-covered source file, and asks Claude to PROPOSE tests for it.
// Output goes to ai-proposals/ (gitignored) — a human reviews, edits and
// commits what is actually worth keeping. The AI never commits tests itself:
// generated tests that assert current behavior can freeze bugs in place.
//
// Usage: ANTHROPIC_API_KEY=... npm run test:coverage && npm run ai:test-gen

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename } from 'node:path';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set — skipping (this tool is assistive, never required)');
  process.exit(0);
}

const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
const files = Object.entries(summary)
  .filter(([path]) => path !== 'total')
  .map(([path, cov]) => ({ path, lines: cov.lines.pct, branches: cov.branches.pct }))
  .sort((a, b) => a.lines - b.lines);

const target = files[0];
if (!target || target.lines >= 100) {
  console.log('no under-covered files — nothing to propose');
  process.exit(0);
}

console.log(`least-covered file: ${target.path} (lines ${target.lines}%, branches ${target.branches}%)`);
const source = await readFile(target.path, 'utf8');

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          'You are proposing vitest unit tests for a TypeScript module in a fintech fare/refund service.',
          'Focus on uncovered branches, boundary values and money-specific edge cases (rounding, currency mismatch, idempotency).',
          'Return ONLY the TypeScript test file content, importing from the module with a relative path and .ts extension.',
          '',
          `Module path: ${target.path}`,
          '```typescript',
          source,
          '```',
        ].join('\n'),
      },
    ],
  }),
});

if (!res.ok) {
  console.error(`API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
const proposal = data.content
  .filter((block) => block.type === 'text')
  .map((block) => block.text)
  .join('\n')
  .replace(/^```(typescript|ts)?\n?/m, '')
  .replace(/\n```\s*$/m, '');

await mkdir('ai-proposals', { recursive: true });
const outPath = `ai-proposals/${basename(target.path, '.ts')}.proposed.test.ts`;
await writeFile(outPath, proposal);

console.log(`proposal written to ${outPath}`);
console.log('review it, keep what adds value, delete what asserts accidental behavior.');
