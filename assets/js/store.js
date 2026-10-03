/* =====================================================================
   Dados — conexão com o Supabase, estado local e cálculos de saldo.

   Modelo (v2): tudo é "título" (algo a pagar ou a receber):
     aberto    → ainda vai acontecer; NÃO mexe no saldo real
     pago      → aconteceu em pago_em; entra no saldo real
     cancelado → pulado; não conta e não é gerado de novo
   Saldo real     = saldo inicial das contas + títulos pagos
   Saldo previsto = saldo real + títulos abertos até uma data
   ===================================================================== */
"use strict";

const CFG_KEY = "cf2_cfg";
let db = null;
let ocupado = false;

const _hoje = new Date();
const state = {
  ano: _hoje.getFullYear(), mes: _hoje.getMonth(),
  view: "hoje",
  pessoa: "",            // filtro da tela "Hoje"
  contas: [], recorrencias: [], titulos: [], metas: []
};

/* ---------------- conexão ---------------- */
function getCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }catch(e){ return {}; } }

function credenciais(){
  if(typeof SUPA_URL !== "undefined" && typeof SUPA_KEY !== "undefined" &&
     SUPA_URL && SUPA_KEY && !/SEU-PROJETO|SUA_CHAVE/.test(SUPA_URL+SUPA_KEY)) return {url:SUPA_URL, key:SUPA_KEY};
  const c = getCfg();
  return (c.url && c.key) ? c : null;
}

function conectar(url, key, salvar){
  try{
    db = window.supabase.createClient(url, key);
    if(salvar){ try{ localStorage.setItem(CFG_KEY, JSON.stringify({url,key})); }catch(e){} }
    return true;
  }catch(e){ toast("Falha ao conectar: "+e.message, "erro"); return false; }
}

/* ---------------- carga ---------------- */
async function lerTudo(tabela){
  let out = [], de = 0;
  for(;;){
    const {data, error} = await db.from(tabela).select("*").order("id").range(de, de+999);
    if(error) throw error;
    out = out.concat(data);
    if(data.length < 1000) return out;
    de += 1000;
  }
}

const num = v => (v==null ? null : Number(v));
const normTitulo = x => ({...x, valor:Number(x.valor), valor_pago:num(x.valor_pago)});
const normConta  = x => ({...x, saldo_inicial:Number(x.saldo_inicial)});
const normRec    = x => ({...x, valor:Number(x.valor)});

async function carregar(){
  const [c, r, t, m] = await Promise.all([lerTudo("contas"), lerTudo("recorrencias"), lerTudo("titulos"), lerTudo("orcamentos")]);
  state.contas = c.map(normConta);
  state.recorrencias = r.map(normRec);
  state.titulos = t.map(normTitulo);
  state.metas = m.map(x=>({...x, limite:Number(x.limite)}));
}

/** Executa uma gravação com trava anti-duplo-clique e aviso de erro. */
async function seguro(fn, msgErro){
  if(ocupado) return false;
  ocupado = true;
  try{ await fn(); return true; }
  catch(e){ toast((msgErro||"Erro")+": "+(e.message||e), "erro"); return false; }
  finally{ ocupado = false; }
}

/* ---------------- títulos: gravações ---------------- */
async function inserirTitulos(rows){
  const {data, error} = await db.from("titulos").insert(rows).select();
  if(error) throw error;
  const novos = data.map(normTitulo);
  state.titulos.push(...novos);
  return novos;
}

async function atualizarTitulos(ids, patch){
  const {error} = await db.from("titulos").update(patch).in("id", ids);
  if(error) throw error;
  state.titulos.forEach(t=>{ if(ids.includes(t.id)) Object.assign(t, patch); });
}

async function excluirTitulos(ids){
  const {error} = await db.from("titulos").delete().in("id", ids);
  if(error) throw error;
  state.titulos = state.titulos.filter(t=>!ids.includes(t.id));
}

/** Dá baixa: o título passa a contar no saldo real, na data informada. */
async function baixarTitulo(id, data, valorPago){
  const t = tituloPorId(id);
  await atualizarTitulos([id], {status:"pago", pago_em:data, valor_pago: valorPago!=null ? valorPago : t.valor});
}
async function reabrirTitulo(id){ await atualizarTitulos([id], {status:"aberto", pago_em:null, valor_pago:null}); }

const tituloPorId = id => state.titulos.find(t=>t.id===id);
const contaPorId  = id => state.contas.find(c=>c.id===id);

/* ---------------- cálculos ---------------- */
const valorEf = t => (t.status==="pago" && t.valor_pago!=null) ? t.valor_pago : t.valor;
const movimento = t => sinal(t.tipo) * valorEf(t);

function saldoInicialTotal(){
  return soma(state.contas.filter(c=>c.tipo!=="cartao"), c=>c.saldo_inicial);
}

/** Saldo real: o que já foi pago/recebido até a data (inclusive). */
function saldoEm(data){
  return arred(saldoInicialTotal() + soma(state.titulos.filter(t=>t.status==="pago" && t.pago_em<=data), movimento));
}

/** Saldo previsto: o real mais tudo que está em aberto com vencimento até a data. */
function previstoEm(data){
  return arred(saldoEm(data) + soma(state.titulos.filter(t=>t.status==="aberto" && t.vencimento<=data), movimento));
}

/** Saldo atual de uma conta (corrente/dinheiro) — pagos dela, até hoje. */
function saldoDaConta(c){
  const h = hojeISO();
  return arred((c.tipo==="cartao" ? 0 : c.saldo_inicial) + soma(state.titulos.filter(t=>t.conta_id===c.id && t.status==="pago" && t.pago_em<=h), movimento));
}

/**
 * Linha do tempo de um mês: parte do saldo previsto no início do mês
 * (real + tudo que ficou em aberto antes dele) e aplica, dia a dia, o que
 * foi pago (na data da baixa) e o que ainda vai vencer.
 */
function timelineMes(ano, mes){
  const ini = iniMes(ano,mes), fim = fimMes(ano,mes);
  const atrasados = state.titulos.filter(t=>t.status==="aberto" && t.vencimento<ini);
  const b0 = arred(saldoEm(diaAnterior(ini)) + soma(atrasados, movimento));
  const eventos = [];
  state.titulos.forEach(t=>{
    if(t.status==="pago" && t.pago_em>=ini && t.pago_em<=fim) eventos.push({t, data:t.pago_em});
    else if(t.status==="aberto" && t.vencimento>=ini && t.vencimento<=fim) eventos.push({t, data:t.vencimento});
  });
  eventos.sort((a,b)=> a.data<b.data?-1 : a.data>b.data?1 : (a.t.tipo===b.t.tipo ? a.t.descricao.localeCompare(b.t.descricao) : (a.t.tipo==="entrada"?-1:1)));
  const dias = [];
  let saldo = b0, entradas = 0, saidas = 0, menor = {valor:b0, data:null};
  eventos.forEach(e=>{
    let d = dias[dias.length-1];
    if(!d || d.data!==e.data){ d = {data:e.data, itens:[], delta:0, saldo:0}; dias.push(d); }
    d.itens.push(e.t);
    const v = movimento(e.t);
    d.delta += v; saldo += v;
    if(e.t.tipo==="entrada") entradas += valorEf(e.t); else saidas += valorEf(e.t);
    d.saldo = arred(saldo);
    if(saldo < menor.valor){ menor = {valor:arred(saldo), data:e.data}; }
  });
  return {ano, mes, ini, fim, b0, dias, entradas:arred(entradas), saidas:arred(saidas), menor, final:arred(saldo),
          atrasadosQtd:atrasados.length, atrasadosTotal:arred(soma(atrasados, movimento))};
}

/** Pessoas e categorias já usadas (para autocompletar). */
function valoresUsados(campo){
  const s = new Set();
  state.titulos.forEach(t=>{ if(t[campo]) s.add(t[campo]); });
  state.recorrencias.forEach(r=>{ if(r[campo]) s.add(r[campo]); });
  return [...s].sort((a,b)=>a.localeCompare(b));
}
