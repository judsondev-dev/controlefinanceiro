/* =====================================================================
   Utilitários — constantes, formatação de valores/datas e helpers puros.
   ===================================================================== */
"use strict";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

/** Formata um número como moeda brasileira. */
function fmt(v){ return Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }

/** Quantidade de dias de um mês (mes: 0-11). */
function diasNoMes(ano,mes){ return new Date(ano, mes+1, 0).getDate(); }

/** Chave "ano-mes" usada no mapa de saldos iniciais. */
function chave(a,m){ return a+"-"+m; }

/** Chave "recorrenteId|ano|mes" usada no mapa de personalizações. */
function ovKey(rid,ano,mes){ return rid+"|"+ano+"|"+mes; }

/** Escapa HTML para inserção segura via innerHTML. */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

/** Categoria de um item, com rótulo padrão quando vazia. */
function catDe(i){ return (i.categoria && i.categoria.trim()) ? i.categoria.trim() : "(sem categoria)"; }
