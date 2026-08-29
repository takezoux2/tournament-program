import { describe, expect, it } from "vitest";
import { toTournamentError } from "./errors";

describe("toTournamentError", () => {
  it("例外を UnexpectedTournamentError に包み、原因を残す", () => {
    const cause = new Error("network");
    const error = toTournamentError(cause);

    expect(error._tag).toBe("UnexpectedTournamentError");
    expect(error).toMatchObject({ reason: cause });
  });

  it("Error 以外の値も握り潰さず reason に残す", () => {
    const error = toTournamentError("なにか");

    expect(error._tag).toBe("UnexpectedTournamentError");
    expect(error).toMatchObject({ reason: "なにか" });
  });
});
