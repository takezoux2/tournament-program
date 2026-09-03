import { describe, expect, it } from "vitest";
import { SELF_LOCKED_CODES, strippedSelfLockedCodes } from "./domain";

describe("SELF_LOCKED_CODES", () => {
  it("user.grant と user.view の両方を含む", () => {
    // user.view を外すと、戻り先の /orgs/[slug]/users が 404 になる。
    expect([...SELF_LOCKED_CODES]).toEqual(
      expect.arrayContaining(["user.grant", "user.view"]),
    );
  });
});

describe("strippedSelfLockedCodes", () => {
  it("外そうとしたロック対象を返す", () => {
    expect(
      strippedSelfLockedCodes(["user.view", "user.grant"], ["user.grant"]),
    ).toEqual(["user.view"]);
  });

  it("user.grant を外そうとしたときも拾う", () => {
    expect(
      strippedSelfLockedCodes(["user.view", "user.grant"], ["user.view"]),
    ).toEqual(["user.grant"]);
  });

  it("両方外そうとしたら両方返す", () => {
    expect(
      strippedSelfLockedCodes(["user.view", "user.grant"], ["org.edit"]),
    ).toEqual(["user.view", "user.grant"]);
  });

  it("両方残していれば空", () => {
    expect(
      strippedSelfLockedCodes(
        ["user.view", "user.grant"],
        ["user.view", "user.grant", "org.edit"],
      ),
    ).toEqual([]);
  });

  it("元々持っていないコードは対象にしない", () => {
    // 持っていない権限を「外すな」と言われても保存できない。
    expect(strippedSelfLockedCodes(["user.grant"], ["user.grant"])).toEqual([]);
  });

  it("ロック対象でない権限は自由に外せる", () => {
    expect(
      strippedSelfLockedCodes(
        ["user.view", "user.grant", "org.delete"],
        ["user.view", "user.grant"],
      ),
    ).toEqual([]);
  });
});
