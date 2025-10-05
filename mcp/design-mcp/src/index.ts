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
app.post("/mcp", async (req,res)=>{ const t=new StreamableHTTPServerTransport({ enableJsonResponse:true });
  res.on("close",()=>t.close()); await server.connect(t); await t.handleRequest(req,res,req.body); });
app.post("/", async (req,res)=>{ const t=new StreamableHTTPServerTransport({ enableJsonResponse:true });
  res.on("close",()=>t.close()); await server.connect(t); await t.handleRequest(req,res,req.body); });

app.listen(3005, ()=>console.log("design-mcp http://localhost:3005/{mcp|}"));
