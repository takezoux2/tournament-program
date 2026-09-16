import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_NAME,
  renderMatchName,
  resolveMatchNames,
} from "./match-name";
import { overallSeqKey } from "./overall-order";
import type { BracketMatch, MatchingConfig } from "./types";

const vars = { OverallSeq: 5 };

describe("DEFAULT_MATCH_NAME", () => {
  it("既定値は大会全体の通し番号で「第N試合」になる", () => {
    expect(DEFAULT_MATCH_NAME).toBe("第{{OverallSeq}}試合");
    expect(renderMatchName(DEFAULT_MATCH_NAME, vars)).toBe("第5試合");
  });
});

describe("renderMatchName", () => {
  it("OverallSeq を大会全体の通し番号に展開する", () => {
    expect(renderMatchName("第{{OverallSeq}}試合", vars)).toBe("第5試合");
  });

  it("DivisionSeq はもう変数ではないので空文字になる", () => {
    expect(renderMatchName("第{{DivisionSeq}}試合", vars)).toBe("第試合");
  });

  it("変数の内側の空白を許す", () => {
    expect(renderMatchName("第{{ OverallSeq }}試合", vars)).toBe("第5試合");
  });

  it("知らない変数は空文字にする（mustache の既定）", () => {
    expect(renderMatchName("第{{Foo}}試合", vars)).toBe("第試合");
  });

  it("変数名の大文字小文字を区別する", () => {
    expect(renderMatchName("{{overallseq}}", vars)).toBe("");
  });

  it("変数を含まない文字列はそのまま返す", () => {
    expect(renderMatchName("決勝", vars)).toBe("決勝");
  });

  it("テンプレートのリテラル部分はエスケープしない", () => {
    expect(renderMatchName("A & B 第{{OverallSeq}}試合", vars)).toBe(
      "A & B 第5試合",
    );
  });

  it("閉じ忘れた区画は例外にせずテンプレートのまま返す", () => {
    expect(renderMatchName("{{#a}}第1試合", vars)).toBe("{{#a}}第1試合");
  });
});

const match = (id: string, order: number, matchName: string): BracketMatch => ({
  id,
  bracket: "winners",
  round: 1,
  order,
  sequence: order,
  matchName,
  slots: [{ kind: "bye" }, { kind: "bye" }],
});

describe("resolveMatchNames", () => {
  const config: MatchingConfig = {
    version: 1,
    matches: [
      match("m1", 0, "第{{OverallSeq}}試合"),
      match("m2", 1, "決勝"),
      match("m3", 2, "第{{DivisionSeq}}試合"),
    ],
  };

  it("部門 id と組にしたキーで通し番号を引く", () => {
    const names = resolveMatchNames(
      config,
      "d1",
      new Map([
        [overallSeqKey("d1", "m1"), 7],
        [overallSeqKey("d1", "m2"), 8],
        [overallSeqKey("d1", "m3"), 9],
      ]),
    );

    expect(names.get("m1")).toBe("第7試合");
    expect(names.get("m2")).toBe("決勝");
  });

  it("部門内の番号は展開しない", () => {
    const names = resolveMatchNames(
      config,
      "d1",
      new Map([[overallSeqKey("d1", "m3"), 9]]),
    );

    expect(names.get("m3")).toBe("第試合");
  });

  it("通し番号を引けない試合は OverallSeq を 0 にする", () => {
    const names = resolveMatchNames(config, "d1", new Map());

    expect(names.get("m1")).toBe("第0試合");
    expect(names.get("m2")).toBe("決勝");
  });
});
