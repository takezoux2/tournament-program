import { z } from "zod";

// Better Auth のサーバー設定とクライアント側の Zod スキーマが同じ境界を使うための定数。
// どちらか一方だけを変えると、UI が通した値をサーバーが弾く不整合が起きる。
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * 新しく設定するパスワードの規則。変更（change-password）と設定（set-password）は
 * 同列のスライスで互いに import できないため、規則そのものは shared に 1 つだけ持つ。
 * 2 か所に書くと「設定では通るのに変更で弾かれる」ずれが起きる。
 *
 * 既存パスワードの検証には使わない。ポリシーを変える前に登録した短い
 * パスワードの人が、変更操作そのものをできなくなってしまう。
 */
export const newPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください`,
  );
