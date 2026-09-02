import { describe, expect, it } from "vitest";
import {
  canByCode,
  defineAbilityFor,
  PERMISSION_CODES,
  parsePermissionCode,
} from "./ability";

describe("parsePermissionCode", () => {
  it('"user.add" を subject と action に分解する', () => {
    expect(parsePermissionCode("user.add")).toEqual({
      subject: "user",
      action: "add",
    });
  });

  it("区切りが無い場合は null を返す", () => {
    expect(parsePermissionCode("useradd")).toBeNull();
  });

  it("ドットが 2 つ以上ある場合は null を返す", () => {
    expect(parsePermissionCode("a.b.c")).toBeNull();
  });

  it("subject または action が空の場合は null を返す", () => {
    expect(parsePermissionCode(".add")).toBeNull();
    expect(parsePermissionCode("user.")).toBeNull();
  });
});

describe("defineAbilityFor", () => {
  it("与えた code の操作だけを許可する", () => {
    const ability = defineAbilityFor(["user.view", "user.add"]);

    expect(ability.can("view", "user")).toBe(true);
    expect(ability.can("add", "user")).toBe(true);
    expect(ability.can("remove", "user")).toBe(false);
  });

  it("空配列なら何も許可しない", () => {
    const ability = defineAbilityFor([]);

    for (const code of PERMISSION_CODES) {
      expect(canByCode(ability, code)).toBe(false);
    }
  });

  it("PERMISSION_CODES を全部渡せば全部許可される", () => {
    const ability = defineAbilityFor(PERMISSION_CODES);

    for (const code of PERMISSION_CODES) {
      expect(canByCode(ability, code)).toBe(true);
    }
  });

  it("subject が同じでも action が違えば許可されない（横断許可の回帰テスト）", () => {
    // "user.view" だけで user への全操作が通ってしまう実装に後退すると落ちる。
    const ability = defineAbilityFor(["user.view"]);

    expect(canByCode(ability, "user.view")).toBe(true);
    expect(canByCode(ability, "user.add")).toBe(false);
    expect(canByCode(ability, "user.remove")).toBe(false);
    expect(canByCode(ability, "user.grant")).toBe(false);
  });

  it("不正な形式の code は無視し、権限を増やす方向には倒れない", () => {
    const ability = defineAbilityFor(["こわれた", "user.view"]);

    expect(canByCode(ability, "user.view")).toBe(true);
    expect(canByCode(ability, "user.add")).toBe(false);
  });
});

describe("canByCode", () => {
  it("不正な形式の code には false を返す", () => {
    const ability = defineAbilityFor(PERMISSION_CODES);

    expect(canByCode(ability, "こわれた")).toBe(false);
  });
});
