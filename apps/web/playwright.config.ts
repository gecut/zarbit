import { defineConfig } from "@playwright/test";

const modes = ["rpc"] as const;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    ...modes.map((mode, i) => ({
      name: mode,
      testMatch: "auth.spec.ts",
      use: { baseURL: `http://127.0.0.1:${4171 + i}` },
    })),
    {
      name: "production",
      testMatch: ["production.spec.ts", "home-terminal.spec.ts"],
      use: { baseURL: "http://127.0.0.1:4174" },
    },
  ],
  webServer: [
    ...modes.map((_mode, i) => ({
      command: `pnpm exec vite --host 127.0.0.1 --port ${4171 + i} --strictPort`,
      url: `http://127.0.0.1:${4171 + i}`,
      env: {
        VITE_SERVER_URL: "https://api.example.test",
      },
      reuseExistingServer: false,
    })),
    {
      command:
        "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      env: {
        VITE_SERVER_URL: "https://api.example.test",
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
