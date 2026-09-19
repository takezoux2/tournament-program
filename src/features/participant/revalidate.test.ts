import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const { revalidateParticipants, revalidatePlayerNumber } = await import(
  "./revalidate"
);

describe("revalidateParticipants", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
  });

  it("管理と公開の参加者一覧を再検証する", () => {
    revalidateParticipants("tennis", "t1");

    expect(revalidatePath.mock.calls.flat()).toEqual([
      "/orgs/tennis/tournaments/t1/participants",
      "/t/t1/participants",
    ]);
  });
});

describe("revalidatePlayerNumber", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
  });

  it("divisionId が無ければ参加者一覧だけを再検証する", () => {
    // 番号は大会内で共通なので、部門を経由しない編集でも一覧は必ず対象。
    revalidatePlayerNumber("tennis", "t1", null);

    expect(revalidatePath.mock.calls.flat()).toEqual([
      "/orgs/tennis/tournaments/t1/participants",
      "/t/t1/participants",
    ]);
  });

  it("divisionId があれば部門の編集画面も再検証する", () => {
    revalidatePlayerNumber("tennis", "t1", "d1");

    expect(revalidatePath.mock.calls.flat()).toEqual([
      "/orgs/tennis/tournaments/t1/participants",
      "/t/t1/participants",
      "/orgs/tennis/tournaments/t1/divisions/d1",
      "/orgs/tennis/tournaments/t1/divisions/d1/setup",
      "/orgs/tennis/tournaments/t1/divisions/d1/league",
    ]);
  });
});
