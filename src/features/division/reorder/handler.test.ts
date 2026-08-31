import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const reorderDivisionInDb = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("./repository", () => ({
  reorderDivisionInDb: (input: unknown) => reorderDivisionInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const { reorderDivisionAction } = await import("./handler");

const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (direction: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", "t1");
  data.set("divisionId", "d2");
  data.set("direction", direction);
  return data;
};

beforeEach(() => {
  requireOrganization.mockReset();
  reorderDivisionInDb.mockReset();
  revalidatePath.mockReset();
  requireOrganization.mockResolvedValue({ organization, role: "OWNER" });
});

describe("reorderDivisionAction", () => {
  it("Server Action の冒頭でも認可境界を独立に呼ぶ", async () => {
    reorderDivisionInDb.mockReturnValue(Effect.succeed({ swapped: true }));

    await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("up"),
    );

    expect(requireOrganization).toHaveBeenCalledWith("tennis-club");
  });

  it("入れ替えたら大会詳細を再検証し、エラー無しで返す", async () => {
    reorderDivisionInDb.mockReturnValue(Effect.succeed({ swapped: true }));

    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("up"),
    );

    expect(reorderDivisionInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
      divisionId: "d2",
      direction: "up",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(state.error).toBeNull();
  });

  // 端のボタンは disabled にしてあるが、それは体感のためで境界ではない。
  // 動かせない要求はエラーにせず、ただ何も起きなかったことにする。
  it("端で動かせなくてもエラーにはしない", async () => {
    reorderDivisionInDb.mockReturnValue(Effect.succeed({ swapped: false }));

    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("up"),
    );

    expect(state.error).toBeNull();
  });

  it("向きが不正なら DB を触らない", async () => {
    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("sideways"),
    );

    expect(reorderDivisionInDb).not.toHaveBeenCalled();
    expect(state.error).toBe("並べ替えの向きが不正です");
  });

  it("退避値が競合したら文言を返す", async () => {
    const { DivisionOrderConflictError } = await import("../errors");
    reorderDivisionInDb.mockReturnValue(
      Effect.fail(new DivisionOrderConflictError({ tournamentId: "t1" })),
    );

    const state = await reorderDivisionAction(
      INITIAL_DIVISION_FORM_STATE,
      buildFormData("down"),
    );

    expect(state.error).toBe("並び順が競合しました。もう一度お試しください");
  });
});
