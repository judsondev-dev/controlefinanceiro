/* =====================================================================
   Recorrências — contas que se repetem todo mês viram títulos reais.
   Mantém sempre os próximos meses gerados (idempotente: a restrição
   única recorrencia_id+competencia impede duplicar). A geração acontece
   na hora, no estado local, e a gravação segue em segundo plano.
   ===================================================================== */
"use strict";

const HORIZONTE_MESES = 14;
const COLS_REC = ["id","tipo","descricao","categoria","pessoa","conta_id","valor","dia","inicio","fim","ativa"];
const ON_CONFLITO_REC = {onConflict:"recorrencia_id,competencia", ignoreDuplicates:true};

const mesIdx = (ano,mes) => ano*12+mes;

function tituloDaRecorrencia(r, ano, mes){
  return {
    tipo:r.tipo, descricao:r.descricao, categoria:r.categoria||null, pessoa:r.pessoa||null, conta_id:r.conta_id||null,
    valor:r.valor, vencimento:iso(ano,mes,r.dia), status:"aberto",
    recorrencia_id:r.id, competencia:iniMes(ano,mes), origem:"manual"
  };
}

/** Gera no estado local os títulos que faltam (do mês atual ao horizonte) e devolve os novos. */
function gerarRecorrenciasLocal(lista){
  const base = mesDe(hojeISO());
  const tem = new Set(state.titulos.filter(t=>t.recorrencia_id).map(t=>t.recorrencia_id+"|"+t.competencia));
  const rows = [];
  (lista || state.recorrencias.filter(r=>r.ativa)).forEach(r=>{
    const ini = mesDe(r.inicio);
    const primeiro = Math.max(mesIdx(ini.ano,ini.mes), mesIdx(base.ano,base.mes));
    const ultimo = r.fim ? mesIdx(mesDe(r.fim).ano, mesDe(r.fim).mes) : Infinity;
    for(let i=0;i<HORIZONTE_MESES;i++){
      const {ano,mes} = somaMeses(base.ano, base.mes, i);
      const k = mesIdx(ano,mes);
      if(k<primeiro || k>ultimo) continue;
      if(tem.has(r.id+"|"+iniMes(ano,mes))) continue;
      rows.push(tituloDaRecorrencia(r, ano, mes));
    }
  });
  const agora = new Date().toISOString();
  const novos = rows.map(r=>({...linhaTitulo({...r, id:uuid()}), created_at:agora}));
  state.titulos.push(...novos);
  return novos;
}

/** Na abertura do app: gera o que falta e grava em segundo plano. */
function garantirRecorrencias(){
  if(!db) return [];
  const novos = gerarRecorrenciasLocal();
  if(!novos.length) return novos;
  const ids = novos.map(n=>n.id);
  persistir(()=>enviarEmLotes("titulos", novos.map(linhaTitulo), ON_CONFLITO_REC),
    ()=>{ state.titulos = state.titulos.filter(t=>!ids.includes(t.id)); }, "Erro ao gerar as contas mensais");
  return novos;
}

/** Cria a recorrência e já gera os meses. Devolve {rec, titulos}. */
function criarRecorrencia(campos){
  const r = normRec({categoria:null, pessoa:null, conta_id:null, fim:null, ativa:true, ...campos, id:uuid()});
  state.recorrencias.push(r);
  const novos = gerarRecorrenciasLocal([r]);
  const ids = novos.map(n=>n.id);
  persistir(async()=>{
    const linha = {}; COLS_REC.forEach(c=>{ linha[c] = r[c]===undefined ? null : r[c]; });
    const {error} = await db.from("recorrencias").insert(linha); if(error) throw error;
    await enviarEmLotes("titulos", novos.map(linhaTitulo), ON_CONFLITO_REC);
  }, ()=>{ state.recorrencias = state.recorrencias.filter(x=>x.id!==r.id); state.titulos = state.titulos.filter(t=>!ids.includes(t.id)); }, "Erro ao criar a conta mensal");
  return {rec:r, titulos:novos};
}

/** Atualiza a recorrência no estado local e devolve [reverter, gravar]. */
function atualizarRecorrenciaLocal(id, patch){
  const r = state.recorrencias.find(x=>x.id===id), antes = {};
  Object.keys(patch).forEach(k=>{ antes[k] = r[k]; });
  Object.assign(r, patch);
  return {
    reverter: ()=>Object.assign(r, antes),
    gravar: async()=>{ const {error} = await db.from("recorrencias").update(patch).eq("id", id); if(error) throw error; }
  };
}
