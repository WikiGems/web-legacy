import { defineConfig } from "vite";
import stylex from "@stylexjs/unplugin";
import solid from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    stylex.vite({
      unstable_moduleResolution: { type: "commonJS", rootDir: process.cwd() },
    }),
    solid(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "script-defer",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "WikiGems",
        short_name: "WikiGems",
        description: "Collect unique cards from Wikipedia articles.",
        lang: "en",
        start_url: "/play",
        scope: "/",
        display: "standalone",
        theme_color: "#117b4e",
        background_color: "#f4f7f5",
        categories: ["games", "education"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/solana-rpc(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /^\/(?:api|solana-rpc)(?:\/|$)/.test(url.pathname),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
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
