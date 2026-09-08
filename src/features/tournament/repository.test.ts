import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: {
      findMany: (args: unknown) => findMany(args),
      findFirst: (args: unknown) => findFirst(args),
    },
  },
}));

const { listTournamentsInOrganization, findTournamentInOrganization, findPublicTournament } =
  await import("./repository");
const { PUBLIC_TOURNAMENT_STATUSES } = await import("./status");

describe("listTournamentsInOrganization", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("organizationId を where に含めて絞り込む", async () => {
    findMany.mockResolvedValue([]);

    await listTournamentsInOrganization("o1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1" },
      }),
    );
  });

  it("作成日時の降順（createdAt: desc）で取得する", async () => {
    findMany.mockResolvedValue([]);

    await listTournamentsInOrganization("o1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("findTournamentInOrganization", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("id と organizationId の両方を where に含める（横断アクセス防止の回帰テスト）", async () => {
    // organizationId が where から抜け落ちると、id さえ知っていれば他組織の
    // 大会も取得できてしまう。この形なら書き忘れは「見つからない」に倒れる。
    findFirst.mockResolvedValue(null);

    await findTournamentInOrganization("o1", "t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1", organizationId: "o1" },
      }),
    );
  });

  it("見つからない場合は null を返す", async () => {
    findFirst.mockResolvedValue(null);

    await expect(findTournamentInOrganization("o1", "t1")).resolves.toBeNull();
  });

  it("select に description を含める", async () => {
    findFirst.mockResolvedValue(null);

    await findTournamentInOrganization("o1", "t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ description: true }),
      }),
    );
  });
});

describe("findPublicTournament", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("未ログインのときは公開してよい状態だけを where で許可する（公開範囲の回帰テスト）", async () => {
    // 取得してから status で弾く形にすると、4 ページのうち 1 枚で
    // 書き忘れた箇所がそのまま公開の穴になる。where に置けば
    // 書き忘れは「見つからない」に倒れる。除外リスト（status: { not: "DRAFT" }）
    // ではなく許可リストにしているのは、enum に状態が増えたときに
    // 書き忘れても新しい状態を世界に公開してしまわないため。
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1", null);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "t1",
          OR: [{ status: { in: PUBLIC_TOURNAMENT_STATUSES } }],
        },
      }),
    );
  });

  it("ログイン中は、閲覧者が組織メンバーである大会も where で許可する", async () => {
    // 準備中プレビューの入口。メンバー判定もリレーションで where に書くので、
    // クエリは 1 本のままで、公開可否の判断はこの関数に閉じたままになる。
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1", "u1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "t1",
          OR: [
            { status: { in: PUBLIC_TOURNAMENT_STATUSES } },
            { organization: { users: { some: { userId: "u1" } } } },
          ],
        },
      }),
    );
  });

  it("DRAFT は公開対象に含まれない（許可リストの意図を固定する回帰テスト）", () => {
    // enum に ARCHIVED などが増えても、ここが失敗しない限り DRAFT が
    // 公開に混ざることはない、という保証をテストとして残しておく。
    expect(PUBLIC_TOURNAMENT_STATUSES).not.toContain("DRAFT");
  });

  it("許可リストの中身そのものを固定する（IN_PROGRESS と COMPLETED が抜けないことの回帰テスト）", () => {
    // 上の objectContaining は PUBLIC_TOURNAMENT_STATUSES 自体と比較しているため
    // 中身がどう変わっても通ってしまう。status.ts 側で例えば
    // IN_PROGRESS: false に倒しても、この一件だけがそれを検知する。
    expect(PUBLIC_TOURNAMENT_STATUSES).toEqual(["IN_PROGRESS", "COMPLETED"]);
  });

  it("見つからない場合は null を返す", async () => {
    findFirst.mockResolvedValue(null);

    await expect(findPublicTournament("t1", null)).resolves.toBeNull();
  });

  it("organization.name を organizationName へ平して返す", async () => {
    findFirst.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      startsAt: null,
      status: "IN_PROGRESS",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "",
      organizationId: "o1",
      organization: { name: "テニス部" },
    });

    const tournament = await findPublicTournament("t1", null);

    expect(tournament).toMatchObject({
      id: "t1",
      organizationId: "o1",
      organizationName: "テニス部",
    });
    // ネストしたままにすると、画面側が Prisma の select の形を知ることになる。
    expect(tournament).not.toHaveProperty("organization");
  });

  it("select に description と organizationId を含める", async () => {
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1", null);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          description: true,
          organizationId: true,
        }),
      }),
    );
  });

  it("公開状態で見つかった大会は isPreview が false", async () => {
    findFirst.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      startsAt: null,
      status: "IN_PROGRESS",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "",
      organizationId: "o1",
      organization: { name: "テニス部" },
    });

    await expect(findPublicTournament("t1", "u1")).resolves.toMatchObject({
      isPreview: false,
    });
  });

  it("準備中の大会がメンバー資格で見つかった場合は isPreview が true", async () => {
    // isPreview は公開可否の判断ではなく、バナーを出すかどうかの表示用フラグ。
    // ゲート自体は where で済んでいる。
    findFirst.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      startsAt: null,
      status: "DRAFT",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "",
      organizationId: "o1",
      organization: { name: "テニス部" },
    });

    await expect(findPublicTournament("t1", "u1")).resolves.toMatchObject({
      isPreview: true,
    });
  });
});
