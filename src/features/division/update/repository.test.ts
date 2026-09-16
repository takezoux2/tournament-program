import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { updateDivisionInDb } = await import("./repository");

const resultConfig = {
  version: 1 as const,
  winReason: { enabled: false, options: [] as string[] },
  score: { enabled: false, count: 3, aggregation: "sum" as const },
  note: { enabled: false },
};

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
  name: "男子ダブルス",
  format: "ROUND_ROBIN",
  resultConfig,
} as const;

beforeEach(() => {
  updateMany.mockReset();
});

describe("updateDivisionInDb", () => {
  // update（単数形）は unique な where しか受け付けず、id 単独になってしまう。
  // updateMany なら where に所有条件を残せる。ここが越境更新を止める要。
  it("組織・大会・部門の 3 つを where に残したまま更新する", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      data: { name: "男子ダブルス", format: "ROUND_ROBIN", resultConfig },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("order には触れない", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    const args = updateMany.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).not.toHaveProperty("order");
  });

  it("0 件更新もエラーにせず件数として返す", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 0 });
    }
  });

  it("例外は握り潰さず UnexpectedDivisionError に写像する", async () => {
    updateMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(updateDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });

  it("resultConfig を書き、results には触れない", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const resultConfig = {
      version: 1 as const,
      winReason: { enabled: true, options: ["一本勝ち"] },
      score: { enabled: false, count: 3, aggregation: "sum" as const },
      note: { enabled: true },
    };

    await Effect.runPromise(
      updateDivisionInDb({
        organizationId: "o1",
        tournamentId: "t1",
        divisionId: "d1",
        name: "男子",
        format: "SINGLE_ELIMINATION",
        resultConfig,
      }),
    );

    const [call] = updateMany.mock.calls;
    expect(call[0].data).toEqual({
      name: "男子",
      format: "SINGLE_ELIMINATION",
      resultConfig,
    });
    expect(call[0].data).not.toHaveProperty("results");
  });
});
