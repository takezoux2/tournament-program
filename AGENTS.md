<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# instruction for superpowers

During implementation, use a sub-agent and create a worktree to proceed with the implementation.

# package manager

Use "pnpm" for package management (install, add, scripts) in this project.


# ローカル実行時のテスト

BYPASS_AUTH=1 を設定している場合、CookieにUSER_IDを設定してテストする。
その際のUSER_IDは、`1`を使用する。
