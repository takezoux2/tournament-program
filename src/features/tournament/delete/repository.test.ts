import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { deleteTournamentInDb } = await import("./repository");

describe("deleteTournamentInDb", () => {
  beforeEach(() => {
    deleteMany.mockReset();
  });

  it("where に id と organizationId の両方を残したまま削除する", async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      deleteTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    // organizationId が where から落ちると、他組織の大会 id を渡されただけで
    // 削除できてしまう。id 単独の where は許容できない。
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 1 });
    }
  });

  it("該当が無ければ count 0 をそのまま返す", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      deleteTournamentInDb({
        organizationId: "o1",
        tournamentId: "t-other-org",
      }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 0 });
    }
  });

  it("失敗は握り潰さず UnexpectedTournamentError の reason に残す", async () => {
    const cause = new Error("network");
    deleteMany.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      deleteTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
