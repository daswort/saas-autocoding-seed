import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod"; import { $ } from "zx";


const server = new McpServer({ name: "build-mcp", version: "0.1.0" });
const handlers = new Map<string, (a:any)=>Promise<any>>();
const FRONT = { react: 'pnpm -C frontend build', vue: 'pnpm -C frontend build', flutter: 'flutter build web' } as const;
const BACK = { go: 'go build ./...', node: 'pnpm -C backend build', python: 'python -m py_compile $(git ls-files "backend/**/*.py")' } as const;


function reg(name:string, schema:any, desc:string, fn:(a:any)=>Promise<any>) { handlers.set(name, fn); server.registerTool(name,{title:name,description:desc,inputSchema:schema}, async (a)=>({ content:[{type:"text", text: JSON.stringify(await fn(a)) }] })); }


reg("build.front", { framework: z.string().optional() }, "Build frontend", async ({ framework }) => {
const cmd = framework && FRONT[framework as keyof typeof FRONT] || 'echo no-front';
const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
});


reg("build.back", { lang: z.string().optional() }, "Build backend", async ({ lang }) => {
const cmd = lang && BACK[lang as keyof typeof BACK] || 'echo no-back';
const r = await $`bash -lc ${cmd}`.nothrow(); return { ok: r.exitCode===0, output: r.stdout||r.stderr };
});


const app = express(); app.use(express.json());
app.post("/mcp", async (req,res)=>{ const t=new StreamableHTTPServerTransport({enableJsonResponse:true}); res.on("close",()=>t.close()); await server.connect(t); await t.handleRequest(req,res,req.body); });
app.post("/", async (req, res) => {
  const t = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => t.close());
  await server.connect(t);
  await t.handleRequest(req, res, req.body);
});
app.post("/tool/:name", async (req,res)=>{ try{ const h=handlers.get(req.params.name); if(!h) return res.status(404).json({error:"tool not found"}); res.json(await h(req.body||{})); }catch(e:any){ res.status(500).json({error:e.message}); }});
app.listen(3001, ()=>console.log("build-mcp http://localhost:3001/{mcp|tool/*}"));