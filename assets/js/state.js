/* =====================================================================
   Estado da aplicação — dados carregados do Supabase e flags de UI.
   ===================================================================== */
"use strict";

/** Chaves usadas no localStorage. */
const CFG_KEY = "cf_supabase_cfg";        // credenciais salvas no navegador
const SEC_KEY = "cf_secoes_fechadas";     // seções que o usuário fechou (tudo começa aberto)
const MODULO_KEY = "cf_modulo_atual";     // último módulo visto no menu lateral

let db = null;            // cliente supabase-js
let editando = null;      // {id, rec} quando editando um lançamento
let baixando = null;      // {id} quando dando baixa em um pendente
let editandoPend = null;  // {id} quando editando um pendente (em espera)
let ocupado = false;      // trava contra clique duplo enquanto grava no Supabase
let catAtual = null, tipoAtual = null; // categoria aberta no modal
let chartInst = null;     // instância do Chart.js (reaproveitada entre renders)
let chartInstProj = null; // instância do Chart.js do painel de projeção

/** Dados do app. Espelha as tabelas do Supabase. */
let state = {
  mes: new Date().getMonth(),
  ano: new Date().getFullYear(),
  saldos: {},     // "ano-mes" -> saldo inicial
  lancamentos: [],
  recorrentes: [],
  overrides: {},  // "rid|ano|mes" -> personalização de conta fixa naquele mês
  pendentes: [],  // valores em espera (a receber/pagar), fora do fluxo até dar baixa
  orcamentos: []  // limite mensal de gasto por categoria
};

/** Saldo inicial do mês atualmente selecionado. */
function saldoInicialAtual(){ return Number(state.saldos[chave(state.ano,state.mes)] || 0); }
