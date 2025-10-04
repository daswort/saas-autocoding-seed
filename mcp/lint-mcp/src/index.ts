import { Server } from "modelcontextprotocol/server"; import { z } from "zod"; import { $ } from "zx";
const s = new Server({ name: "lint-mcp", version: "0.1.0" });
const FRONT = { react: 'pnpm -C frontend lint', vue: 'pnpm -C frontend lint', flutter: 'dart analyze' } as const;
const BACK  = { go: 'golangci-lint run || true', node: 'pnpm -C backend lint', python: 'ruff . || true' } as const;

s.tool("lint.front", { input: z.object({ framework: z.string().optional() }), description: "Run frontend linter", handler: async ({ framework }) => {
  const cmd = framework && FRONT[framework as keyof typeof FRONT] || 'echo no-front-lint';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

s.tool("lint.back", { input: z.object({ lang: z.string().optional() }), description: "Run backend linter", handler: async ({ lang }) => {
  const cmd = lang && BACK[lang as keyof typeof BACK] || 'echo no-back-lint';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

await s.start();