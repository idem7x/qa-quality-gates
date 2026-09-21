// AI-assisted CI failure triage: takes a failed job log and asks Claude for
// a first-pass classification (real bug / flaky test / infra issue), the most
// likely cause and a suggested next action. The output is a comment for a
// human to act on — it never retries, closes or merges anything.
//
// Usage: node scripts/ai-ci-triage.mjs <path-to-log-file>

import { readFile } from 'node:fs/promises';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const logPath = process.argv[2];

if (!logPath) {
  console.error('usage: node scripts/ai-ci-triage.mjs <log-file>');
  process.exit(1);
}
if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set — skipping triage');
  process.exit(0);
}

const log = await readFile(logPath, 'utf8');
// Keep the tail — that's where the failure almost always is — and cap tokens.
const tail = log.length > 30_000 ? log.slice(-30_000) : log;

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          'You are triaging a failed CI job for a Node.js/TypeScript service. Analyze this log tail and answer in markdown with exactly these sections:',
          '## Classification — one of: `real-failure`, `flaky-test`, `infra`, `dependency`, `unclear`',
          '## Probable cause — 1-3 sentences, cite the log line that supports it',
          '## Suggested action — one concrete next step for the engineer',
          'Be honest about uncertainty: `unclear` is a valid answer.',
          '',
          '```',
          tail,
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
const triage = data.content
  .filter((block) => block.type === 'text')
  .map((block) => block.text)
  .join('\n');

console.log('### 🤖 AI first-pass triage (verify before acting)\n');
console.log(triage);
