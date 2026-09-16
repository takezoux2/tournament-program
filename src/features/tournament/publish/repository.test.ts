import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { publishTournamentInDb } = await import("./repository");

describe("publishTournamentInDb", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("組織内の DRAFT の大会だけを IN_PROGRESS にする", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      publishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    // status 条件が where から落ちると、完了済みの大会を進行中に戻してしまう。
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1", status: "DRAFT" },
      data: { status: "IN_PROGRESS" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("失敗は UnexpectedTournamentError として伝える", async () => {
    updateMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      publishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
