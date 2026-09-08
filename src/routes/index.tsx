import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { LangToggle } from "@/components/lang-toggle";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { t } = useT();
  const { isPending } = useCurrentUserState();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <div>
          <div className="font-display text-xl leading-none">KPI & OKR</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Architect</div>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle />
          {isPending ? (
            <div className="h-11 w-24 animate-pulse rounded-[8px] bg-muted" />
          ) : (
            <>
              <SignedOut>
                <Button asChild variant="outline">
                  <Link to="/login" search={{ next: "/app" }}>
                    {t("nav.signIn")}
                  </Link>
                </Button>
              </SignedOut>
              <SignedIn>
                <Button asChild variant="outline">
                  <Link to="/app">{t("nav.dashboard")}</Link>
                </Button>
              </SignedIn>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1.2fr_0.8fr] lg:pt-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">{t("land.kicker")}</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">{t("land.hero")}</h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground">{t("land.sub")}</p>
          <p className="mt-4 text-sm font-medium">{t("land.not")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/login" search={{ next: "/app/build" }}>
                {t("land.cta1")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/login" search={{ next: "/app?demo=1" }}>
                {t("land.cta2")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login" search={{ next: "/app/audit" }}>
                {t("land.cta3")}
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("land.lifecycle")}</p>
        </div>
        <aside className="rounded-[32px] bg-sidebar p-8 text-sidebar-foreground">
          <p className="text-xs uppercase tracking-[0.2em] text-sidebar-muted">{t("app.positioning")}</p>
          <ol className="mt-8 space-y-6">
            {[
              ["01", t("land.s1t"), t("land.s1")],
              ["02", t("land.s2t"), t("land.s2")],
              ["03", t("land.s3t"), t("land.s3")],
              ["04", t("land.s4t"), t("land.s4")],
            ].map(([n, title, body]) => (
              <li key={n} className="grid grid-cols-[auto_1fr] gap-4">
                <span className="font-display text-2xl text-sidebar-muted">{n}</span>
                <div>
                  <div className="font-medium">{title}</div>
                  <p className="mt-1 text-sm text-sidebar-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-3xl">{t("land.diff")}</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[t("land.d1"), t("land.d2"), t("land.d3"), t("land.d4"), t("land.d5"), t("land.d6")].map((d) => (
              <li key={d} className="rounded-[20px] border border-border bg-background p-5 text-sm leading-relaxed">
                <ArrowUpRight className="mb-3 size-4 text-primary" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <span>{t("app.name")}</span>
        <span>{t("land.footer")}</span>
      </footer>
    </div>
  );
}
