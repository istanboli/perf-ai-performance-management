import { cn } from "@/lib/utils";

export function ScoreRing({
  value,
  label,
  size = 96,
}: {
  value: number | null | undefined;
  label: string;
  size?: number;
}) {
  const v = value ?? 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, v)) / 100) * c;
  const tone = v >= 75 ? "text-ok" : v >= 50 ? "text-warn" : "text-danger";
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 96 96" className="tabular">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 48 48)"
          className={cn(tone)}
        />
        <text x="48" y="52" textAnchor="middle" className="fill-foreground font-sans text-lg font-medium">
          {value === null || value === undefined ? "—" : Math.round(v)}
        </text>
      </svg>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
