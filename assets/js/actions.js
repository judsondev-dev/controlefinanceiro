/* =====================================================================
   Ações sobre títulos: baixar, reabrir, pular, restaurar, excluir e
   pagamento parcial. A tela atualiza na hora; a gravação vai para a
   fila em segundo plano (ver store.js).
   ===================================================================== */
"use strict";

function acaoBaixar(id, data){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data||"")){ toast("Informe uma data válida.", "erro"); return; }
  const t = tituloPorId(id); if(!t || t.status!=="aberto") return;
  baixarTitulo(id, data);
  render();
  toastAcao((t.tipo==="entrada"?"Recebido":"Pago")+" em "+dataBR(data)+".", "Desfazer", ()=>acaoReabrir(id, true));
}

function acaoReabrir(id, silencioso){
  const t = tituloPorId(id); if(!t || t.status!=="pago") return;
  reabrirTitulo(id); render();
  if(!silencioso) toast("Voltou para em aberto.");
}

function acaoPular(id){
  const t = tituloPorId(id); if(!t || t.status!=="aberto") return;
  atualizarTitulosOtimista([id], {status:"cancelado"}, "Erro ao pular"); render();
  toastAcao("Pulado — não entra no saldo.", "Desfazer", ()=>acaoRestaurar(id, true));
}

function acaoRestaurar(id, silencioso){
  const t = tituloPorId(id); if(!t || t.status!=="cancelado") return;
  atualizarTitulosOtimista([id], {status:"aberto"}, "Erro ao restaurar"); render();
  if(!silencioso) toast("Voltou para em aberto.");
}

/** Menu "⋯" de um título: editar, pagar parcialmente, pular ou excluir. */
async function acaoMenu(id){
  const t = tituloPorId(id); if(!t) return;
  const ops = [{label:"✎ Editar", value:"editar", estilo:"primary"}];
  if(t.status==="aberto") ops.push({label: t.tipo==="entrada" ? "✓ Receber com outro valor…" : "✓ Pagar com outro valor…", value:"outro", estilo:"ghost"});
  if(t.status==="aberto") ops.push({label: t.tipo==="entrada" ? "💸 Receber parcialmente…" : "💸 Pagar parcialmente…", value:"parcial", estilo:"ghost"});
  if(t.status==="aberto" && (t.recorrencia_id || t.grupo)) ops.push({label:"⊘ Pular este", value:"pular", estilo:"ghost"});
  ops.push({label:"🗑 Excluir…", value:"excluir", estilo:"danger"}, {label:"Fechar", value:null, estilo:"ghost"});
  const r = await chooseDialog(t.descricao, fmt(valorEf(t))+" · "+(t.status==="pago"?"pago em "+dataBR(t.pago_em):"vence em "+dataBR(t.vencimento)), ops);
  if(r==="editar") abrirForm(id);
  else if(r==="outro") formBaixarComValor(id);
  else if(r==="parcial") formPagarParcial(id);
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
    const ids = state.titulos.filter(x=>x.recorrencia_id===t.recorrencia_id && x.status==="aberto" && x.competencia>=t.competencia).map(x=>x.id);
    const ant = somaMeses(partes(t.competencia).ano, partes(t.competencia).mes, -1);
    excluirTitulosOtimista(ids, "Erro ao encerrar");
    const rec = atualizarRecorrenciaLocal(t.recorrencia_id, {ativa:false, fim:fimMes(ant.ano, ant.mes)});
    persistir(rec.gravar, rec.reverter, "Erro ao encerrar a conta mensal");
    render(); toast("Conta mensal encerrada.");
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
    excluirTitulosOtimista(ids, "Erro ao excluir"); render(); toast(ids.length+" parcela(s) excluída(s).");
    return;
  }

  if(t.status==="pago" && !await confirmDialog({titulo:"Excluir lançamento pago", mensagem:"“"+t.descricao+"” já foi baixado e conta no saldo. Excluir mesmo assim?", textoOk:"Excluir", perigo:true})) return;
  const copia = {...t}; delete copia.id; delete copia.created_at;
  excluirTitulosOtimista([id], "Erro ao excluir"); render();
  toastAcao("Excluído.", "Desfazer", ()=>{ inserirTitulosOtimista([copia], "Erro ao desfazer"); render(); });
}

/** Janela de pagamento/recebimento parcial de um título. */
function formPagarParcial(id){
  const t = tituloPorId(id), ent = t.tipo==="entrada";
  modalForm((ent?"Receber":"Pagar")+" parcialmente — "+t.descricao,
    '<div class="span2 nota">Em aberto: <b>'+fmt(t.valor)+'</b>. O que você informar vira um lançamento '+(ent?"recebido":"pago")+' na data escolhida; o restante continua em aberto e, se não for resolvido no mês, passa para o mês seguinte.</div>'+
    '<div class="field"><label>Valor '+(ent?"recebido":"pago")+' agora</label><input name="valor" type="number" step="0.01" min="0.01" max="'+t.valor+'" required></div>'+
    '<div class="field"><label>Data</label><input name="data" type="date" required value="'+hojeISO()+'"></div>',
    ent?"Registrar recebimento":"Registrar pagamento", f=>{
      const v = arred(parseFloat(f.valor.value)), data = f.data.value;
      if(!(v>0) || !data){ toast("Informe o valor e a data.", "erro"); return false; }
      const antes = t.valor;
      let reg;
      try{ reg = pagarParcial(id, v, data); }catch(e){ toast(e.message, "erro"); return false; }
      toastAcao(reg.total ? "Quitado: "+fmt(v)+"." : (ent?"Recebido ":"Pago ")+fmt(v)+" — restam "+fmt(arred(antes-v))+" em aberto.", "Desfazer", ()=>{ desfazerPagamentos([reg]); render(); });
      return true;
    });
}

/**
 * Baixa o título inteiro com um valor diferente do previsto (juros, multa,
 * atualização pela Selic, desconto...). O previsto fica registrado e a
 * diferença aparece em "Já resolvidos".
 */
function formBaixarComValor(id){
  const t = tituloPorId(id), ent = t.tipo==="entrada";
  modalForm((ent?"Receber":"Pagar")+" com outro valor — "+t.descricao,
    '<div class="span2 nota">Valor previsto: <b>'+fmt(t.valor)+'</b>. Informe o valor que '+(ent?"recebeu":"pagou")+' de fato (com juros, atualização ou desconto). O título é quitado por inteiro.</div>'+
    '<div class="field"><label>Valor '+(ent?"recebido":"pago")+'</label><input name="valor" type="number" step="0.01" min="0.01" required value="'+t.valor+'"></div>'+
    '<div class="field"><label>Data</label><input name="data" type="date" required value="'+hojeISO()+'"></div>',
    ent?"Registrar recebimento":"Registrar pagamento", f=>{
      const v = arred(parseFloat(f.valor.value)), data = f.data.value;
      if(!(v>0) || !data){ toast("Informe o valor e a data.", "erro"); return false; }
      baixarTitulo(id, data, v);
      const dif = arred(v - t.valor);
      toastAcao((ent?"Recebido ":"Pago ")+fmt(v)+" em "+dataBR(data)+(Math.abs(dif)>0.004 ? " ("+(dif>0?"+":"−")+fmt(Math.abs(dif))+" sobre o previsto)" : "")+".", "Desfazer", ()=>acaoReabrir(id, true));
      return true;
    });
}
