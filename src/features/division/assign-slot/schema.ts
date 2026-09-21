import type { AddEntryInput } from "../add-entry/schema";
import type { SlotTarget } from "../first-round-schema";

/**
 * どのスロットに、誰を置くか。誰の部分は add-entry と同じ二択
 * （既存 Member / 新規登録）なので addEntrySchema をそのまま使い、
 * handler が slotTargetSchema と別々に検証して組み合わせる。
 */
export type AssignSlotInput = SlotTarget & { member: AddEntryInput };
