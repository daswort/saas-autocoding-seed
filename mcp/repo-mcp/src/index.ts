import { Server } from "modelcontextprotocol/server";
import { z } from "zod";
import { $ } from "zx";
import { isAllowed } from "./policy.js";

const s = new Server({ name: "repo-mcp", version: "0.1.0" });

s.tool("repo.scan", {
  input: z.object({ path: z.string().default(".") }),
  description: "List project tree and common manifests",
  handler: async ({ path }) => {
    const tree = await $`bash -lc 'ls -la ${path} | sed -n "1,200p"'`;
    const manifests = await $`bash -lc 'ls -1 **/{package.json,pubspec.yaml,go.mod,pyproject.toml,pom.xml,Cargo.toml,requirements.txt} 2>/dev/null | sed -n "1,200p"'`.nothrow();
    return { tree: tree.stdout, manifests: manifests.stdout };
  },
});

s.tool("repo.write", {
  input: z.object({ path: z.string(), content: z.string() }),
  description: "Write file within policy allowlist",
  handler: async ({ path, content }) => {
    if (!isAllowed(path)) throw new Error("path not allowed");
    await $`mkdir -p ${path.split('/').slice(0,-1).join('/')}`;
    await $`bash -lc ${`cat > ${path} <<'EOF'\n${content}\nEOF`}`;
    return { ok: true };
  },
});

s.tool("repo.pr", {
  input: z.object({ title: z.string(), body: z.string().optional(), branch: z.string().default("auto/feature") }),
  description: "Create PR via gh",
  handler: async ({ title, body, branch }) => {
    await $`git checkout -B ${branch}`;
    await $`git add -A`;
    await $`git commit -m ${title}`.nothrow();
    await $`git push -u origin ${branch}`;
    const out = await $`gh pr create --title ${title} --body ${body||title}`.nothrow();
    return { pr: out.stdout.trim() };
  },
});

s.tool("ci.run", { input: z.object({ ref: z.string().default("HEAD") }), description: "Trigger GitHub workflow", handler: async ({ ref }) => {
  const out = await $`gh workflow run ci.yml --ref ${ref}`.nothrow();
  return { run: out.stdout.trim() };
}});

await s.start();