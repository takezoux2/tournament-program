import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedTournamentError } from "../errors";
import type { DeleteTournamentPort } from "./repository";
import { deleteTournament } from "./usecase";

describe("deleteTournament", () => {
  it("組織 id と大会 id を両方 port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ deleted: 1 }),
    ) as unknown as DeleteTournamentPort;

    const exit = await Effect.runPromiseExit(
      deleteTournament(port, "o1", "t1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: DeleteTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      deleteTournament(port, "o1", "t1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
