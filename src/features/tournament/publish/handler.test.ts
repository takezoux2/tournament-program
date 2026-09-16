import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_TOURNAMENT_FORM_STATE } from "../state";

const requirePermission = vi.fn();
const publishTournamentInDb = vi.fn();
const findTournamentInOrganization = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("./repository", () => ({
  publishTournamentInDb: (input: unknown) => publishTournamentInDb(input),
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
}));

const { publishTournamentAction } = await import("./handler");

const buildFormData = (tournamentId = "t1"): FormData => {
  const data = new FormData();
  data.set("slug", "tennis-club");
  data.set("tournamentId", tournamentId);
  return data;
};

describe("publishTournamentAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    publishTournamentInDb.mockReset();
    findTournamentInOrganization.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    // id と slug をわざと別の値にして取り違えを検出する。
    requirePermission.mockResolvedValue({
      organization: { id: "o1", slug: "tennis-club" },
    });
    publishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 1 }));
  });

  it("tournament.edit を要求する", async () => {
    await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(requirePermission).toHaveBeenCalledWith(
      "tennis-club",
      "tournament.edit",
    );
  });

  it("権限が無ければ打ち切られ、DB を触らない", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      publishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(publishTournamentInDb).not.toHaveBeenCalled();
  });

  it("大会 id が空ならエラーを返し、DB を触らない", async () => {
    const state = await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(""),
    );

    expect(state).toEqual({ error: "大会が指定されていません" });
    expect(publishTournamentInDb).not.toHaveBeenCalled();
  });

  it("公開できたら組織・詳細・公開ページを再検証してエラーなしを返す", async () => {
    const state = await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(state).toEqual({ error: null });
    expect(publishTournamentInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/t/t1", "layout");
  });

  it("0 件で大会が組織内に無ければ notFound", async () => {
    publishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(
      publishTournamentAction(INITIAL_TOURNAMENT_FORM_STATE, buildFormData()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
  });

  it("0 件で大会が存在すれば、すでに公開済みのエラーを返す", async () => {
    publishTournamentInDb.mockReturnValue(Effect.succeed({ updated: 0 }));
    findTournamentInOrganization.mockResolvedValue({
      id: "t1",
      status: "IN_PROGRESS",
    });

    const state = await publishTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData(),
    );

    expect(state).toEqual({ error: "この大会はすでに公開されています" });
    // 更新は 0 件でも、古い画面が公開ボタンを出したままにならないよう再検証する。
    expect(revalidatePath).toHaveBeenCalledWith(
      "/orgs/tennis-club/tournaments/t1",
    );
  });
});
