import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod"; import { $ } from "zx";

const PORT = 40003;
const HOST = '0.0.0.0';

const server = new McpServer({ name: "lint-mcp", version: "0.1.0" });
function reg(name:string, schema:any, desc:string, fn:(a:any)=>Promise<any>) {
  server.registerTool(name, { title:name, description:desc, inputSchema:schema },
    async (a)=>({ content:[{ type:"text", text: JSON.stringify(await fn(a)) }] }));
}

const FRONT = { react: 'pnpm -C frontend lint', vue: 'pnpm -C frontend lint', flutter: 'dart analyze' } as const;
const BACK  = { go: 'golangci-lint run || true', node: 'pnpm -C backend lint', python: 'ruff . || true' } as const;

reg("lint.front", { framework: z.string().optional() }, "Run frontend linter", async ({ framework }) => {
  const cmd = framework && FRONT[framework as keyof typeof FRONT] || 'echo no-front-lint';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
});
reg("lint.back", { lang: z.string().optional() }, "Run backend linter", async ({ lang }) => {
  const cmd = lang && BACK[lang as keyof typeof BACK] || 'echo no-back-lint';
  const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
});

const app = express(); app.use(express.json());

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

// MCP en /mcp
app.get("/mcp", async (req, res) => {
  ensureAcceptHeader(req, { includeJson: false });
  await handleMcpRequest(req, res);
});
app.post("/mcp", async (req, res) => {
  ensureAcceptHeader(req);
  await handleMcpRequest(req, res, req.body);
});
// MCP también en la raíz /
app.get("/", async (req, res) => {
  ensureAcceptHeader(req, { includeJson: false });
  await handleMcpRequest(req, res);
});
app.post("/", async (req, res) => {
  ensureAcceptHeader(req);
  await handleMcpRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`repo-mcp http://${HOST}:${PORT}/{mcp|tool/*}`);
});
