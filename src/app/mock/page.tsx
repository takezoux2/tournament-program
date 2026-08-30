import { LogoutButton } from "@/components/auth/LogoutButton";
import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { layoutBracket } from "@/features/bracket/layout-bracket";
import { mockBracket } from "@/features/bracket/mock/bracket";
import { mockParticipants } from "@/features/bracket/mock/participants";
import { mockResults } from "@/features/bracket/mock/results";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import { toFlowElements } from "@/features/bracket/to-flow-elements";
import { requireSession } from "@/shared/middleware/require-session";

export default async function MockBracketPage() {
  const session = await requireSession();

  const resolved = resolveBracket(mockParticipants, mockBracket, mockResults);
  const { nodes, edges } = toFlowElements(resolved, layoutBracket(resolved));

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">
            {mockBracket.name}
          </h1>
          <p className="text-xs text-slate-500">
            シングルエリミネーション / 参加者 {mockParticipants.length} 名
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-700">{session.user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1">
        <TournamentFlow nodes={nodes} edges={edges} />
      </div>
    </main>
  );
}
