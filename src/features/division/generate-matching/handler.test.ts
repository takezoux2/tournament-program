import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionNotEnoughEntriesError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const generateMatchingInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("../revalidate", () => ({
  revalidateDivisionSetup: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionSetup(slug, tournamentId, divisionId),
}));
vi.mock("./repository", () => ({
  generateMatchingInDb: (ids: unknown) => generateMatchingInDb(ids),
}));

const { generateMatchingAction } = await import("./handler");

const formData = () => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  generateMatchingInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
});

describe("generateMatchingAction", () => {
  it("Server Action の冒頭で認可を独立に確かめる", async () => {
    generateMatchingInDb.mockReturnValue(
      Effect.succeed({ found: true, value: null }),
    );

    await generateMatchingAction(INITIAL_DIVISION_FORM_STATE, formData());

    expect(requireOrganization).toHaveBeenCalledWith("acme");
  });

  it("成功したら再検証して通知を返す", async () => {
    generateMatchingInDb.mockReturnValue(
      Effect.succeed({ found: true, value: null }),
    );

    const state = await generateMatchingAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
    expect(state.notice).toBe("組み合わせを作成しました");
  });

  it("部門が無ければ 404 にする", async () => {
    generateMatchingInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      generateMatchingAction(INITIAL_DIVISION_FORM_STATE, formData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("エントリー不足は文言にして返す", async () => {
    generateMatchingInDb.mockReturnValue(
      Effect.fail(new DivisionNotEnoughEntriesError({ divisionId: "d1" })),
    );

    const state = await generateMatchingAction(
      INITIAL_DIVISION_FORM_STATE,
      formData(),
    );

    expect(state.error).toBe("組み合わせを作るにはエントリーが2人以上必要です");
  });
});
