import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LangToggle } from "@/components/lang-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { INDUSTRIES, SIZE_BANDS } from "@/lib/types";
import { bootstrapWorkspace, createOrgUnit, deleteOrgUnit, listAuditLogs, listOrgUnits, updateOrganization } from "@/lib/server/fns";
import { useT } from "@/lib/locale";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, locale } = useT();
  const qc = useQueryClient();
  const boot = useQuery({ queryKey: ["ws"], queryFn: () => bootstrapWorkspace() });
  const logs = useQuery({ queryKey: ["logs"], queryFn: () => listAuditLogs() });
  const units = useQuery({ queryKey: ["org-units"], queryFn: () => listOrgUnits() });
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [sizeBand, setSizeBand] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitKind, setUnitKind] = useState("department");
  const [unitParent, setUnitParent] = useState("");

  useEffect(() => {
    if (!boot.data?.org) return;
    setName(boot.data.org.name);
    setIndustry(boot.data.org.industry ?? "");
    setSizeBand(boot.data.org.sizeBand ?? "");
  }, [boot.data]);

  const save = useMutation({
    mutationFn: () => updateOrganization({ data: { name, industry, sizeBand } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      qc.invalidateQueries({ queryKey: ["ws"] });
    },
  });
  const addUnit = useMutation({
    mutationFn: () => createOrgUnit({ data: { name: unitName, kind: unitKind, parentId: unitParent || null } }),
    onSuccess: () => {
      toast.success(t("ok.saved"));
      setUnitName("");
      qc.invalidateQueries({ queryKey: ["org-units"] });
    },
  });
  const delUnit = useMutation({
    mutationFn: (id: string) => deleteOrgUnit({ data: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-units"] }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-4xl">{t("set.title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("set.workspace")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>{t("wiz.orgName")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Label>{t("wiz.industry")}</Label>
          <NativeSelect value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">—</option>
            {INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {locale === "ar" ? i.ar : i.en}
              </option>
            ))}
          </NativeSelect>
          <Label>{t("wiz.size")}</Label>
          <NativeSelect value={sizeBand} onChange={(e) => setSizeBand(e.target.value)}>
            <option value="">—</option>
            {SIZE_BANDS.map((s) => (
              <option key={s.id} value={s.id}>
                {locale === "ar" ? s.ar : s.en}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => save.mutate()}>{t("kpi.save")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("set.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LangToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("set.org")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("set.orgNote")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder={t("okr.title")} />
            <NativeSelect value={unitKind} onChange={(e) => setUnitKind(e.target.value)}>
              <option value="company">company</option>
              <option value="department">department</option>
              <option value="team">team</option>
              <option value="role">role</option>
              <option value="employee">employee</option>
            </NativeSelect>
            <NativeSelect value={unitParent} onChange={(e) => setUnitParent(e.target.value)}>
              <option value="">{t("okr.none")}</option>
              {(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.kind} · {u.name}
                </option>
              ))}
            </NativeSelect>
            <Button disabled={!unitName.trim() || addUnit.isPending} onClick={() => addUnit.mutate()}>
              {t("set.orgAdd")}
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {(units.data ?? []).map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-[12px] border border-border px-3 py-2">
                <span>
                  {u.kind} · {u.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => delUnit.mutate(u.id)}>
                  {t("okr.delete")}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("set.plan")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{t("set.planNote")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Free", "$0"],
              ["Pro", "$9.99/mo"],
              ["Business", "$29.99/mo"],
              ["Enterprise", "$79.99+/mo"],
            ].map(([n, p]) => (
              <div key={n} className="rounded-[16px] border border-border px-4 py-3">
                <div className="font-medium">{n}</div>
                <div className="text-muted-foreground">{p}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("set.integrations")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>{t("set.manual")}</span>
            <Badge tone="ok">Ready</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("set.csv")}</span>
            <Badge tone="ok">Ready</Badge>
          </div>
          {["REST API", "Webhooks", "Google Sheets", "Odoo", "SAP", "Salesforce"].map((n) => (
            <div key={n} className="flex items-center justify-between">
              <span>{n}</span>
              <Badge>{t("set.coming")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 font-display text-2xl">Audit log</h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {(logs.data ?? []).slice(0, 20).map((l) => (
            <li key={l.id}>
              {l.createdAt.slice(0, 19).replace("T", " ")} · {l.action}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
