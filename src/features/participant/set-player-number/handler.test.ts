import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PARTICIPANT_FORM_STATE } from "../state";

const requirePermission = vi.fn();
const setPlayerNumberInDb = vi.fn();
const revalidatePlayerNumber = vi.fn();

// 関数呼び出しの順序を追跡するための配列
let calls: string[] = [];

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) => {
    calls.push("requirePermission");
    return requirePermission(slug, code);
  },
}));
vi.mock("../revalidate", () => ({
  revalidatePlayerNumber: (
    slug: string,
    tournamentId: string,
    divisionIds: readonly string[],
  ) => revalidatePlayerNumber(slug, tournamentId, divisionIds),
}));
vi.mock("./repository", () => ({
  setPlayerNumberInDb: (ids: unknown, input: unknown) => {
    calls.push("setPlayerNumberInDb");
    return setPlayerNumberInDb(ids, input);
  },
}));

const { setPlayerNumberAction } = await import("./handler");

const formData = (
  participantId: string,
  playerNumber: string,
  confirmedNumber?: string,
) => {
  const data = new FormData();
  data.set("slug", "acme");
  data.set("tournamentId", "t1");
  data.set("participantId", participantId);
  data.set("playerNumber", playerNumber);
  if (confirmedNumber !== undefined) {
    data.set("confirmedNumber", confirmedNumber);
  }
  return data;
};

beforeEach(() => {
  calls = [];
  requirePermission.mockReset();
  setPlayerNumberInDb.mockReset();
  revalidatePlayerNumber.mockReset();
  requirePermission.mockResolvedValue({
    organization: { id: "o1" },
    session: { user: { id: "u1" } },
  });
  setPlayerNumberInDb.mockReturnValue(
    Effect.succeed({ updated: true, divisionIds: ["d1", "d2"] }),
  );
});

describe("setPlayerNumberAction", () => {
  it("tournament.edit を要求し、トリム済みの入力をポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", " 7 "),
    );

    expect(requirePermission).toHaveBeenCalledWith("acme", "tournament.edit");
    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1", playerNumber: "7", confirmed: false },
    );
    // データベース処理よりも前に認可チェックが必ず実行されることを確認
    expect(calls).toEqual(["requirePermission", "setPlayerNumberInDb"]);
  });

  it("更新できたら、大会の全部門を再検証の対象にする", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", "7"),
    );

    expect(revalidatePlayerNumber).toHaveBeenCalledWith("acme", "t1", [
      "d1",
      "d2",
    ]);
    expect(state.error).toBeNull();
  });

  it("重複していたら確認待ちを返し、再検証しない", async () => {
    setPlayerNumberInDb.mockReturnValue(Effect.succeed({ updated: false }));

    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", "7"),
    );

    expect(state).toEqual({
      error: null,
      confirm: {
        message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: "7",
      },
    });
    expect(revalidatePlayerNumber).not.toHaveBeenCalled();
  });

  it("confirm で返した値と同じ番号の再送は確認済みとしてポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", " 7 ", "7"),
    );

    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1", playerNumber: "7", confirmed: true },
    );
  });

  it("確認後に番号を変えて送ったら未確認としてポートへ渡す", async () => {
    await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", "8", "7"),
    );

    expect(setPlayerNumberInDb).toHaveBeenCalledWith(
      { organizationId: "o1", tournamentId: "t1" },
      { participantId: "p1", playerNumber: "8", confirmed: false },
    );
  });

  it("選手番号が空なら入力エラーにする", async () => {
    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", "  "),
    );

    expect(state.error).toBe("選手番号を入力してください");
    expect(setPlayerNumberInDb).not.toHaveBeenCalled();
  });

  it("参加者が見つからなければ文言を返す", async () => {
    const { ParticipantNotFoundError } = await import("../errors");
    setPlayerNumberInDb.mockReturnValue(
      Effect.fail(new ParticipantNotFoundError({ participantId: "p1" })),
    );

    const state = await setPlayerNumberAction(
      INITIAL_PARTICIPANT_FORM_STATE,
      formData("p1", "7"),
    );

    expect(state.error).toBe(
      "対象の参加者が見つかりません。画面を再読み込みしてください",
    );
    expect(revalidatePlayerNumber).not.toHaveBeenCalled();
  });
});
