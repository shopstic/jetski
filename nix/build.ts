import { type ImportMap, transpile } from "https://deno.land/x/emit@0.38.3/mod.ts";
import { dirname, fromFileUrl, join, relative } from "@std/path";
import { inheritExec } from "@wok/utils/exec";

const outPath = Deno.args[0];

if (!outPath) {
  throw new Error("Output path is required");
}

const rootPath = Deno.cwd();
const appPath = join(rootPath, "src/app.ts");

function rewriteImports(content: string) {
  return content.replace(/(import|export)([\s\S]+?)from([\s\S]+?)['|"]([^'"]+)\.ts['|"]/g, `$1$2from$3"$4.js"`);
}

await inheritExec({
  cmd: ["deno", "vendor", appPath],
});

const importMapPath = "./vendor/import_map.json";
const importMap: ImportMap = JSON.parse(await Deno.readTextFile(importMapPath));
const result = await transpile(appPath, {
  importMap: importMapPath,
  allowRemote: false,
});

const promises = Array.from(result).map(async ([key, content]) => {
  const path = fromFileUrl(key);
  const newPath = join(outPath, relative(rootPath, path).replace(/\.ts$/, ".js"));
  const newParentDir = dirname(newPath);
  await Deno.mkdir(newParentDir, { recursive: true });
  await Deno.writeTextFile(newPath, rewriteImports(content));
  console.log(`Wrote ${newPath}`);
});
await Promise.all(promises);

const updatedImportMap = {
  imports: Object.fromEntries(
    Object.entries(importMap.imports ?? {}).map(([key, value]) => {
      return [key, value.replace(/\.ts$/, ".js")];
    }),
  ),
  scopes: Object.fromEntries(
    Object.entries(importMap.scopes ?? {}).map(([scopeKey, scope]) => {
      return [
        scopeKey,
        Object.fromEntries(
          Object.entries(scope).map(([key, value]) => {
            return [key, value.replace(/\.ts$/, ".js")];
          }),
        ),
      ];
    }),
  ),
} satisfies ImportMap;

await Promise.all([
  Deno.writeTextFile(join(outPath, "vendor", "import_map.json"), JSON.stringify(updatedImportMap, null, 2)),
  Deno.copyFile("./src/cloud_init_scripts.json", join(outPath, "src", "cloud_init_scripts.json"))
])
