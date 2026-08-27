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
});
