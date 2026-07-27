import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    include: ["test/**/*.{test,spec}.ts"],
    environment: "happy-dom",
    setupFiles: ["./test/vitest-setup.ts"],
    server: {
      deps: {
        inline: ["foldkit", "@foldkit/ui", "@foldkit/devtools"],
      },
    },
  },
})
