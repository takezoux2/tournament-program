import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionFirstRoundLimitError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const addFirstRoundMatchInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (...args: unknown[]) =>
    revalidateDivisionSetup(...args),
}));
vi.mock("./repository", () => ({
  addFirstRoundMatchInDb: (ids: unknown) => addFirstRoundMatchInDb(ids),
}));

const { addFirstRoundMatchAction } = await import("./handler");

const formData = () => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  addFirstRoundMatchInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  addFirstRoundMatchInDb.mockReturnValue(
    Effect.succeed({ found: true, value: null }),
  );
});

describe("addFirstRoundMatchAction", () => {
  it("組織の id でポートを呼び、再検証する", async () => {
    const state = await addFirstRoundMatchAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(),
    );
    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(addFirstRoundMatchInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d1",
    });
    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state).toEqual({ error: null });
  });

  it("ドメインエラーは文言にする", async () => {
    addFirstRoundMatchInDb.mockReturnValue(
      Effect.fail(
        new DivisionFirstRoundLimitError({ divisionId: "d1", limit: 64 }),
      ),
    );
    const state = await addFirstRoundMatchAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(),
    );
    expect(state).toEqual({ error: "1回戦は64試合までです" });
  });

  it("見つからなければ 404", async () => {
    addFirstRoundMatchInDb.mockReturnValue(Effect.succeed({ found: false }));
    await expect(
      addFirstRoundMatchAction(INITIAL_DIVISION_FORM_STATE, formData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
