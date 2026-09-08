import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/locale";
import type { Origin } from "@/lib/types";

export function OriginBadge({ origin }: { origin: Origin }) {
  const { t } = useT();
  const tone = origin === "user" ? "ok" : origin === "assumption" ? "warn" : origin === "template" ? "info" : "pine";
  return <Badge tone={tone}>{t(`origin.${origin}`)}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const tone =
    status === "on_track" || status === "approved" || status === "active" || status === "achieved"
      ? "ok"
      : status === "at_risk" || status === "under_review" || status === "draft"
        ? "warn"
        : status === "behind" || status === "archived"
          ? "danger"
          : "neutral";
  const key = `status.${status}`;
  return <Badge tone={tone}>{t(key)}</Badge>;
}
