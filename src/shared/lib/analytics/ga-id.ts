/**
 * GA4 の測定 ID。未設定・空文字なら null（＝一切計測しない）。
 *
 * NEXT_PUBLIC_* はビルド時に文字列リテラルへ静的置換される。
 * process.env[key] のような動的アクセスは置換されず本番で undefined に
 * なるため、この式は必ず直書きのままにすること。
 */
export const gaMeasurementId = (): string | null => {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  return id !== undefined && id !== "" ? id : null;
};
