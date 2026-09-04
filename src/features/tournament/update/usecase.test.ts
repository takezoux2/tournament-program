import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedTournamentError } from "../errors";
import type { UpdateTournamentPort } from "./repository";
import { updateTournament } from "./usecase";

const input = { name: "春季大会", startsAt: null, description: "# 概要" };

describe("updateTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as UpdateTournamentPort;

    const exit = await Effect.runPromiseExit(
      updateTournament(port, input, "o1", "t1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    // organizationId が落ちると他組織の大会を書き換えられてしまう。
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      name: "春季大会",
      startsAt: null,
      description: "# 概要",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: UpdateTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      updateTournament(port, input, "o1", "t1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
