import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod"; import { $ } from "zx";


const server = new McpServer({ name: "test-mcp", version: "0.1.0" });
const handlers = new Map<string, (a:any)=>Promise<any>>();
const FRONT = { react: 'pnpm -C frontend test -- --watch=false', vue: 'pnpm -C frontend test', flutter: 'flutter test' } as const;
const BACK = { go: 'go test -race -short ./...', node: 'pnpm -C backend test', python: 'pytest -q' } as const;


function reg(name:string, schema:any, desc:string, fn:(a:any)=>Promise<any>) { handlers.set(name, fn); server.registerTool(name,{title:name,description:desc,inputSchema:schema}, async (a)=>({ content:[{type:"text", text: JSON.stringify(await fn(a)) }] })); }


reg("test.front", { framework: z.string().optional() }, "Run frontend tests", async ({ framework }) => {
const cmd = framework && FRONT[framework as keyof typeof FRONT] || 'echo no-front-tests';
const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
});


reg("test.back", { lang: z.string().optional() }, "Run backend tests", async ({ lang }) => {
const cmd = lang && BACK[lang as keyof typeof BACK] || 'echo no-back-tests';
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

app.get("/mcp", async (req, res) => {
  ensureAcceptHeader(req, { includeJson: false });
  await handleMcpRequest(req, res);
});
app.get("/", async (req, res) => {
  ensureAcceptHeader(req, { includeJson: false });
  await handleMcpRequest(req, res);
});
app.post("/mcp", async (req,res)=>{ ensureAcceptHeader(req); await handleMcpRequest(req,res,req.body); });
app.post("/", async (req, res) => {
  ensureAcceptHeader(req);
  await handleMcpRequest(req, res, req.body);
});
app.post("/tool/:name", async (req,res)=>{ try{ const h=handlers.get(req.params.name); if(!h) return res.status(404).json({error:"tool not found"}); res.json(await h(req.body||{})); }catch(e:any){ res.status(500).json({error:e.message}); }});
app.listen(3002, ()=>console.log("test-mcp http://localhost:3002/{mcp|tool/*}"));
