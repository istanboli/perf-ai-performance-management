import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LangToggle } from "@/components/lang-toggle";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "/app",
  }),
  component: Login,
});

function Login() {
  const { t } = useT();
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/login" });
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
        if (res.error) throw new Error(res.error.message);
      }
      const signed = await authClient.signIn.email({ email, password });
      if (signed.error) throw new Error(signed.error.message);
      navigate({ to: next || "/app" });
    } catch {
      toast.error(t("auth.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link to="/" className="font-display text-2xl">
          KPI & OKR Architect
        </Link>
        <div>
          <p className="font-display text-4xl leading-tight">{t("app.tagline")}</p>
          <p className="mt-4 max-w-md text-sm text-sidebar-muted">{t("land.not")}</p>
        </div>
        <p className="text-xs text-sidebar-muted">{t("app.creator")}</p>
      </section>
      <section className="flex flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl">{t("auth.welcome")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("auth.sub")}</p>
            </div>
            <LangToggle />
          </div>
          {authEnabled ? (
            <>
              <div className="space-y-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => signIn(p.providerId, { callbackURL: next || "/app" })}
                  >
                    {p.providerId.includes("google") ? t("auth.google") : t("auth.x")}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("auth.or")}
                <span className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={onEmail} className="space-y-3">
                {mode === "up" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("auth.name")}</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {mode === "up" ? t("auth.create") : t("auth.continueEmail")}
                </Button>
              </form>
              <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "up" ? "in" : "up")}>
                {mode === "up" ? t("auth.have") : t("auth.need")}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
          )}
        </div>
      </section>
    </main>
  );
}
