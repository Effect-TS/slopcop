import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts", "*.{test,spec}.ts"],
    environment: "happy-dom",
    setupFiles: ["./src/vitest-setup.ts"],
    server: {
      deps: {
        inline: ["foldkit", "@foldkit/ui", "@foldkit/devtools"],
      },
    },
  },
})
