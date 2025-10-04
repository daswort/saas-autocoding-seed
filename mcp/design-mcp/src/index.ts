import { Server } from "modelcontextprotocol/server"; import { z } from "zod"; import { $ } from "zx";
const s = new Server({ name: "design-mcp", version: "0.1.0" });

s.tool("design.spec", { input: z.object({ file: z.string().default("design/uxui.md") }), description: "Persist UX spec; integrate with Figma via CLI if configured", handler: async ({ file }) => {
  await $`mkdir -p design`; await $`bash -lc 'touch ${file}'`;
  return { ok: true, file };
}});

await s.start();