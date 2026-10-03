-- =====================================================================
-- Controle Financeiro v2 — contas a pagar / a receber
-- Cole no SQL Editor do Supabase e execute. Pode rodar mais de uma vez.
--
-- NÃO mexe nas tabelas antigas (lancamentos, recorrentes, pendentes...):
-- elas ficam como backup. O app v2 usa só as tabelas abaixo
-- (e continua usando "orcamentos" para as metas por categoria).
-- =====================================================================

-- --------------------------------------------------------------------
-- Contas: onde o dinheiro está (banco, dinheiro) ou de onde sai (cartão)
-- --------------------------------------------------------------------
create table if not exists public.contas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          text not null default 'corrente' check (tipo in ('corrente','cartao','dinheiro')),
  saldo_inicial numeric(14,2) not null default 0,   -- só conta para corrente/dinheiro
  ativa         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Recorrências: modelos de contas que se repetem todo mês.
-- O app gera os próximos meses como títulos de verdade (sem linhas virtuais).
-- --------------------------------------------------------------------
create table if not exists public.recorrencias (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('entrada','saida')),
  descricao  text not null,
  categoria  text,
  pessoa     text,
  conta_id   uuid references public.contas(id) on delete set null,
  valor      numeric(14,2) not null check (valor > 0),
  dia        integer not null check (dia between 1 and 31),
  inicio     date not null default current_date,   -- primeiro mês gerado
  fim        date,                                 -- último mês (null = sem fim)
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Títulos: TUDO que se paga ou recebe — um conceito só.
--   aberto    = ainda vai acontecer (não mexe no saldo real)
--   pago      = já aconteceu em "pago_em" (entra no saldo real)
--   cancelado = pulado/descartado (não conta, e não é gerado de novo)
-- --------------------------------------------------------------------
create table if not exists public.titulos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('entrada','saida')),
  descricao     text not null,
  categoria     text,
  pessoa        text,                                   -- ex.: Jackeline
  conta_id      uuid references public.contas(id) on delete set null,
  valor         numeric(14,2) not null check (valor > 0),   -- valor previsto
  vencimento    date not null,
  status        text not null default 'aberto' check (status in ('aberto','pago','cancelado')),
  pago_em       date,
  valor_pago    numeric(14,2),
  grupo         text,                                   -- agrupa as parcelas de uma compra
  parcela       integer,
  parcelas      integer,
  recorrencia_id uuid references public.recorrencias(id) on delete set null,
  competencia   date,                                   -- 1º dia do mês de origem (recorrência)
  origem        text not null default 'manual' check (origem in ('manual','importado')),
  created_at    timestamptz not null default now(),
  constraint titulos_pago_ck check (status <> 'pago' or pago_em is not null),
  constraint titulos_rec_comp_uq unique (recorrencia_id, competencia)
);
create index if not exists idx_titulos_status_venc on public.titulos (status, vencimento);
create index if not exists idx_titulos_pago_em     on public.titulos (pago_em);
create index if not exists idx_titulos_grupo       on public.titulos (grupo);

-- --------------------------------------------------------------------
-- Metas por categoria (já existe do app anterior; criada aqui só se faltar)
-- --------------------------------------------------------------------
create table if not exists public.orcamentos (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null,
  tipo       text not null default 'saida' check (tipo in ('entrada','saida')),
  limite     numeric(14,2) not null check (limite > 0),
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Segurança (RLS) — uso pessoal, acesso total pela chave anônima
-- --------------------------------------------------------------------
alter table public.contas       enable row level security;
alter table public.recorrencias enable row level security;
alter table public.titulos      enable row level security;
alter table public.orcamentos   enable row level security;

drop policy if exists "cf2_contas_all"       on public.contas;
drop policy if exists "cf2_recorrencias_all" on public.recorrencias;
drop policy if exists "cf2_titulos_all"      on public.titulos;
drop policy if exists "cf_orcamentos_all"    on public.orcamentos;

create policy "cf2_contas_all"       on public.contas       for all to anon, authenticated using (true) with check (true);
create policy "cf2_recorrencias_all" on public.recorrencias for all to anon, authenticated using (true) with check (true);
create policy "cf2_titulos_all"      on public.titulos      for all to anon, authenticated using (true) with check (true);
create policy "cf_orcamentos_all"    on public.orcamentos   for all to anon, authenticated using (true) with check (true);
