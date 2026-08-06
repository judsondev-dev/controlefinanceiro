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
      tipo:x.tipo, descricao:x.descricao, categoria:x.categoria, valor:Number(x.valor)
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
      venc_ano: x.venc_ano, venc_mes: x.venc_mes
    }));
    state.orcamentos = (b.data||[]).map(x=>({id:x.id, categoria:x.categoria, tipo:x.tipo||"saida", limite:Number(x.limite)}));
    render();
  }catch(e){
    alert("Erro ao carregar dados: "+(e.message||e)+"\nConfira a URL/chave e se as tabelas foram criadas.");
  }
}

/**
 * Lançamentos efetivos de um mês: avulsos/parcelas do mês + contas fixas
 * (aplicando personalizações do mês). Usa o mês selecionado por padrão;
 * aceita ano/mes explícitos para simular outros meses (ex.: projeção).
 */
function lancamentosDoMes(ano, mes){
  if(ano==null) ano=state.ano;
  if(mes==null) mes=state.mes;
  const nDias = diasNoMes(ano, mes);
  const fixos = state.lancamentos
    .filter(l => l.ano===ano && l.mes===mes)
    .map(l => Object.assign({}, l, {rec:false}));
  const recs = [];
  state.recorrentes.forEach(r => {
    const ov = state.overrides[ovKey(r.id, ano, mes)];
    const eff = ov ? ov : r;
    const pulado = !!(ov && ov.pulado);
    if(eff.dia <= nDias){
      recs.push({id:r.id, dia:eff.dia, tipo:eff.tipo, descricao:eff.descricao, categoria:eff.categoria, valor:eff.valor, rec:true, grupo:null, ov: !!ov && !pulado, pulado:pulado});
    }
  });
  return fixos.concat(recs);
}
