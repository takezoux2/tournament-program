import { describe, expect, it } from "vitest";
import { resolveBracket } from "./resolve-bracket";
import type { Bracket, MatchResult, Participant, ResolvedMatch } from "./types";

const participants: Participant[] = [
  { id: "p1", name: "Alice", seed: 1 },
  { id: "p2", name: "Bob", seed: 2 },
  { id: "p3", name: "Carol", seed: 3 },
];

/** 3 名を 4 枠に入れた最小ブラケット。p1 が 1 回戦 BYE。 */
const bracket: Bracket = {
  id: "b1",
  name: "Test Cup",
  matches: [
    {
      id: "m1",
      round: 1,
      order: 0,
      matchNumber: "1",
      slots: [{ kind: "participant", participantId: "p1" }, { kind: "bye" }],
    },
    {
      id: "m2",
      round: 1,
      order: 1,
      matchNumber: "2",
      slots: [
        { kind: "participant", participantId: "p2" },
        { kind: "participant", participantId: "p3" },
      ],
    },
    {
      id: "m3",
      round: 2,
      order: 0,
      matchNumber: "3",
      slots: [
        { kind: "winnerOf", matchId: "m1" },
        { kind: "winnerOf", matchId: "m2" },
      ],
    },
  ],
};

const byId = (matches: ResolvedMatch[], id: string): ResolvedMatch => {
  const match = matches.find((m) => m.id === id);
  if (!match) throw new Error(`no match ${id}`);
  return match;
};

describe("resolveBracket", () => {
  it("試合数が変わらない", () => {
    expect(resolveBracket(participants, bracket, [])).toHaveLength(3);
  });

  it("BYE の相手は結果がなくても勝ち上がる", () => {
    const m1 = byId(resolveBracket(participants, bracket, []), "m1");
    expect(m1.winnerId).toBe("p1");
    expect(m1.status).toBe("bye");
    expect(m1.slots[0].state).toBe("confirmed");
    expect(m1.slots[0].isWinner).toBe(true);
    expect(m1.slots[1].state).toBe("bye");
    expect(m1.slots[1].participant).toBeNull();
  });

  it("結果が空なら通常の 1 回戦は ready のまま", () => {
    const m2 = byId(resolveBracket(participants, bracket, []), "m2");
    expect(m2.status).toBe("ready");
    expect(m2.winnerId).toBeNull();
    expect(m2.slots.every((s) => s.state === "confirmed")).toBe(true);
    expect(m2.slots.every((s) => s.isWinner === false)).toBe(true);
  });

  it("供給元が未決着のスロットは pending、試合は waiting になる", () => {
    const m3 = byId(resolveBracket(participants, bracket, []), "m3");
    expect(m3.slots[0].state).toBe("confirmed");
    expect(m3.slots[0].participant?.id).toBe("p1");
    expect(m3.slots[1].state).toBe("pending");
    expect(m3.slots[1].participant).toBeNull();
    expect(m3.status).toBe("waiting");
  });

  it("結果を入れると勝者が次ラウンドへ伝播する", () => {
    const results: MatchResult[] = [
      { matchId: "m2", winnerId: "p3", score: "2-1" },
    ];
    const resolved = resolveBracket(participants, bracket, results);

    const m2 = byId(resolved, "m2");
    expect(m2.status).toBe("done");
    expect(m2.winnerId).toBe("p3");
    expect(m2.score).toBe("2-1");
    expect(m2.slots[0].isWinner).toBe(false);
    expect(m2.slots[1].isWinner).toBe(true);

    const m3 = byId(resolved, "m3");
    expect(m3.slots[1].participant?.id).toBe("p3");
    expect(m3.status).toBe("ready");
  });

  it("score が無い結果では score が null になる", () => {
    const resolved = resolveBracket(participants, bracket, [
      { matchId: "m2", winnerId: "p2" },
    ]);
    expect(byId(resolved, "m2").score).toBeNull();
  });

  it("sourceMatchIds に供給元試合 id が入る", () => {
    const resolved = resolveBracket(participants, bracket, []);
    expect(byId(resolved, "m1").sourceMatchIds).toEqual([null, null]);
    expect(byId(resolved, "m3").sourceMatchIds).toEqual(["m1", "m2"]);
  });

  it("存在しない参加者 id を参照したら例外を投げる", () => {
    const broken: Bracket = {
      ...bracket,
      matches: [
        {
          id: "x1",
          round: 1,
          order: 0,
          matchNumber: "1",
          slots: [
            { kind: "participant", participantId: "ghost" },
            { kind: "bye" },
          ],
        },
      ],
    };
    expect(() => resolveBracket(participants, broken, [])).toThrow(/ghost/);
  });

  it("存在しない試合 id を参照したら例外を投げる", () => {
    const broken: Bracket = {
      ...bracket,
      matches: [
        {
          id: "x1",
          round: 2,
          order: 0,
          matchNumber: "1",
          slots: [{ kind: "winnerOf", matchId: "ghost" }, { kind: "bye" }],
        },
      ],
    };
    expect(() => resolveBracket(participants, broken, [])).toThrow(/ghost/);
  });

  it("勝者がどちらのスロットにも居なければ例外を投げる", () => {
    const results: MatchResult[] = [{ matchId: "m2", winnerId: "p1" }];
    expect(() => resolveBracket(participants, bracket, results)).toThrow(/p1/);
  });

  it("BYE 試合の結果が自動勝者と一致すれば score が反映される", () => {
    const results: MatchResult[] = [
      { matchId: "m1", winnerId: "p1", score: "W-O" },
    ];
    const m1 = byId(resolveBracket(participants, bracket, results), "m1");
    expect(m1.winnerId).toBe("p1");
    expect(m1.score).toBe("W-O");
    expect(m1.status).toBe("bye");
  });

  it("BYE 試合の結果が自動勝者と食い違うと例外を投げる", () => {
    const results: MatchResult[] = [{ matchId: "m1", winnerId: "p9" }];
    expect(() => resolveBracket(participants, bracket, results)).toThrow(/p9/);
  });

  it("matchNumber を ResolvedMatch へ通す。無ければ null", () => {
    const bracketWithNumber: Bracket = {
      ...bracket,
      matches: [
        {
          ...bracket.matches[0],
          matchNumber: "3",
        },
      ],
    };
    const withNumber = resolveBracket(participants, bracketWithNumber, []);
    expect(withNumber[0].matchNumber).toBe("3");

    const bracketWithoutNumber: Bracket = {
      ...bracket,
      matches: [
        {
          id: "m1",
          round: 1,
          order: 0,
          slots: [
            { kind: "participant", participantId: "p1" },
            { kind: "bye" },
          ],
        },
      ],
    };
    const withoutNumber = resolveBracket(
      participants,
      bracketWithoutNumber,
      [],
    );
    expect(withoutNumber[0].matchNumber).toBeNull();
  });
});
