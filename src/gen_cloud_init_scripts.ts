import { dirname, extname, fromFileUrl, inheritExec, joinPath } from "./deps.ts";

const currentScriptDir = dirname(fromFileUrl(import.meta.url));

const scripts: Record<string, string> = {};

const scriptsDir = joinPath(currentScriptDir, "../cloud_init_scripts");
for await (const file of Deno.readDir(scriptsDir)) {
  if (file.isFile && extname(file.name) === ".sh") {
    scripts[file.name] = await Deno.readTextFile(joinPath(scriptsDir, file.name));
  }
}

const outFile = joinPath(currentScriptDir, "./cloud_init_scripts.json");
await Deno.writeTextFile(outFile, JSON.stringify(scripts, null, 2));
await inheritExec({
  cmd: ["deno", "fmt", outFile],
});
