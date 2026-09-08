import { useT } from "@/lib/locale";
import { cn } from "@/lib/utils";

export function LangToggle({ inverse = false }: { inverse?: boolean }) {
  const { locale, setLocale } = useT();
  return (
    <div className={cn("inline-flex rounded-full border p-0.5 text-xs", inverse ? "border-sidebar-border" : "border-border")}>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded-full px-2.5 py-1",
          locale === "en"
            ? inverse
              ? "bg-sidebar-foreground text-sidebar"
              : "bg-foreground text-background"
            : inverse
              ? "text-sidebar-muted"
              : "text-muted-foreground",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "rounded-full px-2.5 py-1",
          locale === "ar"
            ? inverse
              ? "bg-sidebar-foreground text-sidebar"
              : "bg-foreground text-background"
            : inverse
              ? "text-sidebar-muted"
              : "text-muted-foreground",
        )}
      >
        عربي
      </button>
    </div>
  );
}
