/**
 * Builds a single executable for one platform:
 *
 *   bun run build:linux          (x64)
 *   bun run build:windows        (x64)
 *   bun run build:darwin         (arm64, Apple Silicon)
 *   bun run build:darwin x64     (another architecture)
 *
 * Output goes to dist/. Cross-compiling works from any platform.
 */
import { mudui } from "mudui/plugin";
import pkg from "./package.json" with { type: "json" };

const defaults = { windows: "x64", linux: "x64", darwin: "arm64" } as const;
type Platform = keyof typeof defaults;

const [platform, arch] = process.argv.slice(2) as [
  Platform,
  string | undefined,
];
if (!(platform in defaults)) {
  console.error(
    `usage: bun build.ts <${Object.keys(defaults).join("|")}> [x64|arm64]`,
  );
  process.exit(1);
}

const cpu = arch ?? defaults[platform];
const outfile = `dist/${pkg.name}-${platform}-${cpu}${platform === "windows" ? ".exe" : ""}`;

const result = await Bun.build({
  entrypoints: ["./src/main.ts"],
  // compile .svelte files for the terminal, with Svelte's client runtime
  plugins: [mudui()],
  conditions: ["svelte-custom-renderer"],
  minify: true,
  compile: {
    target: `bun-${platform}-${cpu}` as Bun.Build.CompileTarget,
    outfile,
    // the binary runs on its own: don't pick up config files from wherever it's run
    autoloadBunfig: false,
    autoloadPackageJson: false,
    autoloadTsconfig: false,
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${outfile}`);
