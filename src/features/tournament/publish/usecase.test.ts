import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedTournamentError } from "../errors";
import type { PublishTournamentPort } from "./repository";
import { publishTournament } from "./usecase";

describe("publishTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as PublishTournamentPort;

    const exit = await Effect.runPromiseExit(
      publishTournament(port, "o1", "t1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: PublishTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      publishTournament(port, "o1", "t1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
