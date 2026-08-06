-- =====================================================================
-- Controle Financeiro — Esquema completo do banco (Supabase / PostgreSQL)
-- Uso pessoal, sem login. Cole tudo no SQL Editor do Supabase e execute.
-- Pode rodar mais de uma vez sem erro (usa IF NOT EXISTS / IF EXISTS).
-- =====================================================================

-- --------------------------------------------------------------------
-- Saldo inicial de cada mês (mes: 0 = Janeiro ... 11 = Dezembro)
-- --------------------------------------------------------------------
create table if not exists public.saldos (
  ano   integer not null,
  mes   integer not null check (mes between 0 and 11),
  valor numeric(14,2) not null default 0,
  primary key (ano, mes)
);

-- --------------------------------------------------------------------
-- Lançamentos (entradas e contas — inclui parcelas via "grupo")
-- --------------------------------------------------------------------
create table if not exists public.lancamentos (
  id         uuid primary key default gen_random_uuid(),
  grupo      text,                                   -- agrupa parcelas (null se avulso)
  ano        integer not null,
  mes        integer not null check (mes between 0 and 11),
  dia        integer not null check (dia between 1 and 31),
  tipo       text    not null check (tipo in ('entrada','saida')),
  descricao  text,
  categoria  text,
  valor      numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Contas fixas (recorrentes) — repetem todo mês
-- --------------------------------------------------------------------
create table if not exists public.recorrentes (
  id         uuid primary key default gen_random_uuid(),
  dia        integer not null check (dia between 1 and 31),
  tipo       text    not null check (tipo in ('entrada','saida')),
  descricao  text,
  categoria  text,
  valor      numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Personalização de conta fixa em um mês específico
-- (antecipar, mudar valor/dia ou pular sem afetar os demais meses)
-- --------------------------------------------------------------------
create table if not exists public.recorrentes_override (
  recorrente_id uuid not null references public.recorrentes(id) on delete cascade,
  ano   integer not null,
  mes   integer not null check (mes between 0 and 11),
  dia   integer not null check (dia between 1 and 31),
  tipo  text    not null check (tipo in ('entrada','saida')),
  descricao text,
  categoria text,
  valor numeric(14,2) not null check (valor > 0),
  pulado boolean not null default false,             -- true = conta não paga neste mês
  primary key (recorrente_id, ano, mes)
);

-- --------------------------------------------------------------------
-- Em espera (a receber / a pagar) — fora do fluxo até dar baixa.
-- Guarda a data original (venc_*) quando vem de importação de extrato,
-- e o último mês baixado (baixa_*) para os itens mensais.
-- --------------------------------------------------------------------
create table if not exists public.pendentes (
  id         uuid primary key default gen_random_uuid(),
  tipo       text    not null check (tipo in ('entrada','saida')),
  descricao  text,
  categoria  text,
  valor      numeric(14,2) not null check (valor > 0),
  venc_dia   integer check (venc_dia between 1 and 31),
  recorrente boolean not null default false,         -- mensal (volta após a baixa)
  baixa_ano  integer,
  baixa_mes  integer,
  venc_ano   integer,
  venc_mes   integer,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Metas e compromissos por categoria (valor mensal a cumprir) — usado
-- nas barras de progresso do painel "Metas e compromissos por categoria".
-- "tipo" define se a meta é de saída (ex.: limite de gasto) ou de
-- entrada (ex.: meta de investimento/aporte); o progresso soma só os
-- lançamentos da categoria com esse mesmo tipo, no mês selecionado.
-- --------------------------------------------------------------------
create table if not exists public.orcamentos (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null,
  tipo       text not null default 'saida' check (tipo in ('entrada','saida')),
  limite     numeric(14,2) not null check (limite > 0),
  created_at timestamptz not null default now()
);
-- Migração de bancos já existentes (idempotente, seguro rodar de novo):
-- remove a antiga restrição de categoria única (agora pode haver uma
-- meta de entrada e uma de saída para a mesma categoria) e garante a
-- coluna "tipo" em instalações criadas antes dela existir.
alter table public.orcamentos drop constraint if exists orcamentos_categoria_key;
alter table public.orcamentos add column if not exists tipo text not null default 'saida' check (tipo in ('entrada','saida'));

-- --------------------------------------------------------------------
-- Índices
-- --------------------------------------------------------------------
create index if not exists idx_lancamentos_periodo on public.lancamentos (ano, mes);
create index if not exists idx_lancamentos_grupo   on public.lancamentos (grupo);

-- =====================================================================
-- SEGURANÇA (RLS)
-- Uso pessoal: habilita RLS e libera acesso total pela chave anônima.
-- ATENÇÃO: quem tiver a sua URL + chave terá acesso total aos dados.
-- Para um site público de verdade, use Supabase Auth + políticas por usuário.
-- =====================================================================
alter table public.saldos               enable row level security;
alter table public.lancamentos          enable row level security;
alter table public.recorrentes          enable row level security;
alter table public.recorrentes_override enable row level security;
alter table public.pendentes            enable row level security;
alter table public.orcamentos           enable row level security;

drop policy if exists "cf_saldos_all"               on public.saldos;
drop policy if exists "cf_lancamentos_all"          on public.lancamentos;
drop policy if exists "cf_recorrentes_all"          on public.recorrentes;
drop policy if exists "cf_recorrentes_override_all" on public.recorrentes_override;
drop policy if exists "cf_pendentes_all"            on public.pendentes;
drop policy if exists "cf_orcamentos_all"           on public.orcamentos;

create policy "cf_saldos_all"               on public.saldos
  for all to anon, authenticated using (true) with check (true);
create policy "cf_lancamentos_all"          on public.lancamentos
  for all to anon, authenticated using (true) with check (true);
create policy "cf_recorrentes_all"          on public.recorrentes
  for all to anon, authenticated using (true) with check (true);
create policy "cf_recorrentes_override_all" on public.recorrentes_override
  for all to anon, authenticated using (true) with check (true);
create policy "cf_pendentes_all"            on public.pendentes
  for all to anon, authenticated using (true) with check (true);
create policy "cf_orcamentos_all"           on public.orcamentos
  for all to anon, authenticated using (true) with check (true);
