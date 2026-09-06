"use client";

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL を渡さない場合、リクエスト元と同じオリジンの /api/auth が使われる。
// usernameClient は signIn.username の型を生やすためのもの。displayUsername は
// サーバ側（auth-username-plugin.ts）と揃えないと user の型がずれる。
export const authClient = createAuthClient({
  plugins: [usernameClient({ displayUsername: false })],
});
