import { z } from "zod";

/**
 * 表示名（User.name）の規則。登録（features/auth/signup）と変更
 * （features/user/update-name）の両方が使う。同列のカテゴリ同士は依存できず、
 * かつ規則が 2 か所に分かれると「登録では通るのに変更で弾かれる」ずれが
 * 起きるため、username.ts / email.ts と同じく shared に 1 つだけ持つ。
 */
export const displayNameSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z
      .string()
      .min(1, "名前を入力してください")
      .max(100, "名前は100文字以内で入力してください"),
  );
