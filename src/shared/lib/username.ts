import { z } from "zod";

/**
 * username は User テーブルで unique。大文字小文字が違うだけの 2 アカウントを
 * 登録できてしまうと検索も外れるため、保存も検索も小文字に揃える。
 * signup（features/auth）と検索（features/organization-user）の両方から使うので、
 * normalizeEmail と同じくどちらのスライスにも属さない shared に置く。
 */
export const normalizeUsername = (raw: string): string =>
  raw.trim().toLowerCase();

/**
 * username plugin の displayUsername。サーバ（auth-username-plugin.ts）と
 * クライアント（auth-client.ts）の両方が参照する。片方だけ値を変えると
 * 推論される User 型がずれるため、値そのものを 1 か所にまとめておく。
 * クライアント側の usernameClient は実行時にこの値を読まず型選択にしか
 * 使わないが、それでも揃っている必要がある。
 */
export const USERNAME_PLUGIN_DISPLAY_USERNAME = false;

/** username の長さの下限。プラグイン側の既定（3）ではなくこちらを使う。 */
export const MIN_USERNAME_LENGTH = 1;

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
      .min(MIN_USERNAME_LENGTH, "ユーザー名を入力してください")
      .max(
        MAX_USERNAME_LENGTH,
        `ユーザー名は${MAX_USERNAME_LENGTH}文字以内で入力してください`,
      )
      .regex(
        USERNAME_PATTERN,
        "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
      ),
  );

/** 衝突時に試す連番候補の数。 */
export const USERNAME_NUMBERED_CANDIDATE_LIMIT = 20;

/** 連番が尽きた後に試すランダム接尾辞つき候補の数。 */
export const USERNAME_RANDOM_CANDIDATE_LIMIT = 10;

/** ランダム接尾辞の長さ。36^6 ≒ 22 億通り。 */
export const USERNAME_RANDOM_SUFFIX_LENGTH = 6;

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

/** ランダム接尾辞の生成。差し替えられるよう型を切ってある。 */
export type RandomSuffix = () => string;

/**
 * 36 進数の乱数文字列。秘密ではなく衝突回避のための飾りなので
 * Math.random で十分（本当の保証は username の unique 制約と再試行）。
 *
 * toString(36) は "0.xxxx" の小数部が短く出ることがある（Math.random() が
 * ちょうど 0 を返すと "0" になり、小数部が丸ごと無い）。以前は届かない分を
 * while ループで足し続けていたが、その 0 のケースでは何を足しても
 * 長さが増えず、止まらない無限ループになっていた。
 * 必要な長さ + "0." の 2 文字ぶんを "0" で埋めてから切り出せば、
 * ループ無しで必ず所定の長さになる。
 */
export const randomBase36Suffix: RandomSuffix = () =>
  Math.random()
    .toString(36)
    .padEnd(USERNAME_RANDOM_SUFFIX_LENGTH + 2, "0")
    .slice(2, USERNAME_RANDOM_SUFFIX_LENGTH + 2);

/**
 * 衝突したときに順に試す候補列。先頭は素そのもので、以降は連番を足す。
 * 連番を足す分だけ素を削るので、どの候補も MAX_USERNAME_LENGTH を超えない。
 *
 * 連番が尽きた後はランダムな接尾辞つきの候補に切り替える。連番だけだと
 * info@… のような素で 20 件が埋まった時点で以降の生成が必ず失敗し、
 * mapProfileToUser は毎回のサインインで走るため、既存ユーザーまで
 * ログインできなくなる。ランダム接尾辞は同時サインインどうしが同じ
 * 候補を掴む競合もほぼ起こらなくする。
 */
export const usernameCandidates = (
  base: string,
  randomSuffix: RandomSuffix = randomBase36Suffix,
): string[] => {
  const safeBase = base === "" ? FALLBACK_USERNAME_BASE : base;
  const candidates = [safeBase.slice(0, MAX_USERNAME_LENGTH)];

  for (let n = 2; n <= USERNAME_NUMBERED_CANDIDATE_LIMIT; n++) {
    const suffix = String(n);
    candidates.push(
      `${safeBase.slice(0, MAX_USERNAME_LENGTH - suffix.length)}${suffix}`,
    );
  }

  for (let n = 0; n < USERNAME_RANDOM_CANDIDATE_LIMIT; n++) {
    const suffix = `-${randomSuffix()}`;
    candidates.push(
      `${safeBase.slice(0, MAX_USERNAME_LENGTH - suffix.length)}${suffix}`,
    );
  }

  return candidates;
};
