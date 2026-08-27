import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";
import { isPasswordLengthValid } from "./domain";

describe("isPasswordLengthValid", () => {
  it("下限ちょうどは通る", () => {
    expect(isPasswordLengthValid("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it("下限より 1 文字短いと弾く", () => {
    expect(isPasswordLengthValid("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      false,
    );
  });

  it("上限ちょうどは通る", () => {
    expect(isPasswordLengthValid("a".repeat(MAX_PASSWORD_LENGTH))).toBe(true);
  });

  it("上限より 1 文字長いと弾く", () => {
    expect(isPasswordLengthValid("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(
      false,
    );
  });

  it("空文字は弾く", () => {
    expect(isPasswordLengthValid("")).toBe(false);
  });
});
