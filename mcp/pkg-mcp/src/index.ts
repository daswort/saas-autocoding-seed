// mcp/pkg-mcp/src/index.ts  (resumen mínimo)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod"; import { $ } from "zx";

const server = new McpServer({ name: "pkg-mcp", version: "0.1.0" });
const handlers = new Map<string,(a:any)=>Promise<any>>();
function reg(name:string, schema:any, desc:string, fn:(a:any)=>Promise<any>) {
  handlers.set(name, fn);
  server.registerTool(name, { title:name, description:desc, inputSchema:schema },
    async (a)=>({ content:[{ type:"text", text: JSON.stringify(await fn(a)) }] }));
}

reg("pkg.install",
  { target: z.enum(["front","back"]).default("front"), key: z.string().optional() },
  "Install dependencies via adapter",
  async ({ target, key }) => {
    const FRONT = { react:'pnpm -C frontend i', vue:'pnpm -C frontend i', flutter:'flutter pub get' } as const;
    const BACK  = { go:'go mod tidy', node:'pnpm -C backend i', python:'pip install -r requirements.txt' } as const;
    const table = target==="front" ? FRONT : BACK;
    const cmd = key && table[key as keyof typeof table] || Object.values(table)[0] || "echo skip";
    const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
  }
);

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

app.get("/mcp", async (req,res)=>{ ensureAcceptHeader(req, { includeJson: false }); await handleMcpRequest(req,res); });
app.post("/mcp", async (req,res)=>{ ensureAcceptHeader(req); await handleMcpRequest(req,res,req.body); });
// importante: raíz “/”
app.get("/", async (req,res)=>{ ensureAcceptHeader(req, { includeJson: false }); await handleMcpRequest(req,res); });
app.post("/", async (req,res)=>{ ensureAcceptHeader(req); await handleMcpRequest(req,res,req.body); });

app.listen(3004, ()=>console.log("pkg-mcp http://localhost:3004/{mcp|}"));
