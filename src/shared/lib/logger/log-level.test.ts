import { describe, expect, it } from "vitest";
import { parseLogLevel } from "./log-level";

describe("parseLogLevel", () => {
  it("_tag 表記（Warning）を受ける", () => {
    expect(parseLogLevel("Warning", "development").label).toBe("WARN");
  });

  it("label 表記（WARN）も受ける", () => {
    expect(parseLogLevel("WARN", "development").label).toBe("WARN");
  });

  it("大文字小文字と前後の空白を無視する", () => {
    expect(parseLogLevel("  dEbUg ", "development").label).toBe("DEBUG");
  });

  it("未設定なら本番は INFO", () => {
    expect(parseLogLevel(undefined, "production").label).toBe("INFO");
  });

  it("未設定なら本番以外は DEBUG", () => {
    expect(parseLogLevel(undefined, "development").label).toBe("DEBUG");
  });

  it("空文字は未設定と同じ扱いにする", () => {
    expect(parseLogLevel("", "production").label).toBe("INFO");
  });

  it("不正値は既定値に倒し、例外を投げない", () => {
    expect(parseLogLevel("verbose", "production").label).toBe("INFO");
  });

  it("OFF でログを止められる", () => {
    expect(parseLogLevel("OFF", "development").label).toBe("OFF");
  });
});
