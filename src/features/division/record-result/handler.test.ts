import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const recordResultInDb = vi.fn();
const revalidateDivisionResults = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));
vi.mock("./repository", () => ({
  recordResultInDb: (ids: unknown, input: unknown) =>
    recordResultInDb(ids, input),
}));
vi.mock("../revalidate", () => ({
  revalidateDivisionResults: (
    slug: string,
    tournamentId: string,
    divisionId: string,
  ) => revalidateDivisionResults(slug, tournamentId, divisionId),
}));

const { recordResultAction } = await import("./handler");

const formData = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
};

const validInput = {
  slug: "tennis",
  tournamentId: "t1",
  divisionId: "d1",
  matchId: "m1-0",
  winnerEntryId: "e1",
};

beforeEach(() => {
  requireOrganization.mockReset();
  recordResultInDb.mockReset();
  revalidateDivisionResults.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  recordResultInDb.mockReturnValue(
    Effect.succeed({ found: true, value: { recorded: true } }),
  );
});

describe("recordResultAction", () => {
  it("組織の所有権を確かめてから書き込む", async () => {
    const state = await recordResultAction(
      { error: null },
      formData(validInput),
    );

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
    expect(recordResultInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { matchId: "m1-0", winnerEntryId: "e1" },
    );
    expect(state).toEqual({ error: null, succeeded: 1 });
  });

  it("成功したら 3 本のページを再検証する", async () => {
    await recordResultAction({ error: null }, formData(validInput));

    expect(revalidateDivisionResults).toHaveBeenCalledWith(
      "tennis",
      "t1",
      "d1",
    );
  });

  it("取り消し（空文字）もそのまま渡す", async () => {
    await recordResultAction(
      { error: null },
      formData({ ...validInput, winnerEntryId: "" }),
    );

    expect(recordResultInDb).toHaveBeenCalledWith(expect.anything(), {
      matchId: "m1-0",
      winnerEntryId: "",
    });
  });

  it("試合の指定が空なら書き込まずに文言を返す", async () => {
    const state = await recordResultAction(
      { error: null },
      formData({ ...validInput, matchId: "" }),
    );

    expect(state).toEqual({ error: "試合の指定が不正です" });
    expect(recordResultInDb).not.toHaveBeenCalled();
  });

  it("対象が無ければ notFound へ倒す", async () => {
    recordResultInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      recordResultAction({ error: null }, formData(validInput)),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("失敗は日本語の文言にして返す", async () => {
    const { DivisionRevisionConflictError } = await import("../errors");
    recordResultInDb.mockReturnValue(
      Effect.fail(new DivisionRevisionConflictError({ divisionId: "d1" })),
    );

    const state = await recordResultAction(
      { error: null },
      formData(validInput),
    );

    expect(state).toEqual({
      error: "他の人が更新しました。画面を再読み込みしてください",
    });
    expect(revalidateDivisionResults).not.toHaveBeenCalled();
  });

  it("成功のたびに succeeded が増える（初期状態と、連続した成功を区別するため）", async () => {
    const first = await recordResultAction({ error: null }, formData(validInput));
    const second = await recordResultAction(first, formData(validInput));

    expect(first.succeeded).toBe(1);
    expect(second.succeeded).toBe(2);
  });

  it("勝者が変わらず何も書かなかったときは succeeded を増やさない", async () => {
    // repository は「変更なし」を recorded: false で返す。増やしてしまうと
    // 同じ勝者の再タップだけで record_result が飛び、記録していない操作が
    // 記録として計上される。
    recordResultInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { recorded: false } }),
    );

    const state = await recordResultAction(
      { error: null, succeeded: 3 },
      formData(validInput),
    );

    expect(state).toEqual({ error: null, succeeded: 3 });
  });

  it("何も書かなかった後でも、次に記録したら succeeded が 1 だけ進む", async () => {
    // 書かなかったときに succeeded を落として undefined にすると、
    // クライアント側のカウンタだけが 0 に戻る。MatchResultRow は
    // 「前回発火した値」を ref で覚えていて、それを超えたときだけ
    // 発火するため、次の 1 は過去の 3 を超えられず、本当に記録した
    // 操作のイベントが黙って消える。持ち越しているかをここで固定する。
    recordResultInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { recorded: false } }),
    );
    const afterNoWrite = await recordResultAction(
      { error: null, succeeded: 3 },
      formData(validInput),
    );

    recordResultInDb.mockReturnValue(
      Effect.succeed({ found: true, value: { recorded: true } }),
    );
    const afterWrite = await recordResultAction(
      afterNoWrite,
      formData(validInput),
    );

    expect(afterWrite.succeeded).toBe(4);
  });
});
