import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { DivisionJsonError } from "@/lib/division/parse";
import { DivisionResultsRecordedError, toDivisionError } from "./errors";

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。organization/errors.test.ts と同じ組み立て方。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

describe("toDivisionError", () => {
  it("P2002 は DivisionOrderConflictError に写像し、大会 id を保持する", () => {
    const error = toDivisionError(uniqueViolation(), "t1");

    expect(error._tag).toBe("DivisionOrderConflictError");
    expect(error).toMatchObject({ tournamentId: "t1" });
  });

  it("P2002 以外の Prisma エラーは UnexpectedDivisionError に落とす", () => {
    const reason = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "7.10.0",
    });

    const error = toDivisionError(reason, "t1");

    expect(error._tag).toBe("UnexpectedDivisionError");
    expect(error).toMatchObject({ reason });
  });

  it("Prisma 由来でない例外も握り潰さず reason に残す", () => {
    const reason = new Error("network");

    const error = toDivisionError(reason, "t1");

    expect(error._tag).toBe("UnexpectedDivisionError");
    expect(error).toMatchObject({ reason });
  });
});

describe("toDivisionError（追加分）", () => {
  it("Json のパース失敗を DivisionDataError に写す", () => {
    const error = toDivisionError(
      new DivisionJsonError("entries.version: version 1 を期待しました"),
      "t1",
    );
    expect(error._tag).toBe("DivisionDataError");
  });

  it("すでにドメインエラーならそのまま通す", () => {
    // トランザクションの中から投げたドメインエラーが
    // UnexpectedDivisionError に潰されないことを確かめる。
    const original = new DivisionResultsRecordedError({ divisionId: "d1" });
    expect(toDivisionError(original, "t1")).toBe(original);
  });
});
