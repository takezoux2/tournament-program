import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";

/**
 * 権限コードの一覧。DB の Permission.code と 1:1 で対応させる。
 * migration のシードもこの並びに合わせること。
 */
export const PERMISSION_CODES = [
  "user.view",
  "user.add",
  "user.remove",
  "user.grant",
  "member.view",
  "member.add",
  "member.remove",
  "tournament.create",
  "tournament.edit",
  "tournament.delete",
  "org.edit",
  "org.delete",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** "user.add" を CASL の [action, subject] = ["add", "user"] に写す。 */
type ToAbilityTuple<T extends string> = T extends `${infer S}.${infer A}`
  ? [A, S]
  : never;

export type AppAbility = MongoAbility<ToAbilityTuple<PermissionCode>>;

/**
 * 文字列から動的に規則を積むための緩い型。CASL の can は
 * action と subject の組み合わせを型で縛るが、DB から来た文字列は
 * その組み合わせを静的に持たないため、ここだけ型を外す。
 * 組み合わせの正しさは PERMISSION_CODES に対するテストで担保する。
 */
type LooseRuleAdder = (action: string, subject: string) => void;
type LooseChecker = (action: string, subject: string) => boolean;

/**
 * "<subject>.<action>" を分解する。区切りが無い・前後どちらかが空・
 * ドットが 2 つ以上ある場合は null を返す。
 */
export const parsePermissionCode = (
  code: string,
): { subject: string; action: string } | null => {
  const parts = code.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [subject, action] = parts;
  if (subject === "" || action === "") {
    return null;
  }
  return { subject, action };
};

/**
 * 保有する権限コードから CASL の Ability を組む。純粋関数なので
 * DB にも Next.js にも依存せず、そのままテストできる。
 */
export const defineAbilityFor = (codes: readonly string[]): AppAbility => {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  const addRule = builder.can as unknown as LooseRuleAdder;

  for (const code of codes) {
    const parsed = parsePermissionCode(code);
    // 不正な形式は無視する。DB に想定外の行が混ざっても、
    // 許可が増える方向には倒れない。
    if (parsed === null) {
      continue;
    }
    addRule(parsed.action, parsed.subject);
  }

  return builder.build();
};

/** 権限コードのまま可否を問い合わせる。呼び出し側に分解させないための入口。 */
export const canByCode = (ability: AppAbility, code: string): boolean => {
  const parsed = parsePermissionCode(code);
  if (parsed === null) {
    return false;
  }
  const check = ability.can.bind(ability) as unknown as LooseChecker;
  return check(parsed.action, parsed.subject);
};
