import {
  Handle,
  Position as HandlePosition,
  type NodeProps,
} from "@xyflow/react";
import type { MatchFlowNode } from "@/features/tournament/to-flow-elements";
import { MatchCard } from "./MatchCard";

export function MatchNode({ data }: NodeProps<MatchFlowNode>) {
  return (
    <>
      <Handle
        type="target"
        position={HandlePosition.Left}
        isConnectable={false}
        className="!bg-slate-400"
      />
      <MatchCard match={data.match} />
      <Handle
        type="source"
        position={HandlePosition.Right}
        isConnectable={false}
        className="!bg-slate-400"
      />
    </>
  );
}
