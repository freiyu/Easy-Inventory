import { describe, expect, it } from "vitest";
import { serverErrors } from "./schemas";

describe("serverErrors", () => {
  it("drops the general message when it repeats a field message", () => {
    expect(serverErrors({ code: "CONFLICT", message: "Code taken.", fields: { code: "Code taken." } })).toEqual({ code: "Code taken." });
  });
  it("keeps the general message when it adds something", () => {
    expect(serverErrors({ code: "VALIDATION_ERROR", message: "Check the fields.", fields: { name: "Required." } })).toEqual({ name: "Required.", _form: "Check the fields." });
    expect(serverErrors({ code: "FORBIDDEN", message: "No access." })).toEqual({ _form: "No access." });
  });
});
