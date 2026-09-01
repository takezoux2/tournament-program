import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { deleteDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
} as const;

beforeEach(() => {
  deleteMany.mockReset();
});

describe("deleteDivisionInDb", () => {
  it("組織・大会・部門の 3 つを where に残したまま削除する", async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(deleteDivisionInDb({ ...input }));

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 1 });
    }
  });

  it("0 件削除もエラーにせず件数として返す", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(deleteDivisionInDb({ ...input }));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 0 });
    }
  });

  it("例外は握り潰さず UnexpectedDivisionError に写像する", async () => {
    deleteMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(deleteDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });
});
