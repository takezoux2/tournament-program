import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedDivisionError } from "../errors";
import type { DeleteDivisionPort } from "./repository";
import { deleteDivision } from "./usecase";

describe("deleteDivision", () => {
  it("組織 id・大会 id・部門 id をすべて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ deleted: 1 }),
    ) as unknown as DeleteDivisionPort;

    const exit = await Effect.runPromiseExit(
      deleteDivision(port, "o1", "t1", "d1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d1",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: DeleteDivisionPort = () =>
      Effect.fail(new UnexpectedDivisionError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      deleteDivision(port, "o1", "t1", "d1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedDivisionError");
  });
});
