import { describe, expect, it } from "vitest";
import {
  divisionBodyHeightMm,
  parsePrintOptions,
  printHref,
  printPageCss,
} from "./options";

describe("parsePrintOptions", () => {
  it("何も無ければ A4・結果ありにする", () => {
    expect(parsePrintOptions({})).toEqual({ paper: "a4", results: true });
  });

  it("paper=a3 と results=0 を読む", () => {
    expect(parsePrintOptions({ paper: "a3", results: "0" })).toEqual({
      paper: "a3",
      results: false,
    });
  });

  it("不正値は既定に戻す", () => {
    expect(parsePrintOptions({ paper: "b5", results: "yes" })).toEqual({
      paper: "a4",
      results: true,
    });
  });

  it("同じキーが複数あれば先頭を使う", () => {
    expect(parsePrintOptions({ paper: ["a3", "a4"], results: ["0"] })).toEqual({
      paper: "a3",
      results: false,
    });
  });
});

describe("printHref", () => {
  it("設定をクエリにした印刷ページの URL を返す", () => {
    expect(printHref("t1", { paper: "a3", results: false })).toBe(
      "/t/t1/print?paper=a3&results=0",
    );
    expect(printHref("t1", { paper: "a4", results: true })).toBe(
      "/t/t1/print?paper=a4&results=1",
    );
  });
});

describe("printPageCss", () => {
  it("既定のページは縦、部門ページは横にする", () => {
    const css = printPageCss("a4");
    expect(css).toContain("@page { size: A4 portrait; margin: 12mm; }");
    expect(css).toContain("@page division { size: A4 landscape; }");
  });

  it("部門ページの本文の高さを用紙から決める", () => {
    expect(printPageCss("a3")).toContain(
      ".print-division-body { height: 259mm; }",
    );
  });
});

describe("divisionBodyHeightMm", () => {
  it("横向きの高さから余白と見出しを引く", () => {
    expect(divisionBodyHeightMm("a4")).toBe(172);
    expect(divisionBodyHeightMm("a3")).toBe(259);
  });
});
