-- Seed: member.* 権限を追加する。shared/authz/ability.ts の PERMISSION_CODES と対応させる。
INSERT INTO "Permission" ("code", "description") VALUES
  ('member.view', '組織メンバーの閲覧'),
  ('member.add', '組織メンバーの追加'),
  ('member.remove', '組織メンバーの削除');

-- 既存の所属ユーザー全員に新権限を付与する（新機能で誰もアクセスできない状態を防ぐ。
-- role 撤廃時の migration と同じ方針）
INSERT INTO "OrganizationUserPermission" ("organizationId", "userId", "permissionId")
SELECT ou."organizationId", ou."userId", p."id"
FROM "OrganizationUser" AS ou
CROSS JOIN "Permission" AS p
WHERE p."code" IN ('member.view', 'member.add', 'member.remove');
