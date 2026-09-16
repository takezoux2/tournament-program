import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedDivisionError } from "../errors";
import type { UpdateDivisionPort } from "./repository";
import { updateDivision } from "./usecase";

const resultConfig = {
  version: 1 as const,
  winReason: { enabled: false, options: [] as string[] },
  score: { enabled: false, count: 3, aggregation: "sum" as const },
  note: { enabled: false },
};

const input = {
  name: "男子シングルス",
  format: "ROUND_ROBIN" as const,
  resultConfig,
};

describe("updateDivision", () => {
  it("組織 id・大会 id・部門 id をすべて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as UpdateDivisionPort;

    const exit = await Effect.runPromiseExit(
      updateDivision(port, input, "o1", "t1", "d1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    // organizationId / tournamentId が落ちると他組織・他大会の部門を
    // 書き換えられてしまうため、この 3 つが揃って渡ることが要点。
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d1",
      name: "男子シングルス",
      format: "ROUND_ROBIN",
      resultConfig,
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: UpdateDivisionPort = () =>
      Effect.fail(new UnexpectedDivisionError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      updateDivision(port, input, "o1", "t1", "d1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });

  it("resultConfig を port へそのまま渡す", async () => {
    const resultConfig = {
      version: 1 as const,
      winReason: { enabled: false, options: [] as string[] },
      score: { enabled: true, count: 5, aggregation: "average" as const },
      note: { enabled: false },
    };
    const port = vi.fn(() => Effect.succeed({ updated: 1 }));

    await Effect.runPromise(
      updateDivision(
        port,
        { name: "男子", format: "SINGLE_ELIMINATION", resultConfig },
        "o1",
        "t1",
        "d1",
      ),
    );

    expect(port).toHaveBeenCalledWith(
      expect.objectContaining({ resultConfig }),
    );
  });
});
