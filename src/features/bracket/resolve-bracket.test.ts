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
      matchName: "1",
      slots: [{ kind: "participant", participantId: "p1" }, { kind: "bye" }],
    },
    {
      id: "m2",
      round: 1,
      order: 1,
      matchName: "2",
      slots: [
        { kind: "participant", participantId: "p2" },
        { kind: "participant", participantId: "p3" },
      ],
    },
    {
      id: "m3",
      round: 2,
      order: 0,
      matchName: "3",
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
          matchName: "1",
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
          matchName: "1",
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

  it("スコアをスロットに配り、勝因とメモを試合に載せる", () => {
    const resolved = resolveBracket(participants, bracket, [
      {
        matchId: "m2",
        winnerId: "p2",
        winReason: "一本勝ち",
        scores: [
          { participantId: "p2", score: "21" },
          { participantId: "p3", score: "20" },
        ],
        note: "抗議あり",
      },
    ]);

    const match = byId(resolved, "m2");
    expect(match.winReason).toBe("一本勝ち");
    expect(match.note).toBe("抗議あり");
    expect(match.slots[0].score).toBe("21");
    expect(match.slots[1].score).toBe("20");
  });

  it("スコアが無いスロットは null", () => {
    const resolved = resolveBracket(participants, bracket, [
      { matchId: "m2", winnerId: "p2" },
    ]);
    const match = byId(resolved, "m2");
    expect(match.slots[0].score).toBeNull();
    expect(match.winReason).toBeNull();
    expect(match.note).toBeNull();
  });

  it("matchName を ResolvedMatch へ通す。無ければ null", () => {
    const bracketWithName: Bracket = {
      ...bracket,
      matches: [
        {
          ...bracket.matches[0],
          matchName: "3",
        },
      ],
    };
    const withName = resolveBracket(participants, bracketWithName, []);
    expect(withName[0].matchName).toBe("3");

    const bracketWithoutName: Bracket = {
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
    const withoutName = resolveBracket(participants, bracketWithoutName, []);
    expect(withoutName[0].matchName).toBeNull();
  });
});

describe("resolveBracket（敗者側）", () => {
  const players: Participant[] = [
    { id: "a", name: "A", seed: 0 },
    { id: "b", name: "B", seed: 1 },
    { id: "c", name: "C", seed: 2 },
  ];
  const bracket: Bracket = {
    id: "b1",
    name: "DE",
    matches: [
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "第1試合",
        slots: [
          { kind: "participant", participantId: "a" },
          { kind: "participant", participantId: "b" },
        ],
      },
      {
        id: "m1-1",
        bracket: "winners",
        round: 1,
        order: 1,
        matchName: "第2試合",
        slots: [{ kind: "participant", participantId: "c" }, { kind: "bye" }],
      },
      {
        id: "l1-0",
        bracket: "losers",
        round: 2,
        order: 0,
        matchName: "第3試合",
        slots: [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "loserOf", matchId: "m1-1" },
        ],
      },
    ],
  };
  const find = (matches: ReturnType<typeof resolveBracket>, id: string) => {
    const found = matches.find((match) => match.id === id);
    if (!found) throw new Error(id);
    return found;
  };

  it("bracket を引き継ぐ（省略時は winners）", () => {
    const resolved = resolveBracket(players, bracket, []);
    expect(find(resolved, "l1-0").bracket).toBe("losers");
  });

  it("敗者が決まる前は pending で「（展開済みの試合名）の敗者」を持つ", () => {
    const slot = find(resolveBracket(players, bracket, []), "l1-0").slots[0];
    expect(slot).toMatchObject({
      state: "pending",
      pendingLabel: "第1試合の敗者",
    });
  });

  it("BYE 試合の敗者は bye になり、相手が決まれば自動で勝ち上がる", () => {
    const resolved = resolveBracket(players, bracket, [
      { matchId: "m1-0", winnerId: "a" },
    ]);
    const losers = find(resolved, "l1-0");
    expect(losers.slots[0]).toMatchObject({
      state: "confirmed",
      participant: { id: "b" },
      isWinner: true,
    });
    expect(losers.slots[1].state).toBe("bye");
    expect(losers.winnerId).toBe("b");
    expect(losers.status).toBe("bye");
  });

  it("BYE どうしの試合の勝者は bye になる", () => {
    const resolved = resolveBracket(
      players,
      {
        id: "b2",
        name: "x",
        matches: [
          {
            id: "m1-0",
            round: 1,
            order: 0,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
          {
            id: "m2-0",
            round: 2,
            order: 0,
            slots: [
              { kind: "winnerOf", matchId: "m1-0" },
              { kind: "participant", participantId: "a" },
            ],
          },
        ],
      },
      [],
    );
    const next = find(resolved, "m2-0");
    expect(next.slots[0].state).toBe("bye");
    expect(next.winnerId).toBe("a");
  });
});
