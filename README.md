# Controle Financeiro — Fluxo de Caixa

Aplicativo web de controle financeiro pessoal em formato de **fluxo de caixa diário**: você vê o saldo avançar dia a dia, considerando o que entra e o que ainda vai ser pago, para saber se o dinheiro dura até o fim do mês.

Feito em **HTML, CSS e JavaScript puro** (sem build), com dados na nuvem via **Supabase**.

## Funcionalidades

- Fluxo de caixa dia a dia com saldo acumulado e alerta de saldo negativo
- Entradas e saídas, com categorias
- Contas **fixas** (repetem todo mês), com opção de editar/pular/antecipar em um mês específico
- Compras **parceladas** (lançadas automaticamente nos meses seguintes)
- **Em espera** (a receber / a pagar): itens fora do fluxo até você dar baixa; suporta itens **mensais**
- **Importação de extrato** em CSV e OFX, com escolha do período (De/Até) a importar — útil quando o arquivo é do mês inteiro mas você só quer trazer um dia ou intervalo por vez; os itens entram como "em espera" para você classificar e lançar
- Gráfico da evolução do saldo e ranking de **maiores receitas/despesas por categoria** (clicável)
- **Projeção dos próximos meses** (6/12/24): saldo inicial, entradas, saídas, menor saldo e saldo final projetados a partir das contas fixas e parcelas já lançadas; clique numa linha para ir direto àquele mês
- **Orçamento por categoria**: defina um limite mensal de gasto por categoria, acompanhe pela barra de progresso e receba um alerta quando estourar
- **Avulso, parcelado e fixo**: veja de um lugar só quantos lançamentos do mês são únicos, parte de uma compra parcelada ou conta fixa (com total de cada); clique num item para ir até o dia dele no fluxo
- Avisos de erro em **toast** não bloqueante, com **desfazer** ao remover um lançamento ou item em espera, e aviso quando a conexão com a internet cai
- Confirmações (excluir, limpar mês, importar extrato...) em um **diálogo com o visual do app**, no lugar do pop-up padrão do navegador
- Navegação por mês, seções recolhíveis (**todas começam fechadas** — clique no título para abrir a que precisar; a escolha fica salva no navegador) e layout **responsivo** (funciona no celular)

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
