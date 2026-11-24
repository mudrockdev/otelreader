import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },

      // adapter-node supports `instrumentation.server.ts`; its output runs on Bun (`bun start`)
      adapter: adapter(),

      // emit spans for handle hooks, load functions, form actions and remote functions
      tracing: { server: true },
    }),
  ],
});
