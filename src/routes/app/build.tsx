import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { harvestFacts, firstInterviewRound } from "@/lib/interview";
import { INDUSTRIES, MODES, SCOPES, SIZE_BANDS, type BuildMode, type InterviewState, type Scope } from "@/lib/types";
import { createProject, generateSystem, interviewRound, updateOrganization } from "@/lib/server/fns";
import { useT } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/build")({ component: BuildWizard });

const TOTAL = 8;

function BuildWizard() {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("retail");
  const [sizeBand, setSizeBand] = useState("21-100");
  const [scope, setScope] = useState<Scope>("company");
  const [mode, setMode] = useState<BuildMode>("scratch");
  const [priorities, setPriorities] = useState("");
  const [department, setDepartment] = useState("");
  const [owner, setOwner] = useState("");
  const [dataAvail, setDataAvail] = useState<string[]>(["manual"]);
  const [existing, setExisting] = useState("");
  const [interview, setInterview] = useState<InterviewState>({
    round: 0,
    facts: {},
    assumptions: [],
    missing: [],
    questions: [],
    done: false,
  });
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [followUpTried, setFollowUpTried] = useState(false);
  const [interviewSource, setInterviewSource] = useState<"local" | "ai">("local");
  const [aiUsed, setAiUsed] = useState<boolean | null>(null);

  const label = (en: string, ar: string) => (locale === "ar" ? ar : en);

  const pendingInterview = interview.questions.filter((q) => !q.answer.trim() && !q.skipped);

  async function next() {
    if (step === 4) {
      const questions = firstInterviewRound({
        industry,
        scope,
        hasExisting: Boolean(existing.trim()),
      }).slice(0, 3);
      setInterview((s) => ({ ...s, round: 1, questions, done: false }));
      setFollowUpTried(false);
      setInterviewSource("local");
      setStep(5);
      return;
    }
    if (step === 5) {
      if (!interview.questions.length) {
        toast.error(t("wiz.mustAnswer"));
        return;
      }
      if (pendingInterview.length) {
        toast.error(t("wiz.mustAnswer"));
        return;
      }
      const harvested = harvestFacts(interview);
      if (!followUpTried) {
        setBusy(true);
        try {
          const res = await interviewRound({
            data: {
              industry,
              scope,
              hasExisting: Boolean(existing.trim()),
              interview: harvested,
              useAi: true,
            },
          });
          if (!res.complete && res.questions.length) {
            setInterview({
              ...harvested,
              round: Math.max(harvested.round, 1) + 1,
              questions: res.questions.slice(0, 3).map((q) => ({ ...q, answer: "", skipped: false })),
              done: false,
            });
            setInterviewSource(res.source);
            setFollowUpTried(true);
            return;
          }
        } catch {
          // Local bank already captured; continue to design.
        } finally {
          setBusy(false);
          setFollowUpTried(true);
        }
      }
      setInterview({ ...harvested, done: true });
      setStep(6);
      return;
    }
    if (step === 6) {
      await runGenerate();
      return;
    }
    setStep((s) => Math.min(TOTAL, s + 1));
  }

  async function runGenerate() {
    setBusy(true);
    try {
      await updateOrganization({
        data: { name: orgName || "Organisation", industry, sizeBand, priorities },
      });
      const harvested = harvestFacts({
        ...interview,
        facts: {
          ...interview.facts,
          orgName,
          industry,
          sizeBand,
          scope,
          mode,
          department,
          data: dataAvail.join(","),
        },
      });
      const project = await createProject({
        data: {
          name: orgName ? `${orgName} — ${scope}` : `System — ${industry}`,
          scope,
          mode,
          industry,
          department: department || undefined,
        },
      });
      const result = await generateSystem({
        data: {
          projectId: project.id,
          orgName: orgName || "Organisation",
          priorities,
          owner: owner || "Performance lead",
          interview: harvested,
          existingText: existing,
          useAi: true,
        },
      });
      setInterview(result.interview);
      setNotes(result.notes);
      setAiUsed(result.aiUsed);
      setStep(7);
      toast.success(result.aiUsed ? t("wiz.aiReady") : t("wiz.localReady"));
      (window as unknown as { __akoProject?: string }).__akoProject = project.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  const projectId = (typeof window !== "undefined" && (window as unknown as { __akoProject?: string }).__akoProject) || "";

  const facts = useMemo(() => Object.entries(interview.facts).filter(([, v]) => v), [interview.facts]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("wiz.step", { n: step, total: TOTAL })}</p>
        <h1 className="mt-1 font-display text-4xl">{t("wiz.title")}</h1>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(step / TOTAL) * 100}%` }} />
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.org")}</h2>
            <Field label={t("wiz.orgName")}>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
            <Field label={t("wiz.industry")}>
              <NativeSelect value={industry} onChange={(e) => setIndustry(e.target.value)}>
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>
                    {label(i.en, i.ar)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("wiz.size")}>
              <NativeSelect value={sizeBand} onChange={(e) => setSizeBand(e.target.value)}>
                {SIZE_BANDS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {label(s.en, s.ar)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.scope")}</h2>
            {SCOPES.map((s) => (
              <Choice key={s.id} active={scope === s.id} title={label(s.en, s.ar)} onClick={() => setScope(s.id)} />
            ))}
            {scope !== "company" && (
              <Field label={t("wiz.dept")}>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
              </Field>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.mode")}</h2>
            {MODES.map((m) => (
              <Choice
                key={m.id}
                active={mode === m.id}
                title={label(m.en, m.ar)}
                body={label(m.hint, m.hintAr)}
                onClick={() => setMode(m.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.strategy")}</h2>
            <p className="text-sm text-muted-foreground">{t("wiz.prioritiesHint")}</p>
            <Textarea value={priorities} onChange={(e) => setPriorities(e.target.value)} />
            <Field label={t("kpi.owner")}>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
            </Field>
            {(mode === "audit" || mode === "improve") && (
              <Field label={t("wiz.existing")}>
                <p className="mb-2 text-xs text-muted-foreground">{t("wiz.existingHint")}</p>
                <Textarea value={existing} onChange={(e) => setExisting(e.target.value)} />
              </Field>
            )}
            <div>
              <div className="mb-2 text-sm font-medium">{t("wiz.data")}</div>
              <p className="mb-3 text-xs text-muted-foreground">{t("wiz.dataHint")}</p>
              {["manual", "excel", "csv", "crm", "erp"].map((k) => (
                <label key={k} className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dataAvail.includes(k)}
                    onChange={(e) =>
                      setDataAvail((prev) => (e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)))
                    }
                  />
                  {k}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.interview")}</h2>
            <p className="text-sm text-muted-foreground">{t("wiz.interviewHint")}</p>
            <p className="text-xs text-muted-foreground">
              {interviewSource === "ai" ? t("wiz.aiFollowup") : t("wiz.localBank")}
            </p>
            {interview.questions.length === 0 ? (
              <p className="text-sm text-warn">{t("wiz.mustAnswer")}</p>
            ) : (
              interview.questions.map((q, i) => (
                <Field key={q.id} label={locale === "ar" && q.promptAr ? q.promptAr : q.prompt}>
                  <Textarea
                    value={q.skipped ? "" : q.answer}
                    disabled={q.skipped || busy}
                    placeholder={t("wiz.answer")}
                    onChange={(e) => {
                      const copy = interview.questions.slice();
                      copy[i] = { ...q, answer: e.target.value, skipped: false };
                      setInterview({ ...interview, questions: copy });
                    }}
                  />
                  <div className="mt-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const copy = interview.questions.slice();
                        copy[i] = { ...q, skipped: !q.skipped, answer: q.skipped ? q.answer : "" };
                        setInterview({ ...interview, questions: copy });
                      }}
                    >
                      {q.skipped ? t("wiz.unskip") : t("wiz.skip")}
                    </Button>
                  </div>
                </Field>
              ))
            )}
            {pendingInterview.length ? (
              <p className="text-xs text-warn">{t("wiz.mustAnswer")}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.generate")}</h2>
            <p className="text-sm text-muted-foreground">{busy ? t("wiz.generating") : t("land.s2")}</p>
            {facts.length ? (
              <div>
                <h3 className="text-sm font-medium">{t("wiz.facts")}</h3>
                <ul className="mt-2 list-disc ps-5 text-sm text-muted-foreground">
                  {facts.map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {step >= 7 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-display text-2xl">{t("wiz.quality")}</h2>
            {aiUsed === false ? (
              <p className="rounded-[12px] bg-warn/15 px-3 py-2 text-sm text-warn">{t("wiz.localGenerated")}</p>
            ) : aiUsed === true ? (
              <p className="rounded-[12px] bg-accent px-3 py-2 text-sm">{t("wiz.aiGenerated")}</p>
            ) : null}
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n} className="rounded-[12px] bg-muted px-3 py-2">
                  {n}
                </li>
              ))}
            </ul>
            {interview.assumptions.length ? (
              <div>
                <h3 className="text-sm font-medium">{t("wiz.assumptions")}</h3>
                <ul className="mt-1 list-disc ps-5 text-sm text-warn">
                  {interview.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {interview.missing.length ? (
              <div>
                <h3 className="text-sm font-medium">{t("wiz.missing")}</h3>
                <ul className="mt-1 list-disc ps-5 text-sm text-muted-foreground">
                  {interview.missing.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {projectId ? (
              <Button onClick={() => navigate({ to: "/app/projects/$projectId", params: { projectId } })}>{t("wiz.done")}</Button>
            ) : (
              <Button onClick={() => navigate({ to: "/app/projects" })}>{t("nav.projects")}</Button>
            )}
          </CardContent>
        </Card>
      )}

      {step < 7 && (
        <div className="flex justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
            {t("wiz.back")}
          </Button>
          <Button onClick={next} disabled={busy}>
            {step === 6 ? t("wiz.generate") : t("wiz.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Choice({ active, title, body, onClick }: { active: boolean; title: string; body?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[16px] border px-4 py-3 text-start",
        active ? "border-primary bg-accent" : "border-border bg-card",
      )}
    >
      <div className="font-medium">{title}</div>
      {body ? <div className="mt-1 text-xs text-muted-foreground">{body}</div> : null}
    </button>
  );
}
