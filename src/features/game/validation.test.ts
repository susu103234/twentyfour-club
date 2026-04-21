import { describe, it, expect } from "vitest";
import { validateSubmission } from "./validation";

describe("validateSubmission", () => {
  it("accepts a correct expression that uses every card exactly once", () => {
    const result = validateSubmission("6 × 4 × (3 - 2)", [2, 3, 4, 6]);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.value).toBe(24);
  });

  it("accepts both × and * / ÷ and / as multiplication and division", () => {
    expect(validateSubmission("8*3*(8/3)", [3, 3, 8, 8]).kind).toBe("not-24");
    const ok = validateSubmission("8÷(3-8÷3)", [3, 3, 8, 8]);
    expect(ok.kind).toBe("ok");
  });

  it("flags bad-numbers when the player reuses or invents a card", () => {
    const r = validateSubmission("6 * 6 - 6 - 6", [1, 2, 3, 6]);
    expect(r.kind).toBe("bad-numbers");
  });

  it("flags not-24 when the expression is legal but the wrong value", () => {
    const r = validateSubmission("1 + 2 + 3 + 4", [1, 2, 3, 4]);
    expect(r.kind).toBe("not-24");
    if (r.kind === "not-24") expect(r.value).toBe(10);
  });

  it("flags parse-error on junk input", () => {
    expect(validateSubmission("", [1, 2, 3, 4]).kind).toBe("parse-error");
    expect(validateSubmission("((1 + 2)", [1, 2, 3, 4]).kind).toBe("parse-error");
    expect(validateSubmission("1 * * 2", [1, 2, 3, 4]).kind).toBe("parse-error");
  });
});
