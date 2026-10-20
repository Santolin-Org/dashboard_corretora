import { describe, expect, it } from "vitest";
import * as dominio from "@/domain";

describe("esqueleto", () => {
  it("resolve o alias @/domain", () => {
    expect(dominio).toBeDefined();
  });
});
