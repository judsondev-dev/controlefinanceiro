/* =====================================================================
   Recorrências — contas que se repetem todo mês viram títulos reais.
   Mantém sempre os próximos meses gerados (idempotente: a restrição
   única recorrencia_id+competencia impede duplicar).
   ===================================================================== */
"use strict";

const HORIZONTE_MESES = 14;

const mesIdx = (ano,mes) => ano*12+mes;

function tituloDaRecorrencia(r, ano, mes){
  return {
    tipo:r.tipo, descricao:r.descricao, categoria:r.categoria||null, pessoa:r.pessoa||null, conta_id:r.conta_id||null,
    valor:r.valor, vencimento:iso(ano,mes,r.dia), status:"aberto",
    recorrencia_id:r.id, competencia:iniMes(ano,mes), origem:"manual"
  };
}

/** Gera os títulos que faltam, do mês atual até o horizonte. */
async function garantirRecorrencias(){
  if(!db) return;
  const base = mesDe(hojeISO());
  const tem = new Set(state.titulos.filter(t=>t.recorrencia_id).map(t=>t.recorrencia_id+"|"+t.competencia));
  const rows = [];
  state.recorrencias.filter(r=>r.ativa).forEach(r=>{
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
  if(!rows.length) return;
  const {data, error} = await db.from("titulos").upsert(rows, {onConflict:"recorrencia_id,competencia", ignoreDuplicates:true}).select();
  if(error) throw error;
  state.titulos.push(...(data||[]).map(normTitulo));
}

/** Cria a recorrência e já gera os meses. Retorna os títulos gerados. */
async function criarRecorrencia(campos){
  const {data, error} = await db.from("recorrencias").insert(campos).select();
  if(error) throw error;
  const r = normRec(data[0]);
  state.recorrencias.push(r);
  const antes = state.titulos.length;
  await garantirRecorrencias();
  return state.titulos.slice(antes).filter(t=>t.recorrencia_id===r.id);
}

async function atualizarRecorrencia(id, patch){
  const {error} = await db.from("recorrencias").update(patch).eq("id", id);
  if(error) throw error;
  Object.assign(state.recorrencias.find(r=>r.id===id), patch);
}
