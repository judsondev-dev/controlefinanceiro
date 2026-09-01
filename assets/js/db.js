/* =====================================================================
   Acesso a dados — conexão com o Supabase, carga inicial e
   consolidação dos lançamentos do mês selecionado.
   ===================================================================== */
"use strict";

/** Lê as credenciais salvas no navegador. */
function getCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }catch(e){ return {}; } }

/** Salva as credenciais no navegador. */
function setCfg(url,key){ localStorage.setItem(CFG_KEY, JSON.stringify({url,key})); }

/** Cria o cliente Supabase. Retorna true se conectou. */
function conectar(url,key){
  if(!url || !key){ alert("Informe a URL e a anon key do seu projeto Supabase."); return false; }
  try{
    db = window.supabase.createClient(url, key);
    setCfg(url,key);
    return true;
  }catch(e){ alert("Falha ao conectar: "+e.message); return false; }
}

/** Carrega todas as tabelas para o estado local e redesenha a tela. */
async function carregar(){
  if(!db) return;
  try{
    const [s,l,r,o,p,b] = await Promise.all([
      db.from("saldos").select("*"),
      db.from("lancamentos").select("*"),
      db.from("recorrentes").select("*"),
      db.from("recorrentes_override").select("*"),
      db.from("pendentes").select("*"),
      db.from("orcamentos").select("*")
    ]);
    if(s.error||l.error||r.error||o.error||p.error){ throw (s.error||l.error||r.error||o.error||p.error); }
    // "orcamentos" é uma tabela nova: se o banco ainda não foi migrado (sql/schema.sql
    // atualizado), não trava o app inteiro — só o orçamento por categoria fica vazio.
    if(b.error){ console.warn("Tabela 'orcamentos' indisponível (rode sql/schema.sql de novo?):", b.error.message); }
    state.saldos = {};
    (s.data||[]).forEach(x=> state.saldos[chave(x.ano,x.mes)] = Number(x.valor));
    state.lancamentos = (l.data||[]).map(x=>({
      id:x.id, grupo:x.grupo, ano:x.ano, mes:x.mes, dia:x.dia,
      tipo:x.tipo, descricao:x.descricao, categoria:x.categoria, valor:Number(x.valor),
      origem:x.origem||"manual", origem_recorrente_id:x.origem_recorrente_id||null
    }));
    state.recorrentes = (r.data||[]).map(x=>({
      id:x.id, dia:x.dia, tipo:x.tipo, descricao:x.descricao, categoria:x.categoria, valor:Number(x.valor)
    }));
    state.overrides = {};
    (o.data||[]).forEach(x=>{
      state.overrides[ovKey(x.recorrente_id,x.ano,x.mes)] = {
        recorrente_id:x.recorrente_id, ano:x.ano, mes:x.mes, dia:x.dia,
        tipo:x.tipo, descricao:x.descricao, categoria:x.categoria, valor:Number(x.valor),
        pulado: !!x.pulado
      };
    });
    state.pendentes = (p.data||[]).map(x=>({
      id:x.id, tipo:x.tipo, descricao:x.descricao, categoria:x.categoria,
      valor:Number(x.valor), venc_dia:x.venc_dia, recorrente: !!x.recorrente,
      baixa_ano: x.baixa_ano, baixa_mes: x.baixa_mes,
      venc_ano: x.venc_ano, venc_mes: x.venc_mes, origem:x.origem||"manual",
      grupo: x.grupo||null
    }));
    state.orcamentos = (b.data||[]).map(x=>({id:x.id, categoria:x.categoria, tipo:x.tipo||"saida", limite:Number(x.limite)}));
    render();
  }catch(e){
    alert("Erro ao carregar dados: "+(e.message||e)+"\nConfira a URL/chave e se as tabelas foram criadas.");
  }
}

/**
 * Um id de conta fixa já virou lançamento real neste mês (foi confirmada)?
 */
function recorrenteConfirmadaNoMes(recorrenteId, ano, mes){
  return state.lancamentos.some(l => l.origem_recorrente_id===recorrenteId && l.ano===ano && l.mes===mes);
}

/**
 * Lançamentos efetivos de um mês: avulsos/parcelas do mês (inclui contas
 * fixas já confirmadas, que viram lançamento normal marcado com
 * origem_recorrente_id) + contas fixas ainda não confirmadas, só quando
 * incluirPrevisao=true (usado pela projeção, que assume que vão
 * acontecer). Fora da projeção, uma conta fixa só entra no fluxo depois
 * de confirmada no quadro "A receber / A pagar" — assim o saldo não
 * abate uma conta que ainda nem foi paga de fato.
 * Usa o mês selecionado por padrão; aceita ano/mes explícitos pra
 * simular outros meses.
 */
function lancamentosDoMes(ano, mes, incluirPrevisao){
  if(ano==null) ano=state.ano;
  if(mes==null) mes=state.mes;
  const nDias = diasNoMes(ano, mes);
  const fixos = state.lancamentos
    .filter(l => l.ano===ano && l.mes===mes)
    .map(l => Object.assign({}, l, {rec:false}));
  const recs = [];
  if(incluirPrevisao){
    state.recorrentes.forEach(r => {
      if(recorrenteConfirmadaNoMes(r.id, ano, mes)) return; // já é um lançamento real, não duplica
      const ov = state.overrides[ovKey(r.id, ano, mes)];
      const eff = ov ? ov : r;
      const pulado = !!(ov && ov.pulado);
      if(pulado) return;
      if(eff.dia <= nDias){
        recs.push({id:r.id, dia:eff.dia, tipo:eff.tipo, descricao:eff.descricao, categoria:eff.categoria, valor:eff.valor, rec:true, grupo:null, ov: !!ov, pulado:false, previsto:true});
      }
    });
  }
  return fixos.concat(recs);
}

/**
 * Contas fixas do mês que ainda não viraram lançamento — pra mostrar no
 * quadro "A receber / A pagar" com data editável e opção de confirmar,
 * pular ou restaurar. Inclui as puladas (pra dar a opção de restaurar).
 */
function recorrentesDoMesParaQuadro(ano, mes){
  const nDias = diasNoMes(ano, mes);
  const out = [];
  state.recorrentes.forEach(r => {
    if(recorrenteConfirmadaNoMes(r.id, ano, mes)) return;
    const ov = state.overrides[ovKey(r.id, ano, mes)];
    const eff = ov ? ov : r;
    const pulado = !!(ov && ov.pulado);
    if(eff.dia > nDias) return;
    out.push({id:r.id, dia:eff.dia, tipo:eff.tipo, descricao:eff.descricao, categoria:eff.categoria, valor:eff.valor, ov: !!ov && !pulado, pulado});
  });
  return out;
}

/**
 * Saldo realmente disponível hoje no mês selecionado: soma só os
 * lançamentos com dia já chegado (hoje ou antes). Contas com vencimento
 * futuro continuam aparecendo no fluxo/projeção normalmente — só não
 * abatem esse número antes da data delas chegar.
 * Mês totalmente no passado: conta o mês inteiro (tudo já aconteceu).
 * Mês totalmente no futuro: só o saldo inicial (nada aconteceu ainda).
 */
function saldoDisponivelAtual(){
  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear()===state.ano && hoje.getMonth()===state.mes;
  const ehMesFuturo = (state.ano>hoje.getFullYear()) || (state.ano===hoje.getFullYear() && state.mes>hoje.getMonth());
  if(ehMesFuturo) return saldoInicialAtual();
  const limiteDia = ehMesAtual ? hoje.getDate() : diasNoMes(state.ano, state.mes);
  let saldo = saldoInicialAtual();
  lancamentosDoMes().forEach(it=>{
    if(it.pulado || it.dia>limiteDia) return;
    saldo += (it.tipo==="entrada"?1:-1)*Number(it.valor);
  });
  return saldo;
}
