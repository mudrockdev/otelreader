/**
 * Builds a single executable for one platform:
 *
 *   bun run build:linux          (x64)
 *   bun run build:windows        (x64)
 *   bun run build:darwin         (arm64, Apple Silicon)
 *   bun run build:darwin x64     (another architecture)
 *
 * or the npm package's CLI, a single JavaScript file that runs on Bun:
 *
 *   bun run build:npm            (dist/otelreader.js)
 *
 * Output goes to dist/. Cross-compiling works from any platform.
 */
import { mudui } from "mudui/plugin";
import pkg from "./package.json" with { type: "json" };

const defaults = { windows: "x64", linux: "x64", darwin: "arm64" } as const;
type Platform = keyof typeof defaults;

const [platform, arch] = process.argv.slice(2) as [
  Platform | "npm",
  string | undefined,
];
if (platform !== "npm" && !(platform in defaults)) {
  console.error(
    `usage: bun build.ts <${[...Object.keys(defaults), "npm"].join("|")}> [x64|arm64]`,
  );
  process.exit(1);
}

const shared = {
  entrypoints: ["./src/main.ts"],
  // compile .svelte files for the terminal, with Svelte's client runtime
  plugins: [mudui()],
  conditions: ["svelte-custom-renderer"],
  minify: true,
} satisfies Bun.BuildConfig;

let outfile: string;
let result: Bun.BuildOutput;

if (platform === "npm") {
  // everything (mudui, svelte) is bundled, so the package has no runtime dependencies
  outfile = `dist/${pkg.name}.js`;
  result = await Bun.build({
    ...shared,
    target: "bun",
    outdir: "dist",
    naming: `${pkg.name}.js`,
    banner: "#!/usr/bin/env bun",
  });
} else {
  const cpu = arch ?? defaults[platform];
  outfile = `dist/${pkg.name}-${platform}-${cpu}${platform === "windows" ? ".exe" : ""}`;
  result = await Bun.build({
    ...shared,
    compile: {
      target: `bun-${platform}-${cpu}` as Bun.Build.CompileTarget,
      outfile,
      // the binary runs on its own: don't pick up config files from wherever it's run
      autoloadBunfig: false,
      autoloadPackageJson: false,
      autoloadTsconfig: false,
    },
  });
}

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${outfile}`);
