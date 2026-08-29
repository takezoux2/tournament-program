import type { Participant } from "../types";

/** シード順に並べた 12 名。id の数字はシード番号と一致させている。 */
export const mockParticipants: Participant[] = [
  { id: "p1", name: "佐藤 蓮", seed: 1, team: "青葉クラブ" },
  { id: "p2", name: "鈴木 陽菜", seed: 2, team: "朱雀ジム" },
  { id: "p3", name: "高橋 大和", seed: 3, team: "白鷺クラブ" },
  { id: "p4", name: "田中 結衣", seed: 4, team: "黒潮スポーツ" },
  { id: "p5", name: "伊藤 湊", seed: 5, team: "青葉クラブ" },
  { id: "p6", name: "渡辺 咲良", seed: 6, team: "朱雀ジム" },
  { id: "p7", name: "山本 陽翔", seed: 7, team: "白鷺クラブ" },
  { id: "p8", name: "中村 芽依", seed: 8, team: "黒潮スポーツ" },
  { id: "p9", name: "小林 悠真", seed: 9, team: "青葉クラブ" },
  { id: "p10", name: "加藤 凛", seed: 10, team: "朱雀ジム" },
  { id: "p11", name: "吉田 颯太", seed: 11, team: "白鷺クラブ" },
  { id: "p12", name: "山田 杏", seed: 12, team: "黒潮スポーツ" },
];
