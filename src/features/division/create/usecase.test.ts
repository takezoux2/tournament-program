import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { CreateDivisionPort } from "./repository";
import { createDivision } from "./usecase";

describe("createDivision", () => {
  it("組織 id と大会 id をポートへ渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ id: "d1" }),
    ) as unknown as CreateDivisionPort;

    const exit = await Effect.runPromiseExit(
      createDivision(
        port,
        { name: "男子シングルス", format: "SINGLE_ELIMINATION" },
        "o1",
        "t1",
      ),
    );

    expect(port).toHaveBeenCalledWith({
      name: "男子シングルス",
      format: "SINGLE_ELIMINATION",
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});
