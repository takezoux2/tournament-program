/** 落とす値の目印。キー名にこのいずれかを含めば中身を見ずに伏せる。 */
const SENSITIVE_KEY_PARTS = ["password", "token", "secret", "email"];

export const REDACTED = "[redacted]";
const CIRCULAR = "[circular]";

/**
 * 完全一致ではなく部分一致で見る。currentPassword / newPassword /
 * emailVerificationToken のような派生キーが増えるたびに一覧へ足す運用は
 * いつか漏れる。多めに伏せる方向に倒す。
 */
const isSensitiveKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
};

/**
 * プレーンなオブジェクトだけを分解対象にする。Date や Prisma の
 * Decimal のようなクラスのインスタンスを Object.entries で分解すると
 * 多くが {} に潰れて情報が失われるため、そのまま通す。
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const walk = (value: unknown, seen: WeakSet<object>): unknown => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return CIRCULAR;
    }
    seen.add(value);
    return value.map((item) => walk(item, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return CIRCULAR;
    }
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : walk(item, seen),
      ]),
    );
  }
  return value;
};

/**
 * debug ログに出す前に機微な値を落とす。新しいオブジェクトを返し、
 * 渡されたものは書き換えない。
 *
 * 判定はキー名だけで行い、値の中身（メールアドレスらしき文字列など）は
 * 見ない。値で判定すると無関係な値まで消えて、調査の役に立たなくなる。
 */
export const redact = (value: unknown): unknown => walk(value, new WeakSet());
