import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: { create: (args: unknown) => create(args) },
  },
}));

const { createTournamentInDb } = await import("./repository");

describe("createTournamentInDb", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("organizationId・name・startsAt を渡して大会を作る", async () => {
    create.mockResolvedValue({ id: "t1" });
    const startsAt = new Date(2026, 7, 29, 10, 5);

    const exit = await Effect.runPromiseExit(
      createTournamentInDb({
        organizationId: "o1",
        name: "春季大会",
        startsAt,
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: "o1",
        name: "春季大会",
        startsAt,
      },
      select: { id: true },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ id: "t1" });
    }
  });

  it("startsAt が null のときも null のまま渡す", async () => {
    create.mockResolvedValue({ id: "t2" });

    await Effect.runPromiseExit(
      createTournamentInDb({
        organizationId: "o1",
        name: "秋季大会",
        startsAt: null,
      }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startsAt: null }),
      }),
    );
  });

  it("失敗は握り潰さず UnexpectedTournamentError の reason に残す", async () => {
    const cause = new Error("network");
    create.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      createTournamentInDb({
        organizationId: "o1",
        name: "春季大会",
        startsAt: null,
      }),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
