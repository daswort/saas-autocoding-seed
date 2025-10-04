# Auto‑Coding Seed (agnóstico)

Requisitos: Node 20+, pnpm, Python 3.11+, n8n, gh CLI. Para stacks específicos instala toolchains locales (Go/Java/Python/Flutter/etc.).

1) MCP servers:
   pnpm -C mcp/repo-mcp i && pnpm -C mcp/repo-mcp start
   pnpm -C mcp/build-mcp i && pnpm -C mcp/build-mcp start
   pnpm -C mcp/test-mcp  i && pnpm -C mcp/test-mcp start
   pnpm -C mcp/lint-mcp  i && pnpm -C mcp/lint-mcp start
   pnpm -C mcp/pkg-mcp   i && pnpm -C mcp/pkg-mcp start
   pnpm -C mcp/design-mcp i && pnpm -C mcp/design-mcp start

2) LangGraph:
   cp .env.example .env && export $(cat .env | xargs)
   pip install -r agents/langgraph/requirements.txt
   python agents/langgraph/main.py

3) n8n: importa los JSON y configura endpoints.

4) Define el stack de forma implícita o explícita:
   - Implícito: añade manifests (package.json, go.mod, pyproject.toml, etc.) y deja Discovery inferir.
   - Explícito: provee state.stack en el payload.

5) Seguridad: limita rutas en repo-mcp/policy.ts, ejecuta MCP en workspace aislado, usa tokens efímeros.
