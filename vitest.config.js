import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

// Tests always run against .env.test (the throwaway pgtest instance), never
// .env — which may point at a real deployment. Values already present in the
// environment (e.g. from --env-file in the npm script) take precedence.
loadEnvFile(new URL("./.env.test", import.meta.url));

export default defineConfig({
  test: {},
});
