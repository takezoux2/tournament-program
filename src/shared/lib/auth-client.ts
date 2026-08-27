"use client";

import { createAuthClient } from "better-auth/react";

// baseURL を渡さない場合、リクエスト元と同じオリジンの /api/auth が使われる。
export const authClient = createAuthClient();
