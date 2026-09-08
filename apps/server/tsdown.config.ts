import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "./src/main.ts" },
  format: "esm",
  outDir: "./dist",
  clean: true,
  dts: false,
  deps: {
    neverBundle: true,
    alwaysBundle: [
      /^@orpc\//,
      /^(?:json-schema-typed|radash|rou3)(?:\/|$)/,
      /@zarbit\/.*/,
    ],
  },
});
