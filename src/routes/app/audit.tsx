import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { applyAuditAsProject, runAudit } from "@/lib/server/fns";
import { useT } from "@/lib/locale";
import type { AuditAction, AuditItem } from "@/lib/audit-existing";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

const ACTIONS: AuditAction[] = ["keep", "improve", "remove", "add"];

function AuditPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [name, setName] = useState("KPI audit");
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [adds, setAdds] = useState<AuditItem[]>([]);
  const [addName, setAddName] = useState("");
  const isCsv = text.includes(",") && text.toLowerCase().includes("name");
  const run = useMutation({
    mutationFn: () => runAudit({ data: { text, isCsv } }),
    onSuccess: (r) => {
      setItems(r.items);
      setAdds(r.adds);
    },
  });
  const apply = useMutation({
    mutationFn: () =>
      applyAuditAsProject({
        data: {
          name,
          text,
          isCsv,
          items: items ?? undefined,
          adds: adds.filter((a) => a.action !== "remove"),
        },
      }),
    onSuccess: (r) => {
      toast.success("Audit project created");
      navigate({ to: "/app/projects/$projectId", params: { projectId: r.projectId } });
    },
  });

  const tone = (a: AuditAction) =>
    a === "keep" ? "ok" : a === "add" ? "pine" : a === "remove" ? "danger" : a === "replace" ? "warn" : "info";

  function setAction(list: "items" | "adds", index: number, action: AuditAction) {
    if (list === "items") setItems((prev) => (prev ?? []).map((it, i) => (i === index ? { ...it, action } : it)));
    else setAdds((prev) => prev.map((it, i) => (i === index ? { ...it, action } : it)));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">{t("audit.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("audit.sub")}</p>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea
        className="min-h-48"
        placeholder={"Revenue\nNumber of tasks completed\nNPS\nHours worked\nCustomer retention"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <input
        type="file"
        accept=".csv,.txt"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setText(await f.text());
        }}
      />
      <div className="flex gap-2">
        <Button onClick={() => run.mutate()} disabled={!text.trim()}>
          {t("audit.run")}
        </Button>
        <Button variant="outline" onClick={() => apply.mutate()} disabled={!text.trim()}>
          {t("audit.create")}
        </Button>
      </div>
      {items ? (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={`i-${i}`} className="rounded-[16px] border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <div className="flex items-center gap-2">
                  <NativeSelect
                    className="h-9 w-36"
                    value={item.action}
                    onChange={(e) => setAction("items", i, e.target.value as AuditAction)}
                  >
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {t(`audit.${a}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Badge tone={tone(item.action)}>{t(`audit.${item.action}`)}</Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
              {item.suggestion ? <p className="mt-1 text-xs">{item.suggestion}</p> : null}
            </li>
          ))}
          {adds.map((item, i) => (
            <li key={`a-${i}`} className="rounded-[16px] border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <NativeSelect
                  className="h-9 w-36"
                  value={item.action}
                  onChange={(e) => setAction("adds", i, e.target.value as AuditAction)}
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {t(`audit.${a}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
            </li>
          ))}
          <li className="flex flex-wrap gap-2 rounded-[16px] border border-dashed border-border p-4">
            <Input
              className="max-w-xs"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={t("audit.add")}
            />
            <Button
              variant="outline"
              onClick={() => {
                if (!addName.trim()) return;
                setAdds((prev) => [
                  ...prev,
                  { name: addName.trim(), action: "add", reason: "Added by the user during audit." },
                ]);
                setAddName("");
              }}
            >
              {t("audit.add")}
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
