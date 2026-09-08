import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/app")({
  component: AppGate,
});

function AppGate() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-40 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <AppShell />;
}
