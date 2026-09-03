import { describe, expect, it } from "vitest";
import { usernameAdditionalField } from "@/shared/lib/auth-user-fields";
import { authUserConfig } from "./auth-user-config";

describe("authUserConfig", () => {
  it("username の宣言は auth-user-fields.ts の usernameAdditionalField そのもの", () => {
    // ここがコピーや別オブジェクトにすり替わると、validator.input /
    // transform.input によるサーバー側検証が静かに外れる（tsc も
    // lint もそれだけでは気付かない）。同一性を直接見る。
    expect(authUserConfig.additionalFields?.username).toBe(
      usernameAdditionalField,
    );
  });
});
