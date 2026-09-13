import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const configuredEnv = loadEnv(mode, process.cwd(), "VITE_");
    const configured =
      process.env.VITE_SERVER_URL ?? configuredEnv.VITE_SERVER_URL;
    const url = configured ? new URL(configured) : null;
    if (
      !url ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    ) {
      throw new Error(
        "Set VITE_SERVER_URL to the public HTTPS API URL before building.",
      );
    }
  }
  return {
    server: {
      port: 3001,
      host: "0.0.0.0",
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      VitePWA({
        registerType: "prompt",
        workbox: { navigateFallbackDenylist: [/^\/api\//], runtimeCaching: [] },
        manifest: {
          name: "zarbit",
          short_name: "zarbit",
          description: "zarbit - PWA Application",
          theme_color: "#0c0c0c",
        },
        pwaAssets: { disabled: false, config: true },
        devOptions: { enabled: false },
      }),
    ],
  };
});
