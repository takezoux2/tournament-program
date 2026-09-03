import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DivisionDuplicateEntryError } from "../errors";
import { INITIAL_DIVISION_FORM_STATE } from "../state";

const requireOrganization = vi.fn();
const addEntryInDb = vi.fn();
const revalidateDivisionSetup = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

// 関数呼び出しの順序を追跡するための配列
let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    calls.push("requireOrganization");
    return requireOrganization(slug);
  },
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
  addEntryInDb: (ids: unknown, input: unknown) => {
    calls.push("addEntryInDb");
    return addEntryInDb(ids, input);
  },
}));

const { addEntryAction } = await import("./handler");

const formData = (fields: Record<string, string>) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("divisionId", "d1");
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requireOrganization.mockReset();
  addEntryInDb.mockReset();
  revalidateDivisionSetup.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ organization: { id: "o1" } });
  addEntryInDb.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("addEntryAction", () => {
  it("既存メンバーの選択をポートへ渡す", async () => {
    await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "existing", memberId: "m1" }),
    );

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(addEntryInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1", divisionId: "d1" },
      { mode: "existing", memberId: "m1" },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requireOrganization", "addEntryInDb"]);
  });

  it("新規登録の入力をポートへ渡す", async () => {
    await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "new", name: "山田太郎", nameKana: "やまだたろう" }),
    );

    expect(addEntryInDb).toHaveBeenCalledWith(expect.anything(), {
      mode: "new",
      name: "山田太郎",
      nameKana: "やまだたろう",
    });
  });

  it("成功したら再検証して通知を返す", async () => {
    const state = await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "existing", memberId: "m1" }),
    );

    expect(revalidateDivisionSetup).toHaveBeenCalledWith("acme", "t1", "d1");
    expect(state.error).toBeNull();
    expect(state.notice).toBe("エントリーを追加しました");
  });

  it("入力が不正ならポートを呼ばない", async () => {
    const state = await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "new", name: "  ", nameKana: "やまだ" }),
    );

    expect(state.error).toBe("氏名を入力してください");
    expect(addEntryInDb).not.toHaveBeenCalled();
  });

  it("二重エントリーは文言にして返す", async () => {
    addEntryInDb.mockReturnValue(
      Effect.fail(new DivisionDuplicateEntryError({ divisionId: "d1" })),
    );

    const state = await addEntryAction(
      INITIAL_DIVISION_FORM_STATE,
      formData({ mode: "existing", memberId: "m1" }),
    );

    expect(state.error).toBe("その参加者はすでにエントリーしています");
  });

  it("部門が無ければ 404 にする", async () => {
    addEntryInDb.mockReturnValue(Effect.succeed({ found: false }));

    await expect(
      addEntryAction(
        INITIAL_DIVISION_FORM_STATE,
        formData({ mode: "existing", memberId: "m1" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
