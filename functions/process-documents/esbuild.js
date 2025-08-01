import esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["source/app.ts"],
    outdir: "dist",
    outExtension: {
      ".js": ".mjs",
    },
    outbase: "source",
    bundle: true,
    minify: true,
    treeShaking: true,
    sourcemap: true,
    splitting: true,
    platform: "node",
    format: "esm",
    target: "node22",
    plugins: [],
    mainFields: ["module", "main"],
    banner: {
      js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    },
  })
  .catch(() => process.exit(1));
