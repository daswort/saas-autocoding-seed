import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod"; import { $ } from "zx";

const server = new McpServer({ name: "design-mcp", version: "0.1.0" });

server.registerTool(
  "design.spec",
  { title:"design.spec", description:"Persist UX spec; optional Figma CLI", inputSchema:{ file: z.string().default("design/uxui.md") } },
  async ({ file }) => { await $`mkdir -p design`; await $`bash -lc 'touch ${file}'`; return { ok:true, file }; }
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
app.get("/", async (req,res)=>{ ensureAcceptHeader(req, { includeJson: false }); await handleMcpRequest(req,res); });
app.post("/mcp", async (req,res)=>{ ensureAcceptHeader(req); await handleMcpRequest(req,res,req.body); });
app.post("/", async (req,res)=>{ ensureAcceptHeader(req); await handleMcpRequest(req,res,req.body); });

app.listen(3005, ()=>console.log("design-mcp http://localhost:3005/{mcp|}"));
