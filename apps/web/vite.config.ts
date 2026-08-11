import { defineConfig } from "vite-plus"

import { foldkit } from "@foldkit/vite-plugin"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9988 })],
  optimizeDeps: {
    entries: ["src/entry.ts"],
    include: ["foldkit/brand"],
  },
})
