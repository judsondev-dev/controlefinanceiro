/* =====================================================================
   Ações sobre títulos: baixar, reabrir, pular, restaurar, excluir.
   ===================================================================== */
"use strict";

async function acaoBaixar(id, data){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data||"")){ toast("Informe uma data válida.", "erro"); return; }
  const t = tituloPorId(id);
  const ok = await seguro(()=>baixarTitulo(id, data), "Erro ao dar baixa");
  if(ok){
    render();
    toastAcao((t.tipo==="entrada"?"Recebido":"Pago")+" em "+dataBR(data)+".", "Desfazer", ()=>acaoReabrir(id, true));
  }
}

async function acaoReabrir(id, silencioso){
  const ok = await seguro(()=>reabrirTitulo(id), "Erro ao reabrir");
  if(ok){ render(); if(!silencioso) toast("Voltou para em aberto."); }
}

async function acaoPular(id){
  const ok = await seguro(()=>atualizarTitulos([id], {status:"cancelado"}), "Erro ao pular");
  if(ok){ render(); toastAcao("Pulado — não entra no saldo.", "Desfazer", ()=>acaoRestaurar(id, true)); }
}

async function acaoRestaurar(id, silencioso){
  const ok = await seguro(()=>atualizarTitulos([id], {status:"aberto"}), "Erro ao restaurar");
  if(ok){ render(); if(!silencioso) toast("Voltou para em aberto."); }
}

/** Menu "⋯" de um título: editar, pular ou excluir. */
async function acaoMenu(id){
  const t = tituloPorId(id); if(!t) return;
  const ops = [{label:"✎ Editar", value:"editar", estilo:"primary"}];
  if(t.status==="aberto" && (t.recorrencia_id || t.grupo)) ops.push({label:"⊘ Pular este", value:"pular", estilo:"ghost"});
  ops.push({label:"🗑 Excluir…", value:"excluir", estilo:"danger"}, {label:"Fechar", value:null, estilo:"ghost"});
  const r = await chooseDialog(t.descricao, fmt(valorEf(t))+" · "+(t.status==="pago"?"pago em "+dataBR(t.pago_em):"vence em "+dataBR(t.vencimento)), ops);
  if(r==="editar") abrirForm(id);
  else if(r==="pular") acaoPular(id);
  else if(r==="excluir") acaoExcluir(id);
}

async function acaoExcluir(id){
  const t = tituloPorId(id); if(!t) return;

  if(t.recorrencia_id && t.status==="aberto"){
    const r = await chooseDialog("Conta mensal", "Esta conta se repete todo mês. O que fazer com “"+t.descricao+"”?", [
      {label:"Pular só este mês", value:"pular", estilo:"primary"},
      {label:"Encerrar: apagar este e os próximos", value:"encerrar", estilo:"danger"},
      {label:"Cancelar", value:null, estilo:"ghost"}]);
    if(r==="pular") return acaoPular(id);
    if(r!=="encerrar") return;
    const ok = await seguro(async ()=>{
      const ids = state.titulos.filter(x=>x.recorrencia_id===t.recorrencia_id && x.status==="aberto" && x.competencia>=t.competencia).map(x=>x.id);
      await excluirTitulos(ids);
      const ant = somaMeses(partes(t.competencia).ano, partes(t.competencia).mes, -1);
      await atualizarRecorrencia(t.recorrencia_id, {ativa:false, fim:fimMes(ant.ano, ant.mes)});
    }, "Erro ao encerrar");
    if(ok){ render(); toast("Conta mensal encerrada."); }
    return;
  }

  if(t.grupo && t.parcelas>1 && t.status==="aberto"){
    const restantes = state.titulos.filter(x=>x.grupo===t.grupo && x.status==="aberto");
    const r = await chooseDialog("Compra parcelada", "Esta é a parcela "+t.parcela+"/"+t.parcelas+". Há "+restantes.length+" parcelas em aberto neste grupo.", [
      {label:"Excluir só esta parcela", value:"uma", estilo:"primary"},
      {label:"Excluir todas as em aberto ("+restantes.length+")", value:"todas", estilo:"danger"},
      {label:"Cancelar", value:null, estilo:"ghost"}]);
    if(!r) return;
    const ids = r==="todas" ? restantes.map(x=>x.id) : [id];
    const ok = await seguro(()=>excluirTitulos(ids), "Erro ao excluir");
    if(ok){ render(); toast(ids.length+" parcela(s) excluída(s)."); }
    return;
  }

  if(t.status==="pago" && !await confirmDialog({titulo:"Excluir lançamento pago", mensagem:"“"+t.descricao+"” já foi baixado e conta no saldo. Excluir mesmo assim?", textoOk:"Excluir", perigo:true})) return;
  const copia = {...t}; delete copia.id; delete copia.created_at;
  const ok = await seguro(()=>excluirTitulos([id]), "Erro ao excluir");
  if(ok){
    render();
    toastAcao("Excluído.", "Desfazer", async ()=>{
      if(await seguro(()=>inserirTitulos([copia]), "Erro ao desfazer")) render();
    });
  }
}
