import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { unpublishTournamentInDb } = await import("./repository");

describe("unpublishTournamentInDb", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("組織内の DRAFT 以外の大会だけを DRAFT に戻す", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      unpublishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1", status: { not: "DRAFT" } },
      data: { status: "DRAFT" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("失敗は UnexpectedTournamentError として伝える", async () => {
    updateMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      unpublishTournamentInDb({ organizationId: "o1", tournamentId: "t1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
