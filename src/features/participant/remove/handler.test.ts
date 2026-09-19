import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const removeParticipantInDb = vi.fn();
const revalidateParticipants = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) =>
    requirePermission(slug, code),
}));

vi.mock("../revalidate", () => ({
  revalidateParticipants: (slug: string, tournamentId: string) =>
    revalidateParticipants(slug, tournamentId),
}));

vi.mock("./repository", () => ({
  removeParticipantInDb: (ids: unknown, input: unknown) =>
    removeParticipantInDb(ids, input),
}));

const { removeParticipantAction } = await import("./handler");

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
};

const initial = { error: null };
const valid = { slug: "tennis", tournamentId: "t1", participantId: "p1" };

describe("removeParticipantAction", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    removeParticipantInDb.mockReset();
    revalidateParticipants.mockReset();
    requirePermission.mockResolvedValue({ organization: { id: "o1" } });
    removeParticipantInDb.mockImplementation(() => Effect.succeed(undefined));
  });

  it("tournament.edit を要求する", async () => {
    await removeParticipantAction(initial, formData(valid));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "tournament.edit");
  });

  it("URL の slug ではなく organization.id で絞って消す", async () => {
    await removeParticipantAction(initial, formData(valid));

    expect(removeParticipantInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1" },
    );
  });

  it("削除できたら一覧を再検証する", async () => {
    const state = await removeParticipantAction(initial, formData(valid));

    expect(state).toEqual({ error: null });
    expect(revalidateParticipants).toHaveBeenCalledWith("tennis", "t1");
  });

  it("エントリー済みは部門名つきの文言を行内に返す", async () => {
    const { ParticipantEnteredError } = await import("../errors");
    removeParticipantInDb.mockImplementation(() =>
      Effect.fail(new ParticipantEnteredError({ divisionNames: ["男子の部"] })),
    );

    const state = await removeParticipantAction(initial, formData(valid));

    expect(state).toEqual({
      error:
        "男子の部 にエントリー中です。先に部門の編集画面から外してください",
    });
    expect(revalidateParticipants).not.toHaveBeenCalled();
  });

  it("入力エラーは最初の 1 件を返す", async () => {
    const state = await removeParticipantAction(
      initial,
      formData({ ...valid, participantId: "" }),
    );

    expect(state).toEqual({ error: "削除する参加者を選んでください" });
    expect(removeParticipantInDb).not.toHaveBeenCalled();
  });
});
