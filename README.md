# Controle Financeiro — Fluxo de Caixa

Aplicativo web de controle financeiro pessoal em formato de **fluxo de caixa diário**: você vê o saldo avançar dia a dia, considerando o que entra e o que ainda vai ser pago, para saber se o dinheiro dura até o fim do mês.

Feito em **HTML, CSS e JavaScript puro** (sem build), com dados na nuvem via **Supabase**.

## Funcionalidades

- Fluxo de caixa dia a dia com saldo acumulado e alerta de saldo negativo
- **💰 Saldo disponível hoje**: um número separado do saldo projetado — só desconta contas com vencimento até hoje; contas futuras continuam aparecendo no fluxo e nas projeções, mas não pesam nesse número antes da data chegar
- Entradas e saídas, com categorias
- Contas **fixas** (repetem todo mês) — cada mês elas aparecem no quadro "A receber / A pagar" aguardando confirmação (com opção de pular só aquele mês); só entram no fluxo e abatem o saldo depois de confirmadas, mas continuam entrando normalmente nas projeções (que assumem que vão acontecer). Editar/antecipar continua valendo para "todos os meses" ou "só este mês"
- Cada lançamento guarda a **origem** (manual ou importado do extrato), com uma tag "📥 importado" na tabela e na lista de "em espera" — a origem é herdada ao dar baixa, converter ou desfazer, então continua rastreável depois de virar lançamento
- Compras **parceladas**: cada parcela nasce em "em espera" (com a data prevista de cada mês) e só entra no fluxo quando confirmada individualmente — dá pra remover uma parcela só ou todas de uma vez
- **Quadro "A receber / A pagar"** (primeira tela do app): as duas listas lado a lado — itens em espera, parcelas ainda não confirmadas **e contas fixas do mês ainda não confirmadas** — cada um com a data prevista já preenchida (mas editável — nem sempre a data real bate com a prevista) e um botão para lançar direto no fluxo naquela data, sem abrir formulário; suporta itens **mensais**. Mostra só o que vence **no mês selecionado**, exceto itens sem data e os **⏰ atrasados** (de um mês anterior, ainda não resolvidos), que continuam aparecendo até serem tratados
- **Importação de extrato** em CSV e OFX, com escolha do período (De/Até) a importar e um **checkpoint** que compara com o que já está no sistema (mesma data, tipo, valor e descrição) — mostra o que é novo e o que já foi importado antes, com opção de pular os repetidos automaticamente; os itens entram como "em espera" para você classificar e lançar
- Gráfico da evolução do saldo e ranking de **maiores receitas/despesas por categoria** (clicável)
- **Projeção dos próximos meses** (6/12/24): saldo inicial, entradas, saídas, menor saldo e saldo final projetados a partir das contas fixas, parcelas já lançadas e parcelas/itens mensais ainda em espera; clique numa linha para ir direto àquele mês
- **Metas e compromissos por categoria**: defina um valor mensal a cumprir por categoria — de saída (ex.: limite de gasto) ou de entrada (ex.: "quero investir/aportar até R$ 300 no mês") — e acompanhe pela barra de progresso até atingir a meta
- **Despesas: avulso, parcelado e fixo**: veja de um lugar só quantas despesas do mês são únicas, parte de uma compra parcelada ou conta fixa (com total de cada); clique num item para ir até o dia dele no fluxo
- Avisos de erro em **toast** não bloqueante, com **desfazer** ao remover um lançamento ou item em espera, e aviso quando a conexão com a internet cai
- Confirmações (excluir, limpar mês, importar extrato...) em um **diálogo com o visual do app**, no lugar do pop-up padrão do navegador
- **Menu lateral com módulos** (Em espera, Resumo, Lançar, Análises, Fluxo diário) — só um módulo fica visível por vez, em vez de rolar uma página só com tudo junto; no celular vira um menu que abre/fecha. Dentro de cada módulo, os painéis continuam recolhíveis se quiser esconder algum
- Navegação por mês e layout **responsivo** (funciona no celular)

## Como usar

1. Abra o `index.html` no navegador (duplo clique já funciona).
2. Na primeira vez, cole a **Project URL** e a **anon/public key** do seu Supabase e clique em **Conectar** (ficam salvas no navegador).

## Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**, cole o conteúdo de [`sql/schema.sql`](sql/schema.sql) e execute (cria todas as tabelas e políticas).
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.
4. Use esses valores na tela de conexão do app.

> **Já tinha um projeto criado antes do orçamento por categoria?** Basta rodar o `sql/schema.sql` de novo — ele só cria a tabela `orcamentos` (usa `if not exists`), não afeta o que já existia.

Opcional: para o app conectar sozinho no seu computador, preencha `assets/js/config.js` com a URL e a chave. **Não faça commit desse preenchimento** — o arquivo está no `.gitignore`.

## Estrutura do projeto

```
.
├── index.html                 # marcação da página
├── sql/schema.sql             # esquema completo do banco (Supabase)
├── assets/
│   ├── css/styles.css         # estilos (tema claro, responsivo)
│   └── js/
│       ├── config.js          # credenciais (vazio no repositório)
│       ├── config.example.js  # modelo de configuração
│       ├── utils.js           # formatação, datas e helpers
│       ├── toast.js           # avisos não bloqueantes (com botão "Desfazer")
│       ├── dialog.js          # confirmação/escolha com o visual do app (substitui confirm())
│       ├── state.js           # estado da aplicação
│       ├── parsers.js         # leitura de extratos CSV/OFX
│       ├── db.js              # conexão e carga do Supabase
│       ├── projecao.js        # simulação dos próximos meses
│       ├── orcamentos.js      # orçamento mensal por categoria
│       ├── render.js          # tabela, gráfico, insights, pendentes
│       ├── actions.js         # operações que gravam no banco
│       ├── ui.js              # formulário, modal, navegação
│       └── main.js            # inicialização e eventos
└── .gitignore
```

## Deploy (GitHub Pages)

1. Suba os arquivos para o repositório.
2. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
3. Acesse em `https://SEU-USUARIO.github.io/NOME-DO-REPO/` e informe a URL/chave na tela de conexão.

## Segurança

Este projeto é de **uso pessoal, sem login**: as políticas do banco liberam acesso pela chave anônima. Quem tiver a sua URL + chave consegue ler e gravar os dados. Não publique a chave em repositório público. Para um site público com múltiplos usuários, adicione **Supabase Auth** com políticas por usuário.
