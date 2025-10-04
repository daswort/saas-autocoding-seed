import { Server } from "modelcontextprotocol/server"; import { z } from "zod"; import { $ } from "zx";
const s = new Server({ name: "build-mcp", version: "0.1.0" });
const FRONT = { react: 'pnpm -C frontend build', vue: 'pnpm -C frontend build', flutter: 'flutter build web' } as const;
const BACK  = { go: 'go build ./...', node: 'pnpm -C backend build', python: 'python -m py_compile $(git ls-files "backend/**/*.py")' } as const;

s.tool("build.front", { input: z.object({ framework: z.string().optional() }), description: "Build frontend via adapter", handler: async ({ framework }) => {
  const cmd = framework && FRONT[framework as keyof typeof FRONT] || 'echo no-front';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

s.tool("build.back", { input: z.object({ lang: z.string().optional() }), description: "Build backend via adapter", handler: async ({ lang }) => {
  const cmd = lang && BACK[lang as keyof typeof BACK] || 'echo no-back';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

await s.start();