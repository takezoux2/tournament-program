import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_TOURNAMENT_FORM_STATE } from "../state";

const requirePermission = vi.fn();
const unpublishTournamentInDb = vi.fn();
const findTournamentInOrganization = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("./repository", () => ({
  unpublishTournamentInDb: (input: unknown) => unpublishTournamentInDb(input),
}));

vi.mock("../repository", () => ({
  findTournamentInOrganization: (
    organizationId: string,
    tournamentId: string,
  ) => findTournamentInOrganization(organizationId, tournamentId),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { unpublishTournamentAction } = await import("./handler");

const buildFormData = (tournamentId = "t1"): FormData => {
  const data = new FormData();
  data.set("slug", "tennis-club");
  data.set("tournamentId", tournamentId);
  return data;
};

describe("unpublishTournamentAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    unpublishTournamentInDb.mockReset();
    findTournamentInOrganization.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    redirect.mockClear();
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis-club" },
    });
    unpublishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 1 }));
  });

  it("tournament.edit を要求する", async () => {
    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requirePermission).toHaveBeenCalledWith(
      "tennis-club",
      "tournament.edit",
    );
  });

  it("権限が無ければ打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(unpublishTournamentInDb).not.toHaveBeenCalled();
  });

  it("大会 id が空ならエラーを返し、DB を触らない", async () => {
    const state = await unpublishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(""),
    );

    expect(state).toEqual({ error: "大会が指定されていません" });
    expect(unpublishTournamentInDb).not.toHaveBeenCalled();
  });

  it("非公開にできたら再検証して詳細ページへ redirect する", async () => {
    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(unpublishTournamentInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/t/t1", "layout");
    expect(redirect).toHaveBeenCalledWith("/orgs/tennis-club/tournaments/t1");
  });

  it("0 件で大会が組織内に無ければ notFound", async () => {
    unpublishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(
      unpublishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
  });

  it("0 件で大会が存在すれば、すでに非公開のエラーを返す", async () => {
    unpublishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue({
      id: "t1",
      status: "DRAFT",
    });

    const state = await unpublishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(state).toEqual({ error: "この大会はすでに非公開です" });
    expect(redirect).not.toHaveBeenCalled();
    // 更新は 0 件でも、古い画面が非公開ボタンを出したままにならないよう再検証する。
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
  });
});
