import { describe, expect, it } from "vitest";
import { toAuthError } from "./auth-error";

describe("toAuthError", () => {
  it("INVALID_EMAIL_OR_PASSWORD を InvalidCredentials に写像する", () => {
    expect(toAuthError("INVALID_EMAIL_OR_PASSWORD", null)._tag).toBe(
      "InvalidCredentials",
    );
  });

  it("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL を EmailAlreadyExists に写像する", () => {
    expect(
      toAuthError("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", null)._tag,
    ).toBe("EmailAlreadyExists");
  });

  it("USER_ALREADY_EXISTS を EmailAlreadyExists に写像する", () => {
    expect(toAuthError("USER_ALREADY_EXISTS", null)._tag).toBe(
      "EmailAlreadyExists",
    );
  });

  it("PASSWORD_TOO_SHORT を WeakPassword に写像する", () => {
    expect(toAuthError("PASSWORD_TOO_SHORT", null)._tag).toBe("WeakPassword");
  });

  it("PASSWORD_TOO_LONG を WeakPassword に写像する", () => {
    expect(toAuthError("PASSWORD_TOO_LONG", null)._tag).toBe("WeakPassword");
  });

  it("未知のコードは UnexpectedAuthError になる", () => {
    const error = toAuthError("SOMETHING_WE_DO_NOT_HANDLE", null);
    expect(error._tag).toBe("UnexpectedAuthError");
    expect(error.code).toBe("SOMETHING_WE_DO_NOT_HANDLE");
  });

  it("コードが undefined でも UnexpectedAuthError になり code は UNKNOWN になる", () => {
    const cause = new Error("network down");
    const error = toAuthError(undefined, cause);
    expect(error._tag).toBe("UnexpectedAuthError");
    expect(error.code).toBe("UNKNOWN");
    expect(error).toHaveProperty("reason", cause);
  });

  it("元のコードを保持する", () => {
    expect(toAuthError("PASSWORD_TOO_SHORT", null).code).toBe(
      "PASSWORD_TOO_SHORT",
    );
  });
});
