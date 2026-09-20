import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const addParticipantInDb = vi.fn();
const revalidateParticipants = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

vi.mock("../revalidate", () => ({
  revalidateParticipants: (slug: string, tournamentId: string) =>
    revalidateParticipants(slug, tournamentId),
}));

vi.mock("./repository", () => ({
  addParticipantInDb: (ids: unknown, input: unknown) =>
    addParticipantInDb(ids, input),
}));

const { addParticipantAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };

const existingForm = {
  slug: "tennis",
  tournamentId: "t1",
  mode: "existing",
  memberId: "m1",
  name: "",
  nameKana: "",
};

describe("addParticipantAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    addParticipantInDb.mockReset();
    revalidateParticipants.mockReset();
    notFound.mockClear();
    requirePermission.mockResolvedValue({ organization: { id: "o1" } });
    addParticipantInDb.mockImplementation(() =>
      Effect.succeed({ found: true, value: { participantId: "p1" } }),
    );
  });

  it("tournament.edit を要求する", async () => {
    await addParticipantAction(initial, formData(existingForm));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "tournament.edit");
  });

  it("URL の slug ではなく organization.id で絞る", async () => {
    await addParticipantAction(initial, formData(existingForm));

    expect(addParticipantInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { mode: "existing", memberId: "m1" },
    );
  });

  it("入力エラーは最初の 1 件を返す", async () => {
    const state = await addParticipantAction(
      initial,
      formData({ ...existingForm, memberId: "" }),
    );

    expect(state).toEqual({ error: "メンバーを選択してください" });
    expect(addParticipantInDb).not.toHaveBeenCalled();
  });

  it("追加できたら一覧を再検証する", async () => {
    const state = await addParticipantAction(initial, formData(existingForm));

    expect(state).toEqual({ error: null });
    expect(revalidateParticipants).toHaveBeenCalledWith("tennis", "t1");
  });

  it("大会が見つからなければ 404 に倒す", async () => {
    addParticipantInDb.mockImplementation(() =>
      Effect.succeed({ found: false }),
    );

    await expect(
      addParticipantAction(initial, formData(existingForm)),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ドメインのエラーは文言にして返す", async () => {
    const { ParticipantDuplicateError } = await import("../errors");
    addParticipantInDb.mockImplementation(() =>
      Effect.fail(new ParticipantDuplicateError({ memberId: "m1" })),
    );

    const state = await addParticipantAction(initial, formData(existingForm));

    expect(state).toEqual({ error: "その人はすでにこの大会の参加者です" });
    expect(revalidateParticipants).not.toHaveBeenCalled();
  });
});
