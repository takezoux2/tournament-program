import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const participantFindFirst = vi.fn();
const participantUpdate = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        participant: {
          findFirst: (args: unknown) => participantFindFirst(args),
          update: (args: unknown) => participantUpdate(args),
        },
      }),
  },
}));

const { setPlayerNumberInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

beforeEach(() => {
  participantFindFirst.mockReset();
  participantUpdate.mockReset();
  participantUpdate.mockResolvedValue({ id: "p1" });
});

describe("setPlayerNumberInDb", () => {
  it("重複が無ければ更新する", async () => {
    // 1 回目: 対象参加者の所有権チェック / 2 回目: 重複チェック
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(null);

    const outcome = await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(outcome).toEqual({ found: true, value: { updated: true } });
    expect(participantUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { playerNumber: "7" },
    });
  });

  it("所有権を where に入れて対象を引く", async () => {
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(null);

    await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(participantFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: "p1",
        tournament: { id: "t1", organizationId: "o1" },
      },
      select: { id: true },
    });
  });

  it("重複があり未確認なら更新せず duplicated を返す", async () => {
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce({ id: "p2" });

    const outcome = await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(outcome).toEqual({ found: true, value: { updated: false } });
    expect(participantUpdate).not.toHaveBeenCalled();
  });

  it("重複があっても確認済みなら更新する", async () => {
    participantFindFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce({ id: "p2" });

    const outcome = await Effect.runPromise(
      setPlayerNumberInDb(ids, {
        participantId: "p1",
        playerNumber: "7",
        confirmed: true,
      }),
    );

    expect(outcome).toEqual({ found: true, value: { updated: true } });
    expect(participantUpdate).toHaveBeenCalled();
  });

  it("大会に居ない参加者なら DivisionParticipantNotFoundError", async () => {
    participantFindFirst.mockResolvedValueOnce(null);

    const exit = await Effect.runPromiseExit(
      setPlayerNumberInDb(ids, {
        participantId: "p9",
        playerNumber: "7",
        confirmed: false,
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("DivisionParticipantNotFoundError");
      }
    }
    expect(participantUpdate).not.toHaveBeenCalled();
  });
});
