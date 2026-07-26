/* =====================================================================
   Ações — tudo que grava no Supabase (criar, editar, excluir, baixar,
   importar extrato). Usam a trava "ocupado" contra clique duplo e,
   quando possível, atualizam a tela de forma otimista.

   Erros e confirmações de ação usam toast() (não bloqueia a tela).
   Alertas de configuração inicial (conectar, carregar dados) continuam
   em alert(), de propósito, por impedirem o uso do app até resolvidos.
   ===================================================================== */
"use strict";

/* ---------- Criação / edição de lançamentos ---------- */

/**
 * Botão principal do formulário. Despacha para edição/baixa quando
 * está nesse modo; caso contrário cria um novo lançamento
 * (avulso, parcelado, conta fixa ou item em espera).
 */
async function addLancamento(){
  if(!db){ toast("Conecte ao Supabase primeiro.", "erro"); return; }
  if(ocupado) return; ocupado=true;
  try{
  if(editando){ await salvarEdicao(); return; }
  if(baixando){ await confirmarBaixa(); return; }
  if(editandoPend){ await salvarEdicaoPendente(); return; }
  const tipo=document.getElementById("tipo").value;
  const dia=parseInt(document.getElementById("dia").value,10);
  const descricao=document.getElementById("descricao").value.trim();
  const categoria=document.getElementById("categoria").value.trim();
  const valor=parseFloat(document.getElementById("valor").value);
  const rec=document.getElementById("recorrente").checked;
  const emEspera=document.getElementById("emEspera").checked;
  let parcelas=parseInt(document.getElementById("parcelas").value,10);
  if(isNaN(parcelas)||parcelas<1) parcelas=1;

  if(isNaN(valor)||valor<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  if(!emEspera && (!dia||dia<1||dia>31)){ toast("Informe um dia válido (1 a 31).", "erro"); return; }

  // Em espera: guarda fora do fluxo (dia vira previsão, opcional).
  // Se "Repete todo mês" também estiver marcado, o pendente é mensal (volta após a baixa).
  if(emEspera){
    try{
      const row={tipo, descricao, categoria, valor, venc_dia:(dia>=1&&dia<=31)?dia:null, recorrente:rec};
      const {data,error}=await db.from("pendentes").insert(row).select(); if(error) throw error;
      state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente})));
      document.getElementById("descricao").value="";
      document.getElementById("valor").value="";
      document.getElementById("emEspera").checked=false;
      document.getElementById("recorrente").checked=false;
      render();
    }catch(e){ toast("Erro ao guardar em espera: "+(e.message||e), "erro"); }
    return;
  }

  try{
    if(rec){
      const row={dia,tipo,descricao,categoria,valor};
      const {data,error}=await db.from("recorrentes").insert(row).select();
      if(error) throw error;
      state.recorrentes.push(...data.map(x=>({id:x.id,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
    }else if(parcelas>1){
      const grupo = (crypto.randomUUID? crypto.randomUUID() : String(Date.now()));
      const rows=[];
      for(let i=0;i<parcelas;i++){
        const alvo=new Date(state.ano, state.mes+i, 1);
        const ano=alvo.getFullYear(), mes=alvo.getMonth();
        const diaAlvo=Math.min(dia, diasNoMes(ano,mes));
        rows.push({grupo, ano, mes, dia:diaAlvo, tipo, descricao:(descricao||"(sem descrição)")+" ("+(i+1)+"/"+parcelas+")", categoria, valor});
      }
      const {data,error}=await db.from("lancamentos").insert(rows).select();
      if(error) throw error;
      state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
    }else{
      const row={ano:state.ano,mes:state.mes,dia,tipo,descricao,categoria,valor};
      const {data,error}=await db.from("lancamentos").insert(row).select();
      if(error) throw error;
      state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
    }
    document.getElementById("descricao").value="";
    document.getElementById("valor").value="";
    document.getElementById("parcelas").value="1";
    document.getElementById("recorrente").checked=false;
    render();
  }catch(e){ toast("Erro ao salvar: "+(e.message||e), "erro"); }
  } finally { ocupado=false; }
}

/**
 * Salva a edição em curso. Trata conta fixa (todos os meses x só este),
 * parcelas (todas x só esta) e conversão de avulso em fixo/em espera.
 */
async function salvarEdicao(){
  const tipo=document.getElementById("tipo").value;
  const dia=parseInt(document.getElementById("dia").value,10);
  const descricao=document.getElementById("descricao").value.trim();
  const categoria=document.getElementById("categoria").value.trim();
  const valor=parseFloat(document.getElementById("valor").value);
  // caixas só valem quando editáveis (lançamento avulso)
  const emEsperaEl=document.getElementById("emEspera");
  const recEl=document.getElementById("recorrente");
  const querEspera = emEsperaEl.checked && !emEsperaEl.disabled;
  const querRec = recEl.checked && !recEl.disabled;
  if(isNaN(valor)||valor<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  if(!querEspera && (!dia||dia<1||dia>31)){ toast("Informe um dia válido (1 a 31).", "erro"); return; }
  const {id, rec} = editando;
  try{
    if(rec){
      const todosMeses = await confirmDialog({
        titulo: "Esta é uma conta fixa",
        mensagem: "Aplicar a alteração a todos os meses, ou só a "+MESES[state.mes]+"/"+state.ano+" (antecipação/ajuste pontual)?",
        textoOk: "Todos os meses",
        textoCancelar: MESES[state.mes]+"/"+state.ano+" apenas"
      });
      if(todosMeses){
        const patch={dia,tipo,descricao,categoria,valor};
        const {error}=await db.from("recorrentes").update(patch).eq("id",id); if(error) throw error;
        const it=state.recorrentes.find(r=>r.id===id); if(it) Object.assign(it, patch);
        // se este mês tinha personalização, remove para voltar a seguir o padrão
        const k=ovKey(id,state.ano,state.mes);
        if(state.overrides[k]){
          const {error:e2}=await db.from("recorrentes_override").delete().eq("recorrente_id",id).eq("ano",state.ano).eq("mes",state.mes);
          if(e2) throw e2;
          delete state.overrides[k];
        }
      }else{
        const ov={recorrente_id:id, ano:state.ano, mes:state.mes, dia, tipo, descricao, categoria, valor, pulado:false};
        const {error}=await db.from("recorrentes_override").upsert(ov,{onConflict:"recorrente_id,ano,mes"}); if(error) throw error;
        state.overrides[ovKey(id,state.ano,state.mes)]=ov;
      }
    }else{
      const it=state.lancamentos.find(l=>l.id===id);
      const grupo = it && it.grupo;
      // Conversão de lançamento avulso -> em espera ou conta fixa
      if(!grupo && (querEspera || querRec)){
        if(querEspera){
          const row={tipo, descricao, categoria, valor, venc_dia:(dia>=1&&dia<=31)?dia:null, recorrente:querRec};
          const {data,error}=await db.from("pendentes").insert(row).select(); if(error) throw error;
          state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente})));
        }else{
          const row={dia,tipo,descricao,categoria,valor};
          const {data,error}=await db.from("recorrentes").insert(row).select(); if(error) throw error;
          state.recorrentes.push(...data.map(x=>({id:x.id,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
        }
        const {error:eDel}=await db.from("lancamentos").delete().eq("id",id); if(eDel) throw eDel;
        state.lancamentos=state.lancamentos.filter(l=>l.id!==id);
        finalizarEdicao();
        render();
        return;
      }
      const doGrupo = grupo ? state.lancamentos.filter(l=>l.grupo===grupo) : [];
      const aplicarTodas = doGrupo.length>1 && await confirmDialog({
        titulo: "Esta é uma parcela",
        mensagem: "Esta compra tem "+doGrupo.length+" parcelas. Aplicar a alteração a todas, ou só a esta?",
        textoOk: "Todas as parcelas",
        textoCancelar: "Só esta"
      });
      if(aplicarTodas){
        // aplica a todas: mantém ano/mês de cada uma e reindexa (i/N)
        const ordenadas = doGrupo.slice().sort((a,b)=> (a.ano-b.ano)||(a.mes-b.mes));
        const total = ordenadas.length;
        const base = descricao.replace(/\s*\(\d+\/\d+\)\s*$/,"").trim();
        for(let i=0;i<total;i++){
          const p = ordenadas[i];
          const diaP = Math.min(dia, diasNoMes(p.ano, p.mes));
          const patch={dia:diaP, tipo, categoria, valor, descricao:(base||"(sem descrição)")+" ("+(i+1)+"/"+total+")"};
          const {error}=await db.from("lancamentos").update(patch).eq("id",p.id); if(error) throw error;
          Object.assign(p, patch);
        }
      }else{
        const patch={dia,tipo,descricao,categoria,valor};
        const {error}=await db.from("lancamentos").update(patch).eq("id",id); if(error) throw error;
        if(it) Object.assign(it, patch);
      }
    }
    finalizarEdicao();
    render();
  }catch(e){ toast("Erro ao salvar edição: "+(e.message||e), "erro"); }
}

/** Remove um lançamento (avulso, parcela ou conta fixa). Avulso oferece "Desfazer". */
async function removerItem(id, rec, grupo){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  try{
    if(rec){
      const k=ovKey(id,state.ano,state.mes);
      const r = state.recorrentes.find(x=>x.id===id);
      const escolha = await chooseDialog(
        "Esta é uma conta fixa",
        "Como deseja excluir \""+((r&&r.descricao)||"conta fixa")+"\"?",
        [
          {label:"Só "+MESES[state.mes]+"/"+state.ano+" (pode restaurar depois)", value:"mes", estilo:"primary"},
          {label:"Todos os meses (definitivo)", value:"todos", estilo:"danger"},
          {label:"Cancelar", value:"cancelar", estilo:"ghost"}
        ]
      );
      if(escolha==="mes"){
        // exclui só neste mês: marca como pulado (removível/restaurável)
        const base = state.overrides[k] || r || {};
        const ov = {recorrente_id:id, ano:state.ano, mes:state.mes, dia:base.dia, tipo:base.tipo,
                    descricao:base.descricao, categoria:base.categoria, valor:base.valor, pulado:true};
        const {error}=await db.from("recorrentes_override").upsert(ov,{onConflict:"recorrente_id,ano,mes"}); if(error) throw error;
        state.overrides[k]=ov;
      }else if(escolha==="todos"){
        const {error}=await db.from("recorrentes").delete().eq("id",id); if(error) throw error;
        state.recorrentes=state.recorrentes.filter(r=>r.id!==id);
        Object.keys(state.overrides).forEach(kk=>{ if(state.overrides[kk].recorrente_id===id) delete state.overrides[kk]; });
      }else{
        return;
      }
    }else if(grupo){
      const total=state.lancamentos.filter(l=>l.grupo===grupo).length;
      const todas = await confirmDialog({
        titulo: "Esta é uma conta parcelada",
        mensagem: "Esta compra tem "+total+" parcelas. Remover todas, ou só esta parcela?",
        textoOk: "Todas as parcelas",
        textoCancelar: "Só esta parcela",
        perigo: true
      });
      if(todas){
        const {error}=await db.from("lancamentos").delete().eq("grupo",grupo); if(error) throw error;
        state.lancamentos=state.lancamentos.filter(l=>l.grupo!==grupo);
      }else{
        const {error}=await db.from("lancamentos").delete().eq("id",id); if(error) throw error;
        state.lancamentos=state.lancamentos.filter(l=>l.id!==id);
      }
    }else{
      const item = state.lancamentos.find(l=>l.id===id);
      const {error}=await db.from("lancamentos").delete().eq("id",id); if(error) throw error;
      state.lancamentos=state.lancamentos.filter(l=>l.id!==id);
      if(item){
        toastAcao("Lançamento removido.", "Desfazer", async ()=>{
          try{
            const row={ano:item.ano, mes:item.mes, dia:item.dia, tipo:item.tipo, descricao:item.descricao, categoria:item.categoria, valor:item.valor};
            const {data,error:e2}=await db.from("lancamentos").insert(row).select(); if(e2) throw e2;
            state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
            render();
          }catch(e){ toast("Erro ao desfazer: "+(e.message||e), "erro"); }
        });
      }
    }
    render();
  }catch(e){ toast("Erro ao remover: "+(e.message||e), "erro"); }
  finally{ ocupado=false; }
}

/* ---------- Contas fixas: pular / restaurar em um mês ---------- */

/** Marca a conta fixa como pulada (não paga) apenas no mês selecionado. */
async function pularRecorrente(id){
  if(!db) return;
  const r = state.recorrentes.find(x=>x.id===id);
  if(!r) return;
  if(ocupado) return; ocupado=true;
  const okPular = await confirmDialog({
    titulo: "Pular conta fixa neste mês",
    mensagem: "Pular \""+(r.descricao||"conta fixa")+"\" em "+MESES[state.mes]+"/"+state.ano+"? Ela não será contada neste mês (fica marcada como pulada), sem afetar os outros meses.",
    textoOk: "Pular"
  });
  if(!okPular){ ocupado=false; return; }
  const k = ovKey(id, state.ano, state.mes);
  const atual = state.overrides[k];
  const base = atual || r;
  const ov = {recorrente_id:id, ano:state.ano, mes:state.mes, dia:base.dia, tipo:base.tipo,
              descricao:base.descricao, categoria:base.categoria, valor:base.valor, pulado:true};
  state.overrides[k]=ov; render(); // otimista
  try{
    const {error}=await db.from("recorrentes_override").upsert(ov,{onConflict:"recorrente_id,ano,mes"}); if(error) throw error;
  }catch(e){ toast("Erro ao pular: "+(e.message||e), "erro"); carregar(); }
  finally{ ocupado=false; }
}

/** Remove a personalização do mês, voltando a conta fixa ao padrão. */
async function restaurarRecorrente(id){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const k = ovKey(id, state.ano, state.mes);
  const backup = state.overrides[k];
  delete state.overrides[k]; render(); // otimista
  try{
    const {error}=await db.from("recorrentes_override").delete().eq("recorrente_id",id).eq("ano",state.ano).eq("mes",state.mes); if(error) throw error;
  }catch(e){ toast("Erro ao restaurar: "+(e.message||e), "erro"); if(backup) state.overrides[k]=backup; render(); }
  finally{ ocupado=false; }
}

/* ---------- Pendentes (em espera) ---------- */

/** Confirma a baixa aberta no formulário, lançando no mês selecionado. */
async function confirmarBaixa(){
  const tipo=document.getElementById("tipo").value;
  const dia=parseInt(document.getElementById("dia").value,10);
  const descricao=document.getElementById("descricao").value.trim();
  const categoria=document.getElementById("categoria").value.trim();
  const valor=parseFloat(document.getElementById("valor").value);
  if(!dia||dia<1||dia>31){ toast("Informe o dia do recebimento/pagamento (1 a 31).", "erro"); return; }
  if(isNaN(valor)||valor<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  const {id} = baixando;
  const pend = state.pendentes.find(x=>x.id===id);
  try{
    const row={ano:state.ano, mes:state.mes, dia, tipo, descricao, categoria, valor};
    const {data,error}=await db.from("lancamentos").insert(row).select(); if(error) throw error;
    state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
    // Pendente mensal permanece, mas marcado como baixado neste mês (some do mês atual,
    // reaparece no próximo). Avulso é removido de vez.
    if(pend && pend.recorrente){
      const {error:e2}=await db.from("pendentes").update({baixa_ano:state.ano, baixa_mes:state.mes}).eq("id",id); if(e2) throw e2;
      pend.baixa_ano=state.ano; pend.baixa_mes=state.mes;
    }else{
      const {error:e2}=await db.from("pendentes").delete().eq("id",id); if(e2) throw e2;
      state.pendentes = state.pendentes.filter(x=>x.id!==id);
    }
    finalizarEdicao();
    render();
  }catch(e){ toast("Erro ao dar baixa: "+(e.message||e), "erro"); }
}

/** Lança um pendente direto no fluxo, na data original, sem abrir o formulário. */
async function baixaDireta(id){
  if(!db) return;
  const p = state.pendentes.find(x=>x.id===id);
  if(!p) return;
  if(ocupado) return; ocupado=true;
  const ano = (p.venc_ano!=null)?p.venc_ano:state.ano;
  const mes = (p.venc_mes!=null)?p.venc_mes:state.mes;
  const dia = (p.venc_dia>=1&&p.venc_dia<=31)?p.venc_dia:1;
  try{
    const row={ano, mes, dia, tipo:p.tipo, descricao:p.descricao, categoria:p.categoria, valor:p.valor};
    const {data,error}=await db.from("lancamentos").insert(row).select(); if(error) throw error;
    state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor)})));
    if(p.recorrente){
      const {error:e2}=await db.from("pendentes").update({baixa_ano:ano, baixa_mes:mes}).eq("id",id); if(e2) throw e2;
      p.baixa_ano=ano; p.baixa_mes=mes;
    }else{
      const {error:e2}=await db.from("pendentes").delete().eq("id",id); if(e2) throw e2;
      state.pendentes=state.pendentes.filter(x=>x.id!==id);
    }
    render();
  }catch(e){ toast("Erro ao lançar: "+(e.message||e), "erro"); carregar(); }
  finally{ ocupado=false; }
}

/** Salva a edição de um item em espera. */
async function salvarEdicaoPendente(){
  const tipo=document.getElementById("tipo").value;
  const diaRaw=parseInt(document.getElementById("dia").value,10);
  const descricao=document.getElementById("descricao").value.trim();
  const categoria=document.getElementById("categoria").value.trim();
  const valor=parseFloat(document.getElementById("valor").value);
  const recorrente=document.getElementById("recorrente").checked;
  if(isNaN(valor)||valor<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  const venc_dia = (diaRaw>=1 && diaRaw<=31) ? diaRaw : null;
  const {id} = editandoPend;
  try{
    const patch={tipo, descricao, categoria, valor, venc_dia, recorrente};
    const {error}=await db.from("pendentes").update(patch).eq("id",id); if(error) throw error;
    const it=state.pendentes.find(x=>x.id===id); if(it) Object.assign(it, patch);
    finalizarEdicao();
    render();
  }catch(e){ toast("Erro ao salvar em espera: "+(e.message||e), "erro"); }
}

/** Desfaz a baixa de um pendente mensal no mês selecionado. */
async function reabrirPendente(id){
  if(!db) return;
  const p = state.pendentes.find(x=>x.id===id);
  if(!p) return;
  if(ocupado) return; ocupado=true;
  p.baixa_ano=null; p.baixa_mes=null; render(); // otimista
  try{
    const {error}=await db.from("pendentes").update({baixa_ano:null, baixa_mes:null}).eq("id",id); if(error) throw error;
  }catch(e){ toast("Erro ao reabrir: "+(e.message||e), "erro"); carregar(); }
  finally{ ocupado=false; }
}

/** Exclui um item em espera. Oferece "Desfazer" após remover. */
async function removerPendente(id){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const okRem = await confirmDialog({
    titulo: "Remover item em espera",
    mensagem: "Remover este item em espera?",
    textoOk: "Remover",
    perigo: true
  });
  if(!okRem){ ocupado=false; return; }
  const backup = state.pendentes.slice();
  const item = state.pendentes.find(x=>x.id===id);
  state.pendentes = state.pendentes.filter(x=>x.id!==id); render(); // otimista
  try{
    const {error}=await db.from("pendentes").delete().eq("id",id); if(error) throw error;
    if(item){
      toastAcao("Item em espera removido.", "Desfazer", async ()=>{
        try{
          const row={tipo:item.tipo, descricao:item.descricao, categoria:item.categoria, valor:item.valor, venc_dia:item.venc_dia, recorrente:item.recorrente};
          const {data,error:e2}=await db.from("pendentes").insert(row).select(); if(e2) throw e2;
          state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente})));
          render();
        }catch(e){ toast("Erro ao desfazer: "+(e.message||e), "erro"); }
      });
    }
  }catch(e){ toast("Erro ao remover: "+(e.message||e), "erro"); state.pendentes=backup; render(); }
  finally{ ocupado=false; }
}

/* ---------- Saldo inicial / limpeza / importação ---------- */

/** Grava o saldo inicial do mês selecionado. */
async function salvarSaldoInicial(){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const si=parseFloat(document.getElementById("saldoInicial").value);
  const valor=isNaN(si)?0:si;
  try{
    const {error}=await db.from("saldos").upsert({ano:state.ano,mes:state.mes,valor},{onConflict:"ano,mes"});
    if(error) throw error;
    state.saldos[chave(state.ano,state.mes)]=valor;
    render();
  }catch(e){ toast("Erro ao salvar saldo: "+(e.message||e), "erro"); }
  finally{ ocupado=false; }
}

/** Remove todos os lançamentos não-fixos do mês selecionado. */
async function limparMes(){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const okLimpar = await confirmDialog({
    titulo: "Limpar mês",
    mensagem: "Remover TODOS os lançamentos (não-fixos) de "+MESES[state.mes]+"/"+state.ano+"? Esta ação não pode ser desfeita.",
    textoOk: "Remover tudo",
    perigo: true
  });
  if(!okLimpar){ ocupado=false; return; }
  try{
    const {error}=await db.from("lancamentos").delete().eq("ano",state.ano).eq("mes",state.mes);
    if(error) throw error;
    state.lancamentos=state.lancamentos.filter(l=>!(l.ano===state.ano&&l.mes===state.mes));
    render();
  }catch(e){ toast("Erro ao limpar: "+(e.message||e), "erro"); }
  finally{ ocupado=false; }
}

/** Lê um extrato CSV/OFX e importa tudo como itens "em espera". */
async function importarExtrato(file){
  if(!db){ toast("Conecte ao Supabase primeiro.", "erro"); return; }
  if(ocupado) return; ocupado=true;
  let itens;
  try{
    const texto = await file.text();
    itens = parseExtrato(texto).filter(x=>x.valor>0);
  }catch(e){ toast("Não consegui ler o arquivo: "+(e.message||e), "erro"); ocupado=false; return; }
  if(!itens.length){ toast("Nenhum lançamento reconhecido no arquivo. Verifique se é um extrato CSV ou OFX com data, descrição e valor.", "erro"); ocupado=false; return; }
  const nIn=itens.filter(i=>i.tipo==="entrada").length;
  const nOut=itens.filter(i=>i.tipo==="saida").length;
  const okImportar = await confirmDialog({
    titulo: "Importar extrato",
    mensagem: "Foram reconhecidos "+itens.length+" lançamentos ("+nIn+" entradas, "+nOut+" saídas). Importar todos para \"Em espera\"? Depois você classifica, exclui e dá baixa nos que quiser.",
    textoOk: "Importar"
  });
  if(!okImportar){ ocupado=false; return; }
  try{
    const rows=itens.map(i=>({
      tipo:i.tipo, descricao:i.descricao, categoria:"", valor:i.valor,
      venc_dia:(i.dia>=1&&i.dia<=31)?i.dia:null, recorrente:false,
      venc_ano:i.ano||null, venc_mes:(i.mes!=null?i.mes:null)
    }));
    const {data,error}=await db.from("pendentes").insert(rows).select(); if(error) throw error;
    state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,baixa_ano:x.baixa_ano,baixa_mes:x.baixa_mes,venc_ano:x.venc_ano,venc_mes:x.venc_mes})));
    render();
    toast(itens.length+" lançamentos importados para \"Em espera\".");
  }catch(e){ toast("Erro ao importar: "+(e.message||e), "erro"); carregar(); }
  finally{ ocupado=false; }
}
