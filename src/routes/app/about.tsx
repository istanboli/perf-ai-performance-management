import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/app/about")({ component: AboutPage });

function AboutPage() {
  const { t } = useT();
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-4xl">{t("about.title")}</h1>
      <p className="text-muted-foreground">{t("about.body")}</p>
      <p className="text-sm">{t("app.tagline")}</p>
      <p className="text-sm">{t("app.creator")}</p>
    </article>
  );
}
