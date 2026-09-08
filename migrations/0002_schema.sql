-- AI KPI & OKR Architect — application schema
-- All organization-owned rows carry user_id (owner) + workspace_id (tenant).

create table if not exists workspaces (
  id text primary key,
  user_id text not null,
  name text not null,
  industry text,
  size_band text,
  locale text not null default 'en',
  plan text not null default 'free',
  created_at timestamptz not null default now()
);
create index if not exists workspaces_user_id_idx on workspaces (user_id);

create table if not exists organizations (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  name text not null,
  industry text,
  size_band text,
  business_model text,
  strategic_priorities text,
  maturity_notes text,
  created_at timestamptz not null default now()
);
create index if not exists organizations_workspace_idx on organizations (workspace_id);

create table if not exists org_units (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  parent_id text,
  kind text not null,
  name text not null,
  owner_name text,
  created_at timestamptz not null default now()
);
create index if not exists org_units_workspace_idx on org_units (workspace_id);

create table if not exists projects (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  name text not null,
  scope text not null,
  mode text not null,
  industry text,
  department text,
  status text not null default 'draft',
  is_demo boolean not null default false,
  interview_state text,
  alignment_score int,
  maturity_score int,
  quality_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_workspace_idx on projects (workspace_id);
create index if not exists projects_user_idx on projects (user_id);

create table if not exists objectives (
  id text primary key,
  project_id text not null,
  workspace_id text not null,
  user_id text not null,
  parent_id text,
  level text not null,
  title text not null,
  description text,
  owner_name text,
  status text not null default 'draft',
  origin text not null default 'ai',
  created_at timestamptz not null default now()
);
create index if not exists objectives_project_idx on objectives (project_id);

create table if not exists key_results (
  id text primary key,
  objective_id text not null,
  project_id text not null,
  workspace_id text not null,
  user_id text not null,
  name text not null,
  definition text,
  baseline double precision,
  target double precision,
  unit text,
  deadline text,
  owner_name text,
  measurement_method text,
  progress double precision,
  status text not null default 'not_measured',
  related_kpi_id text,
  origin text not null default 'ai',
  created_at timestamptz not null default now()
);
create index if not exists key_results_project_idx on key_results (project_id);
create index if not exists key_results_objective_idx on key_results (objective_id);

create table if not exists kpis (
  id text primary key,
  project_id text not null,
  workspace_id text not null,
  user_id text not null,
  objective_id text,
  related_kr_id text,
  kpi_code text,
  name text not null,
  definition text,
  purpose text,
  scope text,
  owner_name text,
  responsible_team text,
  unit text,
  direction text,
  frequency text,
  review_cadence text,
  baseline double precision,
  current_value double precision,
  target double precision,
  conservative_target double precision,
  expected_target double precision,
  stretch_target double precision,
  formula text,
  numerator text,
  denominator text,
  calculation_method text,
  data_source text,
  weight double precision,
  thresholds text,
  guardrail text,
  leading_lagging text,
  result_driver text,
  efficiency_effectiveness text,
  quality_quantity text,
  parmenter_type text,
  ipoo text,
  gaming_risk text,
  gaming_severity text,
  data_quality_risk text,
  definition_ambiguity text,
  ownership_risk text,
  measurement_risk text,
  manipulation_risk text,
  quality_score int,
  quality_notes text,
  status text not null default 'draft',
  version text not null default '1.0',
  origin text not null default 'ai',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kpis_project_idx on kpis (project_id);
create index if not exists kpis_workspace_idx on kpis (workspace_id);

create table if not exists checkins (
  id text primary key,
  kpi_id text not null,
  project_id text not null,
  workspace_id text not null,
  user_id text not null,
  current_value double precision,
  target double precision,
  progress double precision,
  status text,
  comment text,
  owner_name text,
  recorded_at timestamptz not null default now()
);
create index if not exists checkins_kpi_idx on checkins (kpi_id);
create index if not exists checkins_project_idx on checkins (project_id);

create table if not exists entity_versions (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  entity_type text not null,
  entity_id text not null,
  version text not null,
  change_summary text,
  author text,
  reason text,
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists entity_versions_entity_idx on entity_versions (entity_id);

create table if not exists audit_logs (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  action text not null,
  entity_type text,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_workspace_idx on audit_logs (workspace_id);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

create table if not exists ai_interactions (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  project_id text,
  prompt_version text,
  request_kind text,
  request_payload text,
  response_payload text,
  validation_ok boolean,
  created_at timestamptz not null default now()
);
create index if not exists ai_interactions_workspace_idx on ai_interactions (workspace_id);

create table if not exists data_sources (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  name text not null,
  kind text not null,
  status text not null default 'manual',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists data_sources_workspace_idx on data_sources (workspace_id);
