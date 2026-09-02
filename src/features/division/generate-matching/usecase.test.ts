import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { DivisionIds } from "../setup-store";
import { generateMatching } from "./usecase";

const ids: DivisionIds = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
};

describe("generateMatching", () => {
  it("受け取った id をそのままポートへ渡す", async () => {
    const port = vi.fn(() => Effect.succeed({ found: true, value: null }));

    const result = await Effect.runPromise(generateMatching(port, ids));

    expect(port).toHaveBeenCalledWith(ids);
    expect(result).toEqual({ found: true, value: null });
  });
});
