import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
      "/solana-rpc": {
        target: "http://127.0.0.1:8899",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/solana-rpc/, ""),
      },
    },
  },
});
