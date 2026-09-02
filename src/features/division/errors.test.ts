import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { DivisionJsonError } from "@/lib/division/parse";
import {
  DivisionDataError,
  DivisionDuplicateEntryError,
  DivisionEntryLimitError,
  DivisionMemberNotFoundError,
  DivisionNotEnoughEntriesError,
  DivisionOrderConflictError,
  DivisionResultsRecordedError,
  toDivisionError,
  UnexpectedDivisionError,
} from "./errors";

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

describe("toDivisionError（タグ判定の網羅性）", () => {
  // instanceof の書き並べをタグ駆動の判定に置き換えたため、コンパイル時の
  // 網羅性チェックは「型」で保証されていても、実際に判定が効いているかは
  // 実行時に確かめるしかない。DivisionError の8タグすべてで
  // identity pass-through（そのまま返る）ことを1件ずつ検証する。
  it.each([
    ["DivisionOrderConflictError", new DivisionOrderConflictError({ tournamentId: "t1" })],
    [
      "UnexpectedDivisionError",
      new UnexpectedDivisionError({ reason: new Error("boom") }),
    ],
    [
      "DivisionResultsRecordedError",
      new DivisionResultsRecordedError({ divisionId: "d1" }),
    ],
    [
      "DivisionNotEnoughEntriesError",
      new DivisionNotEnoughEntriesError({ divisionId: "d1" }),
    ],
    ["DivisionDataError", new DivisionDataError({ reason: "broken" })],
    ["DivisionEntryLimitError", new DivisionEntryLimitError({ divisionId: "d1" })],
    [
      "DivisionDuplicateEntryError",
      new DivisionDuplicateEntryError({ divisionId: "d1" }),
    ],
    [
      "DivisionMemberNotFoundError",
      new DivisionMemberNotFoundError({ memberId: "m1" }),
    ],
  ])("%s はそのまま通す", (_tag, original) => {
    expect(toDivisionError(original, "t1")).toBe(original);
  });
});
