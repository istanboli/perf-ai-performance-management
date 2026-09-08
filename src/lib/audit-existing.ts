import { CATALOG } from "./catalog";
import { detectGaming, isWeakKpiName } from "./kpi-engine";

export type AuditAction = "keep" | "improve" | "replace" | "remove" | "add";

export interface AuditItem {
  name: string;
  action: AuditAction;
  reason: string;
  suggestion?: string;
}

const VANITY = /\b(likes|followers|impressions|page views|emails sent|hours worked|meetings held|lines of code|story points)\b/i;
const VOLUME = /\b(number of|count of|# of|revenue only|sales volume)\b/i;

export function parseKpiList(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
  if (lines.length === 1 && raw.includes(",")) {
    const header = lines[0].toLowerCase();
    if (header.includes("name")) return [];
  }
  return lines;
}

export function parseCsvKpis(text: string): string[] {
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length) return [];
  const header = rows[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const nameIdx = header.findIndex((h) => ["name", "kpi", "kpi name", "metric", "indicator"].includes(h));
  if (nameIdx < 0) {
    return rows.map((r) => r.split(",")[0]?.replace(/^"|"$/g, "").trim()).filter(Boolean);
  }
  return rows
    .slice(1)
    .map((r) => r.split(",")[nameIdx]?.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

export function auditExisting(names: string[]): { items: AuditItem[]; adds: AuditItem[] } {
  const seen = new Set<string>();
  const items: AuditItem[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      items.push({ name, action: "remove", reason: "Duplicate of another measure already in the list." });
      continue;
    }
    seen.add(key);
    if (isWeakKpiName(name)) {
      items.push({ name, action: "remove", reason: "This is not a good KPI — it has no meaning as named." });
      continue;
    }
    if (VANITY.test(name)) {
      items.push({
        name,
        action: "remove",
        reason: "Vanity metric. It does not change a management decision.",
        suggestion: "Replace with an outcome the team can influence and a customer or quality guardrail.",
      });
      continue;
    }
    const gaming = detectGaming({ name, definition: name, purpose: name });
    if (VOLUME.test(name) || gaming.severity === "high") {
      items.push({
        name,
        action: "improve",
        reason: `${gaming.risk}. ${gaming.why}`,
        suggestion: gaming.guardrail,
      });
      continue;
    }
    const catalogHit = CATALOG.find((c) => c.name.toLowerCase() === key || name.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]));
    if (catalogHit) {
      items.push({
        name,
        action: "keep",
        reason: `Recognisable measure. Keep, but complete definition, owner, formula and source before approval. Template: ${catalogHit.name}.`,
      });
      continue;
    }
    items.push({
      name,
      action: "improve",
      reason: "Name only. Missing definition, owner, formula, source and target — it cannot be approved as specified.",
    });
  }

  const hasQuality = names.some((n) => /margin|quality|yield|nps|csat|retention|safety|mastery/i.test(n));
  const hasRevenue = names.some((n) => /revenue|sales|gmv/i.test(n));
  const adds: AuditItem[] = [];
  if (hasRevenue && !hasQuality) {
    adds.push({
      name: "Gross margin %",
      action: "add",
      reason: "Revenue-only systems create discounting and poor-fit volume. Add a margin guardrail.",
    });
  }
  if (names.length > 25) {
    items.push({
      name: "System size",
      action: "remove",
      reason: `This list has ${names.length} items. More KPIs is not better performance management. Cut to a handful of decision-grade measures.`,
    });
  }
  return { items, adds };
}
