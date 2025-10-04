import { Server } from "modelcontextprotocol/server"; import { z } from "zod"; import { $ } from "zx";
const s = new Server({ name: "test-mcp", version: "0.1.0" });
const FRONT = { react: 'pnpm -C frontend test -- --watch=false', vue: 'pnpm -C frontend test', flutter: 'flutter test' } as const;
const BACK  = { go: 'go test -race -short ./...', node: 'pnpm -C backend test', python: 'pytest -q' } as const;

s.tool("test.front", { input: z.object({ framework: z.string().optional() }), description: "Run frontend tests via adapter", handler: async ({ framework }) => {
  const cmd = framework && FRONT[framework as keyof typeof FRONT] || 'echo no-front-tests';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

s.tool("test.back", { input: z.object({ lang: z.string().optional() }), description: "Run backend tests via adapter", handler: async ({ lang }) => {
  const cmd = lang && BACK[lang as keyof typeof BACK] || 'echo no-back-tests';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

await s.start();