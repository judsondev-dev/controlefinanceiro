/* =====================================================================
   Utilitários — formatação e datas. Todas as datas do app são strings
   ISO "AAAA-MM-DD" (comparáveis como texto), sem fuso horário.
   ===================================================================== */
"use strict";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function fmt(v){ return Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function escapeHtml(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
const pad2 = n => String(n).padStart(2,"0");

/** Quantidade de dias de um mês (mes: 0-11). */
function diasNoMes(ano,mes){ return new Date(ano, mes+1, 0).getDate(); }

/** Monta "AAAA-MM-DD"; o dia é limitado ao último dia do mês (31 → 30/28). */
function iso(ano,mes,dia){
  const alvo = new Date(ano, mes, 1);                       // normaliza mes fora de 0-11
  const a = alvo.getFullYear(), m = alvo.getMonth();
  return a+"-"+pad2(m+1)+"-"+pad2(Math.min(Math.max(dia||1,1), diasNoMes(a,m)));
}

/** "AAAA-MM-DD" → {ano, mes(0-11), dia}. */
function partes(d){ const [a,m,x]=d.split("-").map(Number); return {ano:a, mes:m-1, dia:x}; }

function hojeISO(){ const d=new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); }
function iniMes(ano,mes){ return iso(ano,mes,1); }
function fimMes(ano,mes){ return iso(ano,mes,31); }
function somaMeses(ano,mes,n){ const d=new Date(ano,mes+n,1); return {ano:d.getFullYear(), mes:d.getMonth()}; }
function diaAnterior(d){ const p=partes(d); const x=new Date(p.ano,p.mes,p.dia-1); return iso(x.getFullYear(),x.getMonth(),x.getDate()); }
function diasEntre(a,b){ return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000); }
function dataBR(d){ if(!d) return ""; const p=partes(d); return pad2(p.dia)+"/"+pad2(p.mes+1)+"/"+p.ano; }
function dataCurta(d){ const p=partes(d); return pad2(p.dia)+"/"+pad2(p.mes+1); }
function diaSemana(d){ const p=partes(d); return DIAS_SEMANA[new Date(p.ano,p.mes,p.dia).getDay()]; }
/** Mês de uma data ISO como {ano, mes}. */
function mesDe(d){ const p=partes(d); return {ano:p.ano, mes:p.mes}; }
function uuid(){ return (crypto.randomUUID ? crypto.randomUUID() : "g"+Date.now()+Math.random().toString(16).slice(2)); }
const sinal = t => t==="entrada" ? 1 : -1;
const soma = (arr, f) => arr.reduce((a,x)=>a+f(x),0);
const arred = v => Math.round(v*100)/100;
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim(); }
