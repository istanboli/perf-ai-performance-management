import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export function EmptyState({
  title,
  body,
  cta,
  to,
}: {
  title: string;
  body?: string;
  cta?: string;
  to?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[24px] border border-dashed border-border bg-card p-8">
      <h2 className="font-display text-2xl">{title}</h2>
      {body ? <p className="max-w-lg text-sm text-muted-foreground">{body}</p> : null}
      {cta && to ? (
        <Button asChild>
          <Link to={to}>{cta}</Link>
        </Button>
      ) : null}
    </div>
  );
}
