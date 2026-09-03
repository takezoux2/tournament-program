import { z } from "zod";

/**
 * username は User テーブルで unique。大文字小文字が違うだけの 2 アカウントを
 * 登録できてしまうと検索も外れるため、保存も検索も小文字に揃える。
 * signup（features/auth）と検索（features/organization-user）の両方から使うので、
 * normalizeEmail と同じくどちらのスライスにも属さない shared に置く。
 */
export const normalizeUsername = (raw: string): string =>
  raw.trim().toLowerCase();

/** username の長さの上限。生成した名前もこの範囲に収める。 */
export const MAX_USERNAME_LENGTH = 50;

/**
 * username に使える文字。小文字化した後に当てるので A-Z は実質通らないが、
 * 規則そのものは正規化の前後どちらで読んでも同じ意味になるよう両方を書く。
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * username の唯一の規則。signup フォーム（クライアント）と
 * better-auth の additionalFields（公開エンドポイント）の両方がこれを使う。
 *
 * 1 か所に置いているのは、片方だけ緩いと直接 POST で規則を迂回できるため。
 * 小文字化を regex より前に置くのは、大文字混じりの入力を弾くのではなく
 * 揃えて受け入れたいから。
 */
export const usernameSchema = z
  .string()
  .transform((raw) => normalizeUsername(raw))
  .pipe(
    z
      .string()
      .min(1, "ユーザー名を入力してください")
      .max(
        MAX_USERNAME_LENGTH,
        `ユーザー名は${MAX_USERNAME_LENGTH}文字以内で入力してください`,
      )
      .regex(
        USERNAME_PATTERN,
        "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
      ),
  );

/** 衝突時に試す候補の総数。無限ループを避けるための上限。 */
export const USERNAME_CANDIDATE_LIMIT = 20;

/** ローカル部が使える文字を 1 つも含まなかったときの逃げ道。 */
const FALLBACK_USERNAME_BASE = "user";

/**
 * メールアドレスのローカル部から username の素を作る。純粋関数。
 *
 * Google のプロフィールには username が無いため、初回サインイン時に
 * ここで補う。signup の regex（半角英数字・アンダースコア・ハイフン）に
 * 通る形にしないと、後からフォームで編集できない名前ができてしまう。
 * 使えない文字の並びはハイフン 1 つに畳み、前後のハイフンは落とす。
 */
export const usernameBaseFromEmail = (email: string): string => {
  const localPart = normalizeUsername(email).split("@")[0] ?? "";
  const cleaned = localPart
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  const base = cleaned === "" ? FALLBACK_USERNAME_BASE : cleaned;
  return base.slice(0, MAX_USERNAME_LENGTH);
};

/**
 * 衝突したときに順に試す候補列。先頭は素そのもので、以降は連番を足す。
 * 連番を足す分だけ素を削るので、どの候補も MAX_USERNAME_LENGTH を超えない。
 */
export const usernameCandidates = (base: string): string[] => {
  const safeBase = base === "" ? FALLBACK_USERNAME_BASE : base;
  const candidates = [safeBase.slice(0, MAX_USERNAME_LENGTH)];

  for (let n = 2; n <= USERNAME_CANDIDATE_LIMIT; n++) {
    const suffix = String(n);
    candidates.push(
      `${safeBase.slice(0, MAX_USERNAME_LENGTH - suffix.length)}${suffix}`,
    );
  }

  return candidates;
};
