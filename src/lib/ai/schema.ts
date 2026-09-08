import { z } from "zod";

export const PROMPT_VERSION = "ako-v4-2026-09";

const DirectionSchema = z
  .enum(["higher", "lower", "range", "threshold"])
  .optional()
  .catch(undefined);
const ParmenterSchema = z.enum(["KRI", "RI", "PI", "KPI"]).optional().catch(undefined);
const LevelSchema = z
  .enum(["company", "department", "team", "role", "individual"])
  .optional()
  .catch(undefined);

const QuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  promptAr: z.string().optional(),
});

const ObjectiveSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  level: LevelSchema,
  owner: z.string().optional(),
});

const KeyResultSchema = z.object({
  objectiveTitle: z.string().optional(),
  name: z.string(),
  definition: z.string().optional(),
  unit: z.string().optional(),
});

const KpiSchema = z.object({
  name: z.string().min(1),
  definition: z.string().optional(),
  purpose: z.string().optional(),
  formula: z.string().optional(),
  unit: z.string().optional(),
  direction: DirectionSchema,
  owner: z.string().optional(),
  dataSource: z.string().optional(),
  guardrail: z.string().optional(),
  relatedObjective: z.string().optional(),
  leadingLagging: z.string().optional(),
  parmenterType: ParmenterSchema,
});

const PatchSchema = z.object({
  name: z.string(),
  action: z.enum(["keep", "improve", "replace", "remove", "add"]).catch("improve"),
  reason: z.string(),
  improved: z
    .object({
      name: z.string().optional(),
      definition: z.string().optional(),
      guardrail: z.string().optional(),
      purpose: z.string().optional(),
    })
    .optional(),
});

function keepValid<T>(schema: z.ZodType<T>) {
  return (arr: unknown) => {
    if (!Array.isArray(arr)) return undefined;
    const out: T[] = [];
    for (const item of arr) {
      const parsed = schema.safeParse(item);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  };
}

export const AiSystemSchema = z.object({
  system_summary: z
    .object({
      narrative: z.string().optional(),
      challenges: z.array(z.string()).optional(),
    })
    .optional()
    .catch(undefined),
  follow_up_questions: z
    .array(z.unknown())
    .optional()
    .transform((arr) => keepValid(QuestionSchema)(arr)?.slice(0, 3)),
  interview_complete: z.boolean().optional().catch(undefined),
  assumptions: z.array(z.string()).optional().catch(undefined),
  missing_information: z.array(z.string()).optional().catch(undefined),
  recommendations: z.array(z.string()).optional().catch(undefined),
  objectives: z
    .array(z.unknown())
    .optional()
    .transform((arr) => keepValid(ObjectiveSchema)(arr)),
  key_results: z
    .array(z.unknown())
    .optional()
    .transform((arr) => keepValid(KeyResultSchema)(arr)),
  kpis: z
    .array(z.unknown())
    .optional()
    .transform((arr) => keepValid(KpiSchema)(arr)),
  modifier_explanation: z.string().optional().catch(undefined),
  kpi_patches: z
    .array(z.unknown())
    .optional()
    .transform((arr) => keepValid(PatchSchema)(arr)),
});

export type AiSystem = z.infer<typeof AiSystemSchema>;
