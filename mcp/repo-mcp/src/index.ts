import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { $ } from "zx";
import { isAllowed } from "./policy.js";

const server = new McpServer({ name: "repo-mcp", version: "0.1.0" });
const handlers = new Map<string, (args: any)=>Promise<any>>();

function registerTool(name: string, schema: any, desc: string, handler: (args:any)=>Promise<any>) {
  handlers.set(name, handler);
  server.registerTool(
    name,
    { title: name, description: desc, inputSchema: schema },
    async (args) => {
      const out = await handler(args);
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    }
  );
}

registerTool(
  "repo.scan",
  { path: z.string().default(".") },
  "List project tree and common manifests",
  async ({ path }) => {
    const tree = await $`bash -lc 'ls -la ${path} | sed -n "1,200p"'`;
    const manifests = await $`bash -lc 'ls -1 **/{package.json,pubspec.yaml,go.mod,pyproject.toml,pom.xml,Cargo.toml,requirements.txt} 2>/dev/null | sed -n "1,200p"'`.nothrow();
    return { tree: tree.stdout, manifests: manifests.stdout };
  }
);

registerTool(
  "repo.write",
  { path: z.string(), content: z.string() },
  "Write file within policy allowlist",
  async ({ path, content }) => {
    if (!isAllowed(path)) throw new Error("path not allowed");
    await $`mkdir -p ${path.split('/').slice(0,-1).join('/')}`;
    await $`bash -lc ${`cat > ${path} <<'EOF'
${content}
EOF`}`;
    return { ok: true };
  }
);

registerTool(
  "repo.pr",
  { title: z.string(), body: z.string().optional(), branch: z.string().default("auto/feature") },
  "Create PR via gh",
  async ({ title, body, branch }) => {
    await $`git checkout -B ${branch}`;
    await $`git add -A`;
    await $`git commit -m ${title}`.nothrow();
    await $`git push -u origin ${branch}`;
    const out = await $`gh pr create --title ${title} --body ${body||title}`.nothrow();
    return { pr: out.stdout.trim() };
  }
);

registerTool(
  "ci.run",
  { ref: z.string().default("HEAD") },
  "Trigger GitHub workflow",
  async ({ ref }) => {
    const out = await $`gh workflow run ci.yml --ref ${ref}`.nothrow();
    return { run: out.stdout.trim() };
  }
);

// HTTP transport for MCP and simple /tool proxy
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.post("/", async (req, res) => {
  const t = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => t.close());
  await server.connect(t);
  await t.handleRequest(req, res, req.body);
});

app.post("/tool/:name", async (req, res) => {
  try {
    const h = handlers.get(req.params.name);
    if (!h) return res.status(404).json({ error: "tool not found" });
    const out = await h(req.body || {});
    res.json(out);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log("repo-mcp http://localhost:3000/{mcp|tool/*}"));