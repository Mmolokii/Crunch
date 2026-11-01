// Explicit Vite config (CRU-60). Replaces @lovable.dev/vite-tanstack-config,
// which wrapped these same plugins plus Lovable-editor tooling (sandbox
// bridge, asset proxy, dev error overlays) that this repo doesn't use.
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  css: { transformer: "lightningcss" },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // TanStack Start's server entry is src/server.ts (CSP nonce, security
      // headers, SSR error wrapper).
      server: { entry: "server" },
      // Server-only modules can't be imported into the client bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Deploy target is Vercel's Node runtime (ADR-0001). NITRO_PRESET=node-server
    // builds a plain Node server for the e2e smoke tests (CRU-57).
    ...(command === "build" ? [nitro({ preset: process.env["NITRO_PRESET"] ?? "vercel" })] : []),
    viteReact(),
  ],
}));
