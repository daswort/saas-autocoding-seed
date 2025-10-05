import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { $ } from "zx";
import { isAllowed } from "./policy.js";

const PORT = 40000;
const HOST = '0.0.0.0';

const server = new McpServer({ name: "repo-mcp", version: "0.1.0" });
const handlers = new Map<string, (args: any)=>Promise<any>>();

const env = ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env) ?? {};
const HEADER_NAME = env.MCP_TOOL_API_KEY_HEADER || "x-api-key";
const rawKeyList = env.REPO_MCP_TOOL_API_KEYS || env.REPO_MCP_TOOL_API_KEY || env.MCP_TOOL_API_KEYS || env.MCP_TOOL_API_KEY || "";
const ALLOWED_TOOL_KEYS = rawKeyList.split(",").map((value: string) => value.trim()).filter(Boolean);

const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (ALLOWED_TOOL_KEYS.length === 0) {
    res.status(503).json({ error: "tool api key not configured" });
    return;
  }
  const provided = req.get(HEADER_NAME) ?? (req.query[HEADER_NAME] as string | undefined);
  if (!provided || !ALLOWED_TOOL_KEYS.includes(provided)) {
    res.status(401).json({ error: "invalid api key" });
    return;
  }
  next();
};

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

function ensureAcceptHeader(req: express.Request, { includeJson = true } = {}) {
  const header = req.headers["accept"];
  const joined = Array.isArray(header) ? header.join(",") : header ?? "";
  const parts = joined.split(",").map((p) => p.trim()).filter(Boolean);
  if (includeJson && !parts.some((p) => p.includes("application/json"))) parts.push("application/json");
  if (!parts.some((p) => p.includes("text/event-stream"))) parts.push("text/event-stream");
  req.headers["accept"] = parts.join(", ");
}

async function handleMcpRequest(req: express.Request, res: express.Response, body?: unknown) {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

app.get("/mcp", async (req, res) => {
  ensureAcceptHeader(req, { includeJson: false });
  await handleMcpRequest(req, res);
});
app.post("/mcp", async (req, res) => {
  ensureAcceptHeader(req);
  await handleMcpRequest(req, res, req.body);
});

app.get("/", async (req, res) => {
  ensureAcceptHeader(req, { includeJson: false });
  await handleMcpRequest(req, res);
});
app.post("/", async (req, res) => {
  ensureAcceptHeader(req);
  await handleMcpRequest(req, res, req.body);
});

app.post("/tool/:name", requireApiKey, async (req, res) => {
  try {
    const h = handlers.get(req.params.name);
    if (!h) return res.status(404).json({ error: "tool not found" });
    const out = await h(req.body || {});
    res.json(out);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`repo-mcp http://${HOST}:${PORT}/{mcp|tool/*}`);
});