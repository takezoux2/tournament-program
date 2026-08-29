import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toOrganizationError } from "./errors";

/** P2002（unique 制約違反）を模した Prisma のエラーを作る。 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });

describe("toOrganizationError", () => {
  it("P2002 を SlugTaken に写像する", () => {
    const error = toOrganizationError(uniqueViolation(), "tennis");
    expect(error._tag).toBe("SlugTaken");
    expect(error).toMatchObject({ slug: "tennis" });
  });

  it("P2002 以外の Prisma エラーは UnexpectedOrganizationError にする", () => {
    const cause = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "7.10.0",
    });
    const error = toOrganizationError(cause, "tennis");
    expect(error._tag).toBe("UnexpectedOrganizationError");
    expect(error).toMatchObject({ reason: cause });
  });

  it("Prisma と無関係な例外も握り潰さず reason に残す", () => {
    const cause = new Error("network");
    const error = toOrganizationError(cause, "tennis");
    expect(error._tag).toBe("UnexpectedOrganizationError");
    expect(error).toMatchObject({ reason: cause });
  });
});
