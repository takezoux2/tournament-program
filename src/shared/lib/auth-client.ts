"use client";

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { USERNAME_PLUGIN_DISPLAY_USERNAME } from "@/shared/lib/username";

// baseURL を渡さない場合、リクエスト元と同じオリジンの /api/auth が使われる。
// usernameClient は signIn.username の型を生やすためのもの。displayUsername は
// サーバ側（auth-username-plugin.ts）と揃えないと user の型がずれるため、
// 値そのものを username.ts の定数から取る。
export const authClient = createAuthClient({
  plugins: [
    usernameClient({ displayUsername: USERNAME_PLUGIN_DISPLAY_USERNAME }),
  ],
});
