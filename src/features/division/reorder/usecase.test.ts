import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedDivisionError } from "../errors";
import type { ReorderDivisionPort } from "./repository";
import { reorderDivision } from "./usecase";

describe("reorderDivision", () => {
  it("組織 id・大会 id・部門 id・向きをすべて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ swapped: true }),
    ) as unknown as ReorderDivisionPort;

    const exit = await Effect.runPromiseExit(
      reorderDivision(port, "o1", "t1", "d1", "up"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d1",
      direction: "up",
    });
  });

  it("direction は受け取った値をそのまま渡す(down)", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ swapped: true }),
    ) as unknown as ReorderDivisionPort;

    await Effect.runPromiseExit(
      reorderDivision(port, "o1", "t1", "d1", "down"),
    );

    expect(port).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "down" }),
    );
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: ReorderDivisionPort = () =>
      Effect.fail(new UnexpectedDivisionError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      reorderDivision(port, "o1", "t1", "d1", "up"),
    );

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });
});
