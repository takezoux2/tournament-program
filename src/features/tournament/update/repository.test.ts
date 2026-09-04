import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { updateTournamentInDb } = await import("./repository");

describe("updateTournamentInDb", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("where に id と organizationId の両方を残したまま更新する", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const startsAt = new Date(2026, 7, 29, 10, 5);

    const exit = await Effect.runPromiseExit(
      updateTournamentInDb({
        organizationId: "o1",
        tournamentId: "t1",
        name: "春季大会",
        startsAt,
        description: "# 概要",
      }),
    );

    // organizationId が where から落ちると、他組織の大会 id を渡されただけで
    // 書き換えられてしまう。id 単独の where は許容できない。
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1" },
      data: { name: "春季大会", startsAt, description: "# 概要" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("該当が無ければ count 0 をそのまま返す", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      updateTournamentInDb({
        organizationId: "o1",
        tournamentId: "t-other-org",
        name: "春季大会",
        startsAt: null,
        description: "",
      }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 0 });
    }
  });

  it("失敗は握り潰さず UnexpectedTournamentError の reason に残す", async () => {
    const cause = new Error("network");
    updateMany.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      updateTournamentInDb({
        organizationId: "o1",
        tournamentId: "t1",
        name: "春季大会",
        startsAt: null,
        description: "",
      }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
