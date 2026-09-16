-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "resultConfig" JSONB NOT NULL DEFAULT '{"version":1,"winReason":{"enabled":false,"options":["一本勝ち","判定勝ち","反則負け","棄権"]},"score":{"enabled":false,"count":3,"aggregation":"sum"},"note":{"enabled":false}}';
