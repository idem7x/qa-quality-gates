import { defineConfig } from 'vitest/config';

// Coverage thresholds are the gate: if any number drops below the line,
// `vitest run --coverage` exits non-zero and CI blocks the merge.
// Strategy for legacy code: start at the current baseline and ratchet up —
// never allow a decrease, raise the floor as coverage improves (see docs/decisions.md).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/server.ts'], // entrypoint wiring — covered by smoke tests instead
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
});
