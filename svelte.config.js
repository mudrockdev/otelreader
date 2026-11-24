// For editors and svelte-check: these components render to the terminal.
export default {
  compilerOptions: {
    runes: true,
    experimental: { customRenderer: "mudui/renderer" },
  },
};
