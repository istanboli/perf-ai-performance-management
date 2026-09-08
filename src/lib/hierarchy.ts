import type { ObjLevel } from "./types";

export const OBJ_LEVELS: ObjLevel[] = ["company", "department", "team", "role", "individual"];

export function wouldCreateCycle(
  objectives: { id: string; parentId: string | null }[],
  id: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  const byId = new Map(objectives.map((o) => [o.id, o]));
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}

export function parentOptions(
  objectives: { id: string; parentId: string | null; title: string }[],
  selfId?: string,
): { id: string; title: string }[] {
  return objectives.filter((o) => o.id !== selfId && (!selfId || !wouldCreateCycle(objectives, selfId, o.id)));
}
