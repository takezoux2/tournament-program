import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toMemberError } from "./errors";

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "test",
  });

describe("toMemberError", () => {
  it("P2003（外部キー違反）は参加記録ありに写す", () => {
    // Member を参照するのは Participant だけなので、削除時の FK 違反は
    // 「大会に参加記録がある」ことを意味する。
    const error = toMemberError(knownError("P2003"), "m1");

    expect(error._tag).toBe("MemberHasParticipants");
  });

  it("その他の Prisma エラーは想定外に写す", () => {
    const error = toMemberError(knownError("P2002"), "m1");

    expect(error._tag).toBe("UnexpectedMemberError");
  });

  it("Prisma 以外の例外も想定外に写す", () => {
    const error = toMemberError(new Error("network"), "m1");

    expect(error._tag).toBe("UnexpectedMemberError");
  });
});
