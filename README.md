# Controle Financeiro — Contas a pagar e receber

Aplicativo web de finanças pessoais, em **HTML, CSS e JavaScript puro** (sem build), com dados na nuvem via **Supabase**.

A versão 2 troca o antigo "fluxo de caixa" por um modelo de **contas a pagar e a receber**: nada abate o saldo antes de acontecer.

## Como funciona (o modelo)

Tudo é um **título** — algo a pagar ou a receber:

| Status | Significado | Mexe no saldo real? |
|---|---|---|
| **aberto** | ainda vai acontecer | não |
| **pago** | aconteceu na data da baixa | sim |
| **cancelado** | pulado | não (e não é gerado de novo) |

- **Saldo real** = saldo inicial das contas + títulos pagos.
- **Saldo previsto** = saldo real + tudo o que está em aberto até uma data.
- **Contas mensais** (recorrências) geram títulos de verdade para os próximos 14 meses — sem linhas "virtuais".
- **Parcelas** são títulos independentes de um mesmo grupo (cada uma é paga na sua data).

## Telas

- **Hoje** (inicial): saldo real, *A receber × A pagar* do mês lado a lado (com os atrasados em destaque) e baixa direta com **data editável** — nem sempre o pagamento cai no dia previsto. Filtro por pessoa.
- **Agenda**: o mês dia a dia com o saldo previsto; mostra onde o dinheiro aperta antes de acontecer.
- **Contas e pessoas**: saldo de cada conta/cartão, **ajuste do saldo real** (para bater com o banco) e quanto cada pessoa deve/tem a receber.
- **Importar extrato** (CSV/OFX) com **conciliação**: ignora o que já existe, dá baixa em contas em aberto que combinam, e cria o resto já como pago.
- **Análises**: projeção de 6/12/24 meses, metas por categoria e ranking do mês.

## Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode [`sql/v2_schema.sql`](sql/v2_schema.sql).
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key** e informe na tela de conexão (ou preencha `assets/js/config.js` — que **não** vai para o Git).

### Vindo da versão antiga?

As tabelas antigas (`lancamentos`, `recorrentes`, `pendentes`…) **não são alteradas** — ficam como backup. Para trazer os dados:

```bash
node tools/migrar_v1_para_v2.js            # só mostra o plano
node tools/migrar_v1_para_v2.js --aplicar  # grava nas tabelas novas
```

Depois, em **Contas e pessoas → Ajustar saldo**, informe o saldo real do banco.

## Estrutura

```
index.html
sql/v2_schema.sql            # tabelas novas (contas, recorrencias, titulos, orcamentos)
sql/schema.sql               # esquema antigo (v1) — referência/backup
tools/migrar_v1_para_v2.js   # migração dos dados antigos
assets/css/styles.css
assets/js/
  config.js / config.example.js   # credenciais
  utils.js        # formatação e datas ISO
  store.js        # conexão, estado e cálculos de saldo/linha do tempo
  recorrencia.js  # geração das contas mensais
  form.js         # formulário de título (novo/editar, parcelas, mensal)
  actions.js      # baixar, reabrir, pular, excluir
  views-*.js      # telas: hoje, agenda, contas, importar, análises
  parsers.js      # leitura de CSV/OFX
  dialog.js toast.js
  main.js         # inicialização e navegação
```

## Segurança

Uso pessoal, **sem login**: as políticas liberam acesso pela chave anônima. Quem tiver a sua URL + chave lê e grava os dados — não publique a chave. Para múltiplos usuários, adicione Supabase Auth com políticas por usuário.
