# Auto‑Coding Seed (agnóstico)

Requisitos: Node 20+, pnpm, Python 3.11+, n8n, gh CLI. Para stacks específicos instala toolchains locales (Go/Java/Python/Flutter/etc.).

1) MCP servers:
   export MCP_TOOL_API_KEYS="local-dev-key"
   # opcional: reemplaza REPO_MCP_TOOL_API_KEYS para claves por servicio
   pnpm -C mcp/repo-mcp i && pnpm -C mcp/repo-mcp start
   pnpm -C mcp/build-mcp i && pnpm -C mcp/build-mcp start
   pnpm -C mcp/test-mcp  i && pnpm -C mcp/test-mcp start
   pnpm -C mcp/lint-mcp  i && pnpm -C mcp/lint-mcp start
   pnpm -C mcp/pkg-mcp   i && pnpm -C mcp/pkg-mcp start
   pnpm -C mcp/design-mcp i && pnpm -C mcp/design-mcp start

2) LangGraph:
   cp .env.example .env && export $(cat .env | xargs)
   # Opcional: ajusta MCP_BASE_URL o REPO_MCP_URL para apuntar al dominio interno seguro
   pip install -r agents/langgraph/requirements.txt
   python agents/langgraph/main.py

3) n8n: importa los JSON y configura endpoints.
   - Define variables de entorno seguras (por ejemplo `REPO_MCP_URL=https://mcp-internal.local/repo-mcp`).
   - Añade la cabecera `x-api-key` (o la definida en `MCP_TOOL_API_KEY_HEADER`) con el mismo secreto usado en los MCP.

4) Define el stack de forma implícita o explícita:
   - Implícito: añade manifests (package.json, go.mod, pyproject.toml, etc.) y deja Discovery inferir.
   - Explícito: provee state.stack en el payload.

5) Seguridad: limita rutas en repo-mcp/policy.ts, ejecuta MCP en workspace aislado, usa tokens efímeros.

## Solución de problemas

### Error 424 al inicializar MCP

Si `python agents/langgraph/main.py` termina con un trace como:

```
openai.APIStatusError: Error retrieving tool list from MCP server: 'test'. Http status code: 424 (Failed Dependency)
```

significa que la API de OpenAI no pudo conectar con el servidor MCP configurado para `test`. Comprueba lo siguiente:

1. El proceso del MCP correspondiente está en ejecución (`pnpm -C mcp/test-mcp start`).
2. `TEST_MCP_URL` o `MCP_BASE_URL` apunta a un dominio accesible desde la plataforma que ejecuta el modelo (no solo desde tu máquina local).
3. Si protegiste `/tool/*` con API keys, que la cabecera definida en `MCP_TOOL_API_KEY_HEADER` se esté enviando con un valor permitido por `*_MCP_TOOL_API_KEYS`.
