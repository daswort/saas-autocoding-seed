import { Server } from "modelcontextprotocol/server"; import { z } from "zod"; import { $ } from "zx";
const s = new Server({ name: "pkg-mcp", version: "0.1.0" });
const FRONT = { react: 'pnpm -C frontend i', vue: 'pnpm -C frontend i', flutter: 'flutter pub get' } as const;
const BACK  = { go: 'go mod tidy', node: 'pnpm -C backend i', python: 'pip install -r requirements.txt' } as const;

s.tool("pkg.install", { input: z.object({ target: z.enum(["front","back"]).default("front"), key: z.string().optional() }), description: "Install dependencies via adapter", handler: async ({ target, key }) => {
  const table = target==="front"? FRONT: BACK; const cmd = key && table[key as keyof typeof table] || Object.values(table)[0] || 'echo skip';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
}});

await s.start();