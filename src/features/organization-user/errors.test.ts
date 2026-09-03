import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toOrganizationUserError } from "./errors";

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("failed", {
    code,
    clientVersion: "7.10.0",
  });

describe("toOrganizationUserError", () => {
  it("P2002（unique 制約違反）は AlreadyMember に写す", () => {
    const error = toOrganizationUserError(knownError("P2002"), "u1");

    expect(error._tag).toBe("AlreadyMember");
    expect(error).toMatchObject({ userId: "u1" });
  });

  it("P2003（外部キー違反）は UserNotFound に写す", () => {
    // 追加時に対象ユーザーが消えていた場合にこれが飛ぶ。
    const error = toOrganizationUserError(knownError("P2003"), "u1");

    expect(error._tag).toBe("UserNotFound");
  });

  it("それ以外は握り潰さず reason に残す", () => {
    const cause = new Error("network");

    const error = toOrganizationUserError(cause, "u1");

    expect(error._tag).toBe("UnexpectedOrganizationUserError");
    expect(error).toMatchObject({ reason: cause });
  });
});
