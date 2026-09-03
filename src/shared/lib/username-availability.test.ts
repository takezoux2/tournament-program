import { describe, expect, it, vi } from "vitest";

const count = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: { user: { count: (args: unknown) => count(args) } },
}));

const { findAvailableUsername, usernameExistsInDb } = await import(
  "./username-availability"
);
const { USERNAME_NUMBERED_CANDIDATE_LIMIT, USERNAME_RANDOM_CANDIDATE_LIMIT } =
  await import("./username");

/** taken に入っている名前だけ「使用済み」とみなす確認関数。 */
const takenAre = (taken: string[]) => (username: string) =>
  Promise.resolve(taken.includes(username));

describe("findAvailableUsername", () => {
  it("空いていれば素をそのまま返す", async () => {
    await expect(findAvailableUsername("takezo", takenAre([]))).resolves.toBe(
      "takezo",
    );
  });

  it("埋まっていれば連番を足した最初の空きを返す", async () => {
    await expect(
      findAvailableUsername("takezo", takenAre(["takezo", "takezo2"])),
    ).resolves.toBe("takezo3");
  });

  it("空いている候補が見つかった時点で問い合わせを止める", async () => {
    const exists = vi.fn(takenAre(["takezo"]));

    await findAvailableUsername("takezo", exists);

    expect(exists).toHaveBeenCalledTimes(2);
  });

  it("連番が全部埋まっていてもランダム接尾辞つきの候補で救われる", async () => {
    // mapProfileToUser はサインインのたびに走るので、ここで例外にすると
    // 行だけは正しい既存ユーザーがログインできなくなる。
    const numbered = [
      "takezo",
      ...Array.from(
        { length: USERNAME_NUMBERED_CANDIDATE_LIMIT - 1 },
        (_, i) => `takezo${i + 2}`,
      ),
    ];

    await expect(
      findAvailableUsername("takezo", takenAre(numbered), () => "abc123"),
    ).resolves.toBe("takezo-abc123");
  });

  it("候補が尽きたら黙って諦めず例外にする", async () => {
    // 無音で妙な名前を割り当てるより、失敗として見える方が追える。
    const allTaken = () => Promise.resolve(true);

    await expect(findAvailableUsername("takezo", allTaken)).rejects.toThrow(
      /利用可能な username を生成できませんでした/,
    );
  });

  it("候補の数は上限で打ち切られ、無限に問い合わせない", async () => {
    const exists = vi.fn(() => Promise.resolve(true));

    await expect(findAvailableUsername("takezo", exists)).rejects.toThrow();
    expect(exists).toHaveBeenCalledTimes(
      USERNAME_NUMBERED_CANDIDATE_LIMIT + USERNAME_RANDOM_CANDIDATE_LIMIT,
    );
  });
});

describe("usernameExistsInDb", () => {
  it("username 完全一致の件数で判定する", async () => {
    count.mockResolvedValue(1);

    await expect(usernameExistsInDb("takezo")).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({ where: { username: "takezo" } });
  });

  it("0 件なら空きとみなす", async () => {
    count.mockResolvedValue(0);

    await expect(usernameExistsInDb("takezo")).resolves.toBe(false);
  });
});
