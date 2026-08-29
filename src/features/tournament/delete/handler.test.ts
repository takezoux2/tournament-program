import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_TOURNAMENT_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const deleteTournamentInDb = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  // require-organization.test.ts と同じ形で模す。
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((_path: string) => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("../repository", () => ({
  findTournamentInOrganization: (
    organizationId: string,
    tournamentId: string,
  ) => findTournamentInOrganization(organizationId, tournamentId),
}));

vi.mock("./repository", () => ({
  deleteTournamentInDb: (input: unknown) => deleteTournamentInDb(input),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

const { deleteTournamentAction } = await import("./handler");

// name と slug をあえて別物にしておく。比較に slug を取り違えて使う実装が
// 紛れ込んでいても、このテストなら見分けられる。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis-club",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "DRAFT" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

const buildFormData = (confirmName: string): FormData => {
  const data = new FormData();
  data.set("slug", organization.slug);
  data.set("tournamentId", tournament.id);
  data.set("confirmName", confirmName);
  return data;
};

describe("deleteTournamentAction", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    findTournamentInOrganization.mockReset();
    deleteTournamentInDb.mockReset();
    revalidatePath.mockClear();
    notFound.mockClear();
    redirect.mockClear();
    requireOrganization.mockResolvedValue({
      session: { user: { id: "u1", name: "竹添" } },
      organization,
      role: "OWNER",
    });
    findTournamentInOrganization.mockResolvedValue(tournament);
  });

  it("大会名が一致しなければ削除せずエラーを返す", async () => {
    const result = await deleteTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData("違う名前"),
    );

    expect(result).toEqual({ error: "大会名が一致しません" });
    expect(deleteTournamentInDb).not.toHaveBeenCalled();
  });

  it("フォームに入力された値ではなく、DB から読んだ大会名と比較する", async () => {
    // フォームの confirmName と一致していても、DB 上の名前と違えば拒否する。
    // 「フォームの値同士を比較している」実装だと通ってしまう組み合わせ。
    const result = await deleteTournamentAction(
      INITIAL_TOURNAMENT_FORM_STATE,
      buildFormData("tennis-club"),
    );

    expect(result).toEqual({ error: "大会名が一致しません" });
    expect(deleteTournamentInDb).not.toHaveBeenCalled();
  });

  it("大会名が一致すれば削除処理へ進む", async () => {
    deleteTournamentInDb.mockReturnValue(Effect.succeed({ deleted: 1 }));

    // 成功時は redirect が例外として制御を奪うので、通常の return ではなく
    // 例外側で成功を確認する。
    await expect(
      deleteTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteTournamentInDb).toHaveBeenCalledWith({
      organizationId: "o1",
      tournamentId: "t1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/orgs/tennis-club");
  });

  it("所属していなければ requireOrganization の時点で打ち切られ、大会取得にも削除にも進まない", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      deleteTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(findTournamentInOrganization).not.toHaveBeenCalled();
    expect(deleteTournamentInDb).not.toHaveBeenCalled();
  });

  it("この組織に大会が無ければ notFound で打ち切り、比較にも削除にも進まない", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(
      deleteTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(deleteTournamentInDb).not.toHaveBeenCalled();
  });

  it("削除件数が 0 件なら、事前チェックをすり抜けた競合でも成功扱いにせず notFound で打ち切る", async () => {
    // 事前の findTournamentInOrganization チェックと deleteMany の間で
    // 大会が消えるレースを模す。deleteMany 自体は成功として返るが件数は 0。
    deleteTournamentInDb.mockReturnValue(Effect.succeed({ deleted: 0 }));

    await expect(
      deleteTournamentAction(
        INITIAL_TOURNAMENT_FORM_STATE,
        buildFormData("春季大会"),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
