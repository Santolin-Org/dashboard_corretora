import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/parity",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: { timezoneId: "America/Sao_Paulo", locale: "pt-BR", browserName: "chromium" },
});
