create extension if not exists "pgcrypto";

create table if not exists public.cadence_prospect (
  id uuid not null default gen_random_uuid(),
  nome text null,
  dia_offset integer null,
  tipo_acao text null,
  mensagem_template text null,
  constraint cadence_prospect_pkey primary key (id)
);

create table if not exists public.lead_cadence_prospect (
  id uuid not null default gen_random_uuid(),
  lead_id uuid null,
  cadence_id uuid null,
  step_atual integer null default 0,
  proxima_execucao timestamp without time zone null,
  status text null default 'ativo'::text,
  constraint lead_cadence_prospect_pkey primary key (id),
  constraint lead_cadence_prospect_lead_id_fkey foreign key (lead_id) references leads_prospect (id) on delete cascade,
  constraint lead_cadence_prospect_cadence_id_fkey foreign key (cadence_id) references cadence_prospect (id)
);
