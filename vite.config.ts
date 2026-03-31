import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type PluginOption } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const plugins: PluginOption[] = [
  dts({
    insertTypesEntry: true,
  }) as unknown as PluginOption,
];

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ThreeMotion",
      formats: ["es", "umd"],
      fileName: (format) => (format === "es" ? "index.js" : "index.umd.cjs"),
    },
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      external: ["three", "gsap"],
      output: {
        globals: {
          three: "THREE",
          gsap: "gsap",
        },
      },
    },
  },
  plugins,
});
