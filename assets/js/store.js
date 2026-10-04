/* =====================================================================
   Dados — conexão com o Supabase, estado local e cálculos de saldo.

   Modelo (v2): tudo é "título" (algo a pagar ou a receber):
     aberto    → ainda vai acontecer; NÃO mexe no saldo real
     pago      → aconteceu em pago_em; entra no saldo real
     cancelado → pulado; não conta e não é gerado de novo
   Saldo real     = saldo inicial das contas + títulos pagos
   Saldo previsto = saldo real + títulos abertos até uma data

   Desempenho: as alterações são aplicadas na hora no estado local (a tela
   responde sem esperar a rede) e gravadas no Supabase em segundo plano,
   numa fila que preserva a ordem; se a gravação falhar, a alteração é
   desfeita e um aviso aparece. Os dados também ficam em cache no
   navegador para a próxima abertura ser instantânea.
   ===================================================================== */
"use strict";

const CFG_KEY = "cf2_cfg", CACHE_KEY = "cf2_cache";
let db = null;
let ocupado = false;

const _hoje = new Date();
const state = {
  ano: _hoje.getFullYear(), mes: _hoje.getMonth(),
  view: "hoje",
  pessoa: "",            // filtro da tela "Hoje"
  recolhido: {receber:false, pagar:false},   // colunas da tela "Hoje" (começam abertas)
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
const normMeta   = x => ({...x, limite:Number(x.limite)});

async function buscarTudo(){
  const [c, r, t, m] = await Promise.all([lerTudo("contas"), lerTudo("recorrencias"), lerTudo("titulos"), lerTudo("orcamentos")]);
  return {contas:c.map(normConta), recorrencias:r.map(normRec), titulos:t.map(normTitulo), metas:m.map(normMeta)};
}
function aplicarDados(d){ state.contas = d.contas; state.recorrencias = d.recorrencias; state.titulos = d.titulos; state.metas = d.metas; }
async function carregar(){ aplicarDados(await buscarTudo()); salvarCache(); }

/* ---------------- cache no navegador (abertura instantânea) ---------------- */
let cacheTimer = null;
function salvarCache(){
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(()=>{
    const cred = credenciais(); if(!cred) return;
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify({v:1, url:cred.url, contas:state.contas, recorrencias:state.recorrencias, titulos:state.titulos, metas:state.metas})); }catch(e){}
  }, 400);
}
function lerCache(){
  try{
    const c = JSON.parse(localStorage.getItem(CACHE_KEY)), cred = credenciais();
    if(c && c.v===1 && cred && c.url===cred.url && Array.isArray(c.titulos)) return c;
  }catch(e){}
  return null;
}

/* ---------------- fila de gravação em segundo plano ---------------- */
let fila = Promise.resolve(), pendentes = 0;
const gravando = () => pendentes > 0;

function sinalizar(){ const el = document.getElementById("sync"); if(el) el.hidden = pendentes===0; }

/** Enfileira uma gravação. Se falhar: desfaz a alteração local e avisa. */
function persistir(fn, reverter, msgErro){
  pendentes++; sinalizar();
  fila = fila.then(fn).catch(e=>{
    try{ if(reverter) reverter(); }catch(_){}
    toast((msgErro||"Erro ao salvar")+": "+(e.message||e)+" — a alteração foi desfeita.", "erro");
    if(typeof render==="function") render();
  }).finally(()=>{ pendentes--; sinalizar(); salvarCache(); });
}

window.addEventListener("beforeunload", e=>{ if(pendentes>0){ e.preventDefault(); e.returnValue = ""; } });

/** Executa uma gravação com trava anti-duplo-clique e aviso de erro (para formulários raros). */
async function seguro(fn, msgErro){
  if(ocupado) return false;
  ocupado = true;
  try{ await fn(); return true; }
  catch(e){ toast((msgErro||"Erro")+": "+(e.message||e), "erro"); return false; }
  finally{ ocupado = false; }
}

/* ---------------- títulos: gravações otimistas ---------------- */
const COLS_TITULO = ["id","tipo","descricao","categoria","pessoa","conta_id","valor","vencimento","status","pago_em","valor_pago","grupo","parcela","parcelas","recorrencia_id","competencia","origem"];
function linhaTitulo(r){
  const o = {}; COLS_TITULO.forEach(c=>{ o[c] = r[c]===undefined ? null : r[c]; });
  o.status = o.status || "aberto"; o.origem = o.origem || "manual"; o.valor = Number(o.valor);
  return o;
}

async function enviarEmLotes(tabela, rows, opcoes){
  for(let i=0;i<rows.length;i+=200){
    const lote = rows.slice(i,i+200);
    const {error} = await (opcoes ? db.from(tabela).upsert(lote, opcoes) : db.from(tabela).insert(lote));
    if(error) throw error;
  }
}

/** Aplica o patch no estado local e devolve a função que o desfaz. */
function patchLocal(ids, patch){
  const antes = [];
  state.titulos.forEach(t=>{
    if(ids.includes(t.id)){
      const o = {}; Object.keys(patch).forEach(k=>{ o[k] = t[k]; });
      antes.push([t, o]); Object.assign(t, patch);
    }
  });
  return ()=>antes.forEach(([t,o])=>Object.assign(t,o));
}

function atualizarTitulosOtimista(ids, patch, msg){
  if(!ids.length) return;
  const rev = patchLocal(ids, patch);
  persistir(async()=>{ const {error} = await db.from("titulos").update(patch).in("id", ids); if(error) throw error; }, rev, msg);
}

function excluirTitulosOtimista(ids, msg){
  const removidos = state.titulos.filter(t=>ids.includes(t.id));
  state.titulos = state.titulos.filter(t=>!ids.includes(t.id));
  persistir(async()=>{ const {error} = await db.from("titulos").delete().in("id", ids); if(error) throw error; },
    ()=>{ state.titulos.push(...removidos); }, msg);
}

/** Insere já no estado local (com id gerado aqui) e grava depois. Devolve os títulos criados. */
function inserirTitulosOtimista(rows, msg){
  const novos = rows.map(r=>({...linhaTitulo({...r, id:uuid()}), created_at:new Date().toISOString()}));
  state.titulos.push(...novos);
  const ids = novos.map(n=>n.id);
  persistir(()=>enviarEmLotes("titulos", novos.map(n=>linhaTitulo(n))),
    ()=>{ state.titulos = state.titulos.filter(t=>!ids.includes(t.id)); }, msg);
  return novos;
}

/** Dá baixa: o título passa a contar no saldo real, na data informada. */
function baixarTitulo(id, data, valorPago, msg){
  const t = tituloPorId(id);
  atualizarTitulosOtimista([id], {status:"pago", pago_em:data, valor_pago: valorPago!=null ? valorPago : t.valor}, msg||"Erro ao dar baixa");
}
/** Baixa vários de uma vez (uma única gravação). valor_pago nulo = pagou o valor previsto. */
function baixarVarios(ids, data, msg){ atualizarTitulosOtimista(ids, {status:"pago", pago_em:data, valor_pago:null}, msg||"Erro ao dar baixa"); }
function reabrirTitulo(id, msg){ atualizarTitulosOtimista([id], {status:"aberto", pago_em:null, valor_pago:null}, msg||"Erro ao reabrir"); }

/**
 * Pagamento parcial: a parte paga vira um título pago à parte e o
 * original continua em aberto só com o que falta. Se o valor cobre tudo,
 * é uma baixa normal. Retorna o necessário para desfazer.
 */
function pagarParcial(id, valorPago, data){
  const t = tituloPorId(id), v = arred(valorPago);
  if(!(v>0)) throw new Error("Informe um valor maior que zero.");
  if(v > t.valor+0.004) throw new Error("O valor é maior que o que está em aberto ("+fmt(t.valor)+").");
  if(v >= t.valor-0.004){ baixarTitulo(id, data, t.valor); return {pagoId:id, total:true}; }

  const antes = t.valor, resto = arred(t.valor-v);
  const copia = {...t}; delete copia.created_at;
  const pago = {...linhaTitulo({...copia, id:uuid(), valor:v, status:"pago", pago_em:data, valor_pago:v,
    descricao:t.descricao+" (pagamento parcial)", recorrencia_id:null, competencia:null}), created_at:new Date().toISOString()};
  state.titulos.push(pago); t.valor = resto;
  persistir(async()=>{
    await enviarEmLotes("titulos", [linhaTitulo(pago)]);
    const {error} = await db.from("titulos").update({valor:resto}).eq("id", id);
    if(error){ await db.from("titulos").delete().eq("id", pago.id); throw error; }
  }, ()=>{ state.titulos = state.titulos.filter(x=>x.id!==pago.id); t.valor = antes; }, "Erro ao registrar o pagamento parcial");
  return {pagoId:pago.id, restanteId:id, valorOriginal:antes};
}

function desfazerPagamentos(regs){
  const totais = regs.filter(r=>r.total).map(r=>r.pagoId);
  if(totais.length) atualizarTitulosOtimista(totais, {status:"aberto", pago_em:null, valor_pago:null}, "Erro ao desfazer");
  regs.filter(r=>!r.total).forEach(r=>{
    const t = tituloPorId(r.restanteId), pago = tituloPorId(r.pagoId); if(!t || !pago) return;
    const antes = t.valor; t.valor = r.valorOriginal;
    state.titulos = state.titulos.filter(x=>x.id!==r.pagoId);
    persistir(async()=>{
      let e = (await db.from("titulos").update({valor:r.valorOriginal}).eq("id", r.restanteId)).error; if(e) throw e;
      e = (await db.from("titulos").delete().eq("id", r.pagoId)).error; if(e) throw e;
    }, ()=>{ t.valor = antes; state.titulos.push(pago); }, "Erro ao desfazer");
  });
}

/** Aplica um valor sobre vários títulos em aberto, na ordem dada (o último pode ficar parcial). */
function pagarValorEmTitulos(titulos, valor, data){
  let resto = arred(valor); const inteiros = [], regs = []; let parcial = null;
  for(const t of titulos){
    if(resto <= 0.004) break;
    if(t.valor <= resto+0.004){ inteiros.push(t.id); resto = arred(resto - t.valor); }
    else{ parcial = {id:t.id, valor:resto}; resto = 0; }
  }
  if(inteiros.length){ baixarVarios(inteiros, data); inteiros.forEach(id=>regs.push({pagoId:id, total:true})); }
  if(parcial) regs.push(pagarParcial(parcial.id, parcial.valor, data));
  return regs;
}

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
