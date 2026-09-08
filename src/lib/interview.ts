import type { IndustryId, InterviewQuestion, InterviewState, Scope } from "./types";

type Q = { id: string; prompt: string; promptAr: string; industries?: IndustryId[] };

const BANK: Q[] = [
  {
    id: "recurring",
    industries: ["sales", "retail", "finance"],
    prompt: "What share of revenue is recurring or repeat, and how do you know?",
    promptAr: "ما نسبة الإيراد المتكرر، وكيف تعرفون ذلك؟",
  },
  {
    id: "constraint",
    industries: ["manufacturing", "operations", "supply_chain"],
    prompt: "Which operational constraint most affects output or quality right now?",
    promptAr: "أي قيد تشغيلي يؤثر أكثر على الإنتاج أو الجودة الآن؟",
  },
  {
    id: "workforce",
    industries: ["hr", "training"],
    prompt: "Which workforce outcomes are currently strategic — retention, capability, hiring quality, or something else?",
    promptAr: "أي نتائج للقوى العاملة استراتيجية الآن — الاحتفاظ، القدرة، جودة التوظيف، أم شيء آخر؟",
  },
  {
    id: "learner",
    industries: ["education", "training"],
    prompt: "Which learner outcomes actually matter, and how are they authenticated today?",
    promptAr: "أي نتائج للمتعلمين تهم فعلاً، وكيف تُثبت اليوم؟",
  },
  {
    id: "decision",
    prompt: "What is the most important decision leadership cannot currently make with the measures you have?",
    promptAr: "ما أهم قرار لا تستطيع القيادة اتخاذه بالمقاييس الحالية؟",
  },
  {
    id: "behaviour",
    prompt: "Where have people already gamed a number, or been tempted to?",
    promptAr: "أين تلاعب الناس برقم، أو أين يغريهم ذلك؟",
  },
  {
    id: "data",
    prompt: "Which of these numbers can you actually produce from a system this month — not a slide?",
    promptAr: "أي من هذه الأرقام يمكنكم استخراجه من نظام هذا الشهر — لا من شريحة؟",
  },
  {
    id: "owner",
    prompt: "Who will lose sleep if a measure is red — a named role, not a committee?",
    promptAr: "من سيفقد النوم إذا احمرّ مقياس — دور مسمّى لا لجنة؟",
  },
  {
    id: "volume",
    industries: ["sales", "retail", "customer_service"],
    prompt: "If you could keep only three measures, which volume metric would you drop first, and why?",
    promptAr: "إذا احتفظتم بثلاثة مقاييس فقط، أي مقياس حجم ستسقطونه أولاً ولماذا؟",
  },
  {
    id: "safety",
    industries: ["manufacturing", "operations"],
    prompt: "Is safety or quality allowed to stop a productivity target, in practice?",
    promptAr: "هل يُسمح للجودة أو السلامة بإيقاف مستهدف إنتاجية، فعلاً لا نظرياً؟",
  },
];

export function firstInterviewRound(opts: {
  industry: IndustryId | string;
  scope: Scope;
  hasExisting: boolean;
}): InterviewQuestion[] {
  const industry = opts.industry as IndustryId;
  const picks: Q[] = [];
  for (const q of BANK) {
    if (q.industries && !q.industries.includes(industry)) continue;
    picks.push(q);
    if (picks.length >= 2) break;
  }
  const generic = BANK.filter((q) => !q.industries && !picks.some((p) => p.id === q.id));
  while (picks.length < 3 && generic.length) picks.push(generic.shift()!);
  if (opts.hasExisting && !picks.some((p) => p.id === "behaviour")) {
    const b = BANK.find((q) => q.id === "behaviour");
    if (b) picks[2] = b;
  }
  return picks.slice(0, 3).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    promptAr: q.promptAr,
    answer: "",
  }));
}

export function emptyInterview(facts: Record<string, string>): InterviewState {
  return {
    round: 0,
    facts,
    assumptions: [],
    missing: [],
    questions: [],
    done: false,
  };
}

export function harvestFacts(state: InterviewState): InterviewState {
  const facts = { ...state.facts };
  const missing: string[] = [];
  const skipNotes = state.assumptions.filter((a) => a.startsWith("Skipped:"));
  for (const q of state.questions) {
    if (q.skipped) {
      const note = `Skipped: ${q.prompt}`;
      if (!skipNotes.includes(note)) skipNotes.push(note);
      continue;
    }
    const a = q.answer.trim();
    if (a) facts[q.id] = a;
    else missing.push(q.prompt);
  }
  const assumptions: string[] = [...skipNotes];
  if (!facts.recurring) assumptions.push("Recurring vs one-off mix is unknown — targets will not use a retention benchmark.");
  if (!facts.data) assumptions.push("Data availability is incomplete — several KPIs will be marked measurement-risk.");
  if (!facts.owner) assumptions.push("Named owners were not all confirmed — ownership risk remains.");
  return { ...state, facts, missing, assumptions, done: state.done };
}
