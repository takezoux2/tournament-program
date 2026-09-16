import { describe, expect, it } from "vitest";
import {
  createSlotLabeler,
  formatDivisionPosition,
  matchCardLabel,
  matchPositionLabel,
} from "./label";
import type { BracketMatch, DivisionEntries, MatchingConfig } from "./types";

const config: MatchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      sequence: 0,
      matchName: "3",
      slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
    },
    {
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      sequence: 1,
      matchName: "9",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "loserOf", matchId: "m1-0" },
      ],
    },
  ],
};

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e9", participantId: "p9", seed: 1 },
  ],
};

const participants = [{ id: "p1", name: "山田" }];

describe("createSlotLabeler", () => {
  it("entry は参加者名にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "entry", entryId: "e1" })).toBe("山田");
  });

  it("参加者を引けない entry は「（不明な参加者）」にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "entry", entryId: "e9" })).toBe("（不明な参加者）");
  });

  it("勝者・敗者参照は相手の試合名で表す", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "m1-0" })).toBe("第3試合の勝者");
    expect(label({ kind: "loserOf", matchId: "m1-0" })).toBe("第3試合の敗者");
  });

  it("知らない試合を指す参照は「?」にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "winnerOf", matchId: "zzz" })).toBe("第?試合の勝者");
  });

  it("bye は BYE にする", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(label({ kind: "bye" })).toBe("BYE");
  });
});

describe("matchCardLabel", () => {
  it("両スロットを vs でつなぐ", () => {
    const label = createSlotLabeler(config, entries, participants);
    expect(matchCardLabel(config.matches[0], label)).toBe("山田 vs BYE");
  });
});

describe("matchPositionLabel", () => {
  it("round と order から構造上の位置を作る", () => {
    expect(matchPositionLabel(config.matches[1], "SINGLE_ELIMINATION")).toBe(
      "2回戦 (1)",
    );
  });

  describe("matchPositionLabel（形式ごとの文言）", () => {
    // BracketMatch.slots はタプル型（読み取り専用ではない）なので、
    // ここでは `as const` を使わず型注釈でリテラル型を効かせる。
    const match: BracketMatch = {
      id: "x1-0",
      bracket: "winners",
      round: 2,
      order: 1,
      sequence: 1,
      matchName: "5",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    };

    it("トーナメントは「N回戦 (ラウンド内の位置)」で表す", () => {
      // 「第 M 試合」と書くと、試合名の既定値（第{{OverallSeq}}試合）と
      // 見分けが付かなくなる。
      expect(matchPositionLabel(match, "SINGLE_ELIMINATION")).toBe("2回戦 (2)");
    });

    it("リーグは位置の文言を出さない", () => {
      // リーグに節は無い。round は常に 1 なので「1回戦」と出すと嘘になり、
      // 通し番号を出すと試合番号と紛らわしい。
      expect(matchPositionLabel(match, "ROUND_ROBIN")).toBe("");
    });
  });
});

describe("formatDivisionPosition", () => {
  it("部門名と位置を「 / 」でつなぐ", () => {
    expect(formatDivisionPosition("男子", "1回戦 (1)")).toBe(
      "男子 / 1回戦 (1)",
    );
  });

  it("位置が空文字なら部門名だけにする", () => {
    expect(formatDivisionPosition("女子リーグ", "")).toBe("女子リーグ");
  });
});
