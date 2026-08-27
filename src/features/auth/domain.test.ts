import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./domain";

describe("safeRedirectPath", () => {
  it("同一オリジンの絶対パスは通す", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("クエリ付きのパスも通す", () => {
    expect(safeRedirectPath("/tournaments?page=2")).toBe("/tournaments?page=2");
  });

  it("null は / にする", () => {
    expect(safeRedirectPath(null)).toBe("/");
  });

  it("undefined は / にする", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
  });

  it("空文字は / にする", () => {
    expect(safeRedirectPath("")).toBe("/");
  });

  it("絶対 URL は / にする", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/");
  });

  it("プロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("//evil.example.com")).toBe("/");
  });

  it("バックスラッシュを使ったプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/");
  });

  it("相対パスは / にする", () => {
    expect(safeRedirectPath("dashboard")).toBe("/");
  });

  it("タブ文字を含むプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\t/evil.example.com")).toBe("/");
  });

  it("改行 (LF) を含むプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\n/evil.example.com")).toBe("/");
  });

  it("改行 (CR) を含むプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\r/evil.example.com")).toBe("/");
  });

  it("タブ文字が連続していても / にする", () => {
    expect(safeRedirectPath("/\t\t/evil.example.com")).toBe("/");
  });

  it("パスの途中にタブ文字があっても / にする", () => {
    expect(safeRedirectPath("/dash\tboard")).toBe("/");
  });

  it("スペースはタブと異なり弾かれずそのまま通す", () => {
    expect(safeRedirectPath("/ /evil.example.com")).toBe("/ /evil.example.com");
  });
});
