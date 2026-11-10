import { describe, it, expect } from "vitest";
import { prefixoSnapshots } from "@/server/snapshots";

describe("prefixoSnapshots", () => {
  it("produção (e local, sem VERCEL_ENV) usa o prefixo de sempre", () => {
    expect(prefixoSnapshots({ VERCEL_ENV: "production" })).toBe("snapshots/");
    expect(prefixoSnapshots({})).toBe("snapshots/");
  });
  it("preview e dev usam prefixo próprio, para não ler nem apagar as cópias da produção", () => {
    expect(prefixoSnapshots({ VERCEL_ENV: "preview" })).toBe("snapshots-preview/");
    expect(prefixoSnapshots({ VERCEL_ENV: "development" })).toBe("snapshots-development/");
  });
});
