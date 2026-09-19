import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // server-only は import しただけで例外を投げるため、テストでは
      // RSC 向けに同梱されている空実装へ差し替える。パッケージの exports が
      // サブパスを公開していないので、実ファイルを直接指す。
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // 日時を扱うテスト（datetime-local の表示とパースの往復など）は実行環境の
    // 時刻帯で結果が変わる。開発機（JST）と CI（UTC）で挙動が分かれないよう、
    // 利用者の時刻帯である Asia/Tokyo に固定する。
    // LOG_LEVEL はテスト中の実ログを止めるため Off。ログ自体を検証する
    // テストは src/shared/testing/log-entries.ts の Layer を自前で与える
    // ので、この設定の影響を受けない。
    env: { TZ: "Asia/Tokyo", LOG_LEVEL: "Off" },
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
