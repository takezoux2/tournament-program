import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedTournamentError } from "../errors";
import type { CreateTournamentPort } from "./repository";
import { createTournament } from "./usecase";

const input = { name: "春季大会", startsAt: null, description: "" };

describe("createTournament", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ id: "t1" }),
    ) as unknown as CreateTournamentPort;

    const exit = await Effect.runPromiseExit(
      createTournament(port, input, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      name: "春季大会",
      startsAt: null,
      description: "",
      organizationId: "o1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: CreateTournamentPort = () =>
      Effect.fail(new UnexpectedTournamentError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      createTournament(port, input, "o1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedTournamentError");
  });
});
