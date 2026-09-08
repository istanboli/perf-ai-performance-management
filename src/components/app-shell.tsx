import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  Menu,
  PenLine,
  Settings,
  Target,
  X,
} from "lucide-react";
import { useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useT } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { LangToggle } from "./lang-toggle";

const NAV = [
  { to: "/app", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/app/projects", key: "nav.projects", icon: FolderKanban },
  { to: "/app/build", key: "nav.build", icon: PenLine },
  { to: "/app/audit", key: "nav.audit", icon: ClipboardCheck },
  { to: "/app/library", key: "nav.library", icon: BookOpen },
  { to: "/app/okrs", key: "nav.okrs", icon: Target },
  { to: "/app/reviews", key: "nav.reviews", icon: Gauge },
  { to: "/app/reports", key: "nav.reports", icon: ClipboardCheck },
  { to: "/app/settings", key: "nav.settings", icon: Settings },
  { to: "/app/about", key: "nav.about", icon: BookOpen },
] as const;

export function AppShell() {
  const { t } = useT();
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const items = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = item.to === "/app" ? pathname === "/app" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-sm transition-colors",
              active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 py-6">
          <Link to="/" className="block">
            <div className="font-display text-lg leading-tight tracking-tight">KPI & OKR</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-sidebar-muted">Architect</div>
          </Link>
        </div>
        {items}
        <div className="mt-auto flex items-center justify-between gap-2 px-4 py-4">
          <LangToggle inverse />
          <div className="size-9 overflow-hidden rounded-full">
            {isPending ? <div className="size-9 animate-pulse rounded-full bg-sidebar-accent" /> : user ? <UserButton /> : null}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:hidden">
          <Link to="/app" className="font-display text-lg">
            Architect
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            {isPending ? <div className="size-9 animate-pulse rounded-full bg-muted" /> : user ? <UserButton /> : null}
            <button type="button" className="size-11 rounded-[12px] border border-border" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="mx-auto size-5" />
            </button>
          </div>
        </header>
        {open ? (
          <div className="fixed inset-0 z-50 bg-sidebar md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-display text-lg text-sidebar-foreground">Architect</span>
              <button type="button" className="size-11 text-sidebar-foreground" onClick={() => setOpen(false)} aria-label="Close">
                <X className="mx-auto size-5" />
              </button>
            </div>
            {items}
          </div>
        ) : null}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
        <footer className="px-4 py-4 text-center text-xs text-muted-foreground md:px-8">
          {t("app.creator")}
        </footer>
      </div>
    </div>
  );
}
