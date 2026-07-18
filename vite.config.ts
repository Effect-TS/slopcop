import { defineConfig } from "vite-plus"

export default defineConfig({
  fmt: {
    printWidth: 80,
    semi: false,
  },
  lint: {
    plugins: ["typescript"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [".direnv", "dist"],
  },
  run: {
    cache: true,
  },
})
