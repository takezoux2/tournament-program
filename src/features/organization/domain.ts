export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 50;

/** ルーティングと衝突する語。組織 ID として使わせない。 */
export const RESERVED_SLUGS = [
  "new",
  "orgs",
  "api",
  "login",
  "signup",
  "mock",
] as const;

export type SlugViolation =
  | "empty"
  | "tooShort"
  | "tooLong"
  | "invalidCharacter"
  | "hyphenEdge"
  | "consecutiveHyphen"
  | "reserved";

/**
 * 妥当なら null、そうでなければ違反の種類を返す。
 *
 * 正規化ではなく拒否で扱う。slug は URL の一部としてそのまま出るため、
 * 入力を黙って書き換えるとユーザーが打った ID と実際の URL がずれる。
 */
export const validateSlug = (raw: string): SlugViolation | null => {
  if (raw.length === 0) return "empty";
  if (raw.length < MIN_SLUG_LENGTH) return "tooShort";
  if (raw.length > MAX_SLUG_LENGTH) return "tooLong";
  if (!/^[a-z0-9-]+$/.test(raw)) return "invalidCharacter";
  if (raw.startsWith("-") || raw.endsWith("-")) return "hyphenEdge";
  if (raw.includes("--")) return "consecutiveHyphen";
  if ((RESERVED_SLUGS as readonly string[]).includes(raw)) return "reserved";
  return null;
};
