import { TournamentFlow } from "@/components/tournament/TournamentFlow";
import { layoutBracket } from "@/features/tournament/layout-bracket";
import { mockBracket } from "@/features/tournament/mock/bracket";
import { mockParticipants } from "@/features/tournament/mock/participants";
import { mockResults } from "@/features/tournament/mock/results";
import { resolveBracket } from "@/features/tournament/resolve-bracket";
import { toFlowElements } from "@/features/tournament/to-flow-elements";

export default function Home() {
  const resolved = resolveBracket(mockParticipants, mockBracket, mockResults);
  const { nodes, edges } = toFlowElements(resolved, layoutBracket(resolved));

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-bold text-slate-800">{mockBracket.name}</h1>
        <p className="text-xs text-slate-500">
          シングルエリミネーション / 参加者 {mockParticipants.length} 名
        </p>
      </header>
      <div className="flex-1">
        <TournamentFlow nodes={nodes} edges={edges} />
      </div>
    </main>
  );
}
