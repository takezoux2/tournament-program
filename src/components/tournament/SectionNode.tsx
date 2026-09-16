import type { NodeProps } from "@xyflow/react";
import type { SectionFlowNode } from "@/features/bracket/to-flow-elements";

/** ダブルエリミネーションの「勝者側」「敗者側」「決勝」の見出し。 */
export function SectionNode({ data }: NodeProps<SectionFlowNode>) {
  return (
    <div className="whitespace-nowrap text-sm font-bold text-slate-500">
      {data.label}
    </div>
  );
}
