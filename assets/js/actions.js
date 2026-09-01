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
  if(editandoPend){ await salvarEdicaoPendente(); return; }
  const tipo=document.getElementById("tipo").value;
  const dia=parseInt(document.getElementById("dia").value,10);
  const descricao=document.getElementById("descricao").value.trim();
  const categoria=document.getElementById("categoria").value.trim();
  const valor=parseFloat(document.getElementById("valor").value);
  const rec=document.getElementById("recorrente").checked;
  const emEspera=document.getElementById("emEspera").checked;
  const origem=document.getElementById("marcarImportado").checked?"importado":"manual";
  let parcelas=parseInt(document.getElementById("parcelas").value,10);
  if(isNaN(parcelas)||parcelas<1) parcelas=1;

  if(isNaN(valor)||valor<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  if(!emEspera && (!dia||dia<1||dia>31)){ toast("Informe um dia válido (1 a 31).", "erro"); return; }

  // Em espera: guarda fora do fluxo (dia vira previsão, opcional).
  // Se "Repete todo mês" também estiver marcado, o pendente é mensal (volta após a baixa).
  if(emEspera){
    try{
      const row={tipo, descricao, categoria, valor, venc_dia:(dia>=1&&dia<=31)?dia:null, recorrente:rec, origem};
      const {data,error}=await db.from("pendentes").insert(row).select(); if(error) throw error;
      state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,origem:x.origem||"manual"})));
      document.getElementById("descricao").value="";
      document.getElementById("valor").value="";
      document.getElementById("emEspera").checked=false;
      document.getElementById("recorrente").checked=false;
      document.getElementById("marcarImportado").checked=false;
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
      // Parcelas nascem em "em espera": cada uma só entra no fluxo quando confirmada
      // individualmente (mesmo motivo das contas fixas — não abater antes de acontecer).
      const grupo = (crypto.randomUUID? crypto.randomUUID() : String(Date.now()));
      const rows=[];
      for(let i=0;i<parcelas;i++){
        const alvo=new Date(state.ano, state.mes+i, 1);
        const ano=alvo.getFullYear(), mes=alvo.getMonth();
        const diaAlvo=Math.min(dia, diasNoMes(ano,mes));
        rows.push({grupo, tipo, descricao:(descricao||"(sem descrição)")+" ("+(i+1)+"/"+parcelas+")", categoria, valor,
                   venc_ano:ano, venc_mes:mes, venc_dia:diaAlvo, recorrente:false, origem});
      }
      const {data,error}=await db.from("pendentes").insert(rows).select();
      if(error) throw error;
      state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,origem:x.origem||"manual",venc_ano:x.venc_ano,venc_mes:x.venc_mes,baixa_ano:x.baixa_ano,baixa_mes:x.baixa_mes,grupo:x.grupo||null})));
      toast(parcelas+" parcelas adicionadas em \"Em espera\" — confirme cada uma no quadro quando pagar.");
    }else{
      const row={ano:state.ano,mes:state.mes,dia,tipo,descricao,categoria,valor,origem};
      const {data,error}=await db.from("lancamentos").insert(row).select();
      if(error) throw error;
      state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),origem:x.origem||"manual",origem_recorrente_id:x.origem_recorrente_id||null})));
    }
    document.getElementById("descricao").value="";
    document.getElementById("valor").value="";
    document.getElementById("parcelas").value="1";
    document.getElementById("recorrente").checked=false;
    document.getElementById("marcarImportado").checked=false;
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
  const origem = document.getElementById("marcarImportado").checked?"importado":"manual";
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
          const row={tipo, descricao, categoria, valor, venc_dia:(dia>=1&&dia<=31)?dia:null, recorrente:querRec, origem};
          const {data,error}=await db.from("pendentes").insert(row).select(); if(error) throw error;
          state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,origem:x.origem||"manual"})));
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
          const patch={dia:diaP, tipo, categoria, valor, descricao:(base||"(sem descrição)")+" ("+(i+1)+"/"+total+")", origem};
          const {error}=await db.from("lancamentos").update(patch).eq("id",p.id); if(error) throw error;
          Object.assign(p, patch);
        }
      }else{
        const patch={dia,tipo,descricao,categoria,valor,origem};
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
            const row={ano:item.ano, mes:item.mes, dia:item.dia, tipo:item.tipo, descricao:item.descricao, categoria:item.categoria, valor:item.valor, origem:item.origem||"manual"};
            const {data,error:e2}=await db.from("lancamentos").insert(row).select(); if(e2) throw e2;
            state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),origem:x.origem||"manual",origem_recorrente_id:x.origem_recorrente_id||null})));
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

/**
 * Confirma a conta fixa do mês selecionado numa data escolhida pelo
 * usuário (quadro "A receber / A pagar") — cria o lançamento de verdade
 * (marcado com origem_recorrente_id, pra não confirmar duas vezes).
 * Antes disso ela não entra no fluxo nem abate o saldo.
 */
async function confirmarRecorrente(id, isoData){
  if(!db) return;
  const r = state.recorrentes.find(x=>x.id===id);
  if(!r) return;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoData||"");
  if(!m){ toast("Informe uma data válida.", "erro"); return; }
  const ano=parseInt(m[1],10), mes=parseInt(m[2],10)-1, dia=parseInt(m[3],10);
  if(ocupado) return; ocupado=true;
  try{
    const ov = state.overrides[ovKey(id, state.ano, state.mes)];
    const eff = ov || r;
    const row={ano, mes, dia, tipo:eff.tipo, descricao:eff.descricao, categoria:eff.categoria, valor:eff.valor, origem:"manual", origem_recorrente_id:id};
    const {data,error}=await db.from("lancamentos").insert(row).select(); if(error) throw error;
    state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),origem:x.origem||"manual",origem_recorrente_id:x.origem_recorrente_id||null})));
    render();
    toast("Confirmado em "+String(dia).padStart(2,"0")+"/"+String(mes+1).padStart(2,"0")+"/"+ano+".");
  }catch(e){ toast("Erro ao confirmar: "+(e.message||e), "erro"); }
  finally{ ocupado=false; }
}

/* ---------- Pendentes (em espera) ---------- */

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
    const row={ano, mes, dia, tipo:p.tipo, descricao:p.descricao, categoria:p.categoria, valor:p.valor, origem:p.origem||"manual", grupo:p.grupo||null};
    const {data,error}=await db.from("lancamentos").insert(row).select(); if(error) throw error;
    state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),origem:x.origem||"manual",origem_recorrente_id:x.origem_recorrente_id||null})));
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

/**
 * Lança um pendente direto no fluxo numa data escolhida pelo usuário
 * (quadro "A receber / A pagar") — o recebimento ou pagamento nem
 * sempre cai na data prevista, então a data vem pré-preenchida mas
 * pode ser ajustada antes de confirmar.
 */
async function baixaComData(id, isoData){
  if(!db) return;
  const p = state.pendentes.find(x=>x.id===id);
  if(!p) return;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoData||"");
  if(!m){ toast("Informe uma data válida.", "erro"); return; }
  const ano=parseInt(m[1],10), mes=parseInt(m[2],10)-1, dia=parseInt(m[3],10);
  if(ocupado) return; ocupado=true;
  try{
    const row={ano, mes, dia, tipo:p.tipo, descricao:p.descricao, categoria:p.categoria, valor:p.valor, origem:p.origem||"manual", grupo:p.grupo||null};
    const {data,error}=await db.from("lancamentos").insert(row).select(); if(error) throw error;
    state.lancamentos.push(...data.map(x=>({id:x.id,grupo:x.grupo,ano:x.ano,mes:x.mes,dia:x.dia,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),origem:x.origem||"manual",origem_recorrente_id:x.origem_recorrente_id||null})));
    if(p.recorrente){
      const {error:e2}=await db.from("pendentes").update({baixa_ano:ano, baixa_mes:mes}).eq("id",id); if(e2) throw e2;
      p.baixa_ano=ano; p.baixa_mes=mes;
    }else{
      const {error:e2}=await db.from("pendentes").delete().eq("id",id); if(e2) throw e2;
      state.pendentes=state.pendentes.filter(x=>x.id!==id);
    }
    render();
    toast("Lançado em "+String(dia).padStart(2,"0")+"/"+String(mes+1).padStart(2,"0")+"/"+ano+".");
  }catch(e){ toast("Erro ao dar baixa: "+(e.message||e), "erro"); carregar(); }
  finally{ ocupado=false; }
}

/**
 * Salva a edição de um item em espera. Se "Parcelas" for maior que 1,
 * em vez de só atualizar o pendente, divide ele em N parcelas (também
 * em espera, cada uma com sua própria data prevista), substituindo o
 * pendente original.
 */
async function salvarEdicaoPendente(){
  const tipo=document.getElementById("tipo").value;
  const diaRaw=parseInt(document.getElementById("dia").value,10);
  const descricao=document.getElementById("descricao").value.trim();
  const categoria=document.getElementById("categoria").value.trim();
  const valor=parseFloat(document.getElementById("valor").value);
  const recorrente=document.getElementById("recorrente").checked;
  const origem = document.getElementById("marcarImportado").checked?"importado":"manual";
  let parcelas=parseInt(document.getElementById("parcelas").value,10);
  if(isNaN(parcelas)||parcelas<1) parcelas=1;
  if(isNaN(valor)||valor<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  const {id} = editandoPend;

  if(parcelas>1){
    // Divide o pendente em N parcelas, cada uma esperando sua própria confirmação
    // (mesmo comportamento de criar um lançamento novo já parcelado).
    if(!diaRaw||diaRaw<1||diaRaw>31){ toast("Informe um dia válido (1 a 31) para parcelar.", "erro"); return; }
    const pend = state.pendentes.find(x=>x.id===id);
    const anoBase = (pend && pend.venc_ano!=null) ? pend.venc_ano : state.ano;
    const mesBase = (pend && pend.venc_mes!=null) ? pend.venc_mes : state.mes;
    try{
      const grupo = (crypto.randomUUID? crypto.randomUUID() : String(Date.now()));
      const rows=[];
      for(let i=0;i<parcelas;i++){
        const alvo=new Date(anoBase, mesBase+i, 1);
        const ano=alvo.getFullYear(), mes=alvo.getMonth();
        const diaAlvo=Math.min(diaRaw, diasNoMes(ano,mes));
        rows.push({grupo, tipo, descricao:(descricao||"(sem descrição)")+" ("+(i+1)+"/"+parcelas+")", categoria, valor,
                   venc_ano:ano, venc_mes:mes, venc_dia:diaAlvo, recorrente:false, origem});
      }
      const {data,error}=await db.from("pendentes").insert(rows).select(); if(error) throw error;
      const {error:eDel}=await db.from("pendentes").delete().eq("id",id); if(eDel) throw eDel;
      state.pendentes=state.pendentes.filter(x=>x.id!==id);
      state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,origem:x.origem||"manual",venc_ano:x.venc_ano,venc_mes:x.venc_mes,grupo:x.grupo||null})));
      finalizarEdicao();
      render();
      toast("Dividido em "+parcelas+" parcelas em \"Em espera\".");
    }catch(e){ toast("Erro ao parcelar: "+(e.message||e), "erro"); }
    return;
  }

  const venc_dia = (diaRaw>=1 && diaRaw<=31) ? diaRaw : null;
  try{
    const patch={tipo, descricao, categoria, valor, venc_dia, recorrente, origem};
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

/**
 * Exclui um item em espera. Se for parcela de um grupo com outras
 * parcelas ainda pendentes, oferece excluir só esta ou todas de uma vez.
 * Oferece "Desfazer" após remover uma única (não a exclusão em lote).
 */
async function removerPendente(id){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const item = state.pendentes.find(x=>x.id===id);
  const doGrupo = item && item.grupo ? state.pendentes.filter(p=>p.grupo===item.grupo) : [];
  if(doGrupo.length>1){
    const escolha = await chooseDialog(
      "Esta é uma parcela",
      "Esta compra tem "+doGrupo.length+" parcelas ainda em espera. Remover todas, ou só esta?",
      [
        {label:"Todas as parcelas ("+doGrupo.length+")", value:"todas", estilo:"danger"},
        {label:"Só esta parcela", value:"esta", estilo:"ghost"},
        {label:"Cancelar", value:"cancelar", estilo:"ghost"}
      ]
    );
    if(escolha==="cancelar" || !escolha){ ocupado=false; return; }
    if(escolha==="todas"){
      const backup = state.pendentes.slice();
      const idsGrupo = doGrupo.map(p=>p.id);
      state.pendentes = state.pendentes.filter(p=>p.grupo!==item.grupo); render(); // otimista
      try{
        const {error}=await db.from("pendentes").delete().in("id", idsGrupo); if(error) throw error;
        toast(doGrupo.length+" parcelas removidas.");
      }catch(e){ toast("Erro ao remover: "+(e.message||e), "erro"); state.pendentes=backup; render(); }
      finally{ ocupado=false; }
      return;
    }
    // escolha==="esta": segue o fluxo normal abaixo
  }else{
    const okRem = await confirmDialog({
      titulo: "Remover item em espera",
      mensagem: "Remover este item em espera?",
      textoOk: "Remover",
      perigo: true
    });
    if(!okRem){ ocupado=false; return; }
  }
  const backup = state.pendentes.slice();
  state.pendentes = state.pendentes.filter(x=>x.id!==id); render(); // otimista
  try{
    const {error}=await db.from("pendentes").delete().eq("id",id); if(error) throw error;
    if(item){
      toastAcao("Item em espera removido.", "Desfazer", async ()=>{
        try{
          const row={tipo:item.tipo, descricao:item.descricao, categoria:item.categoria, valor:item.valor, venc_dia:item.venc_dia, recorrente:item.recorrente, origem:item.origem||"manual", venc_ano:item.venc_ano||null, venc_mes:item.venc_mes!=null?item.venc_mes:null, grupo:item.grupo||null};
          const {data,error:e2}=await db.from("pendentes").insert(row).select(); if(e2) throw e2;
          state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,origem:x.origem||"manual",venc_ano:x.venc_ano,venc_mes:x.venc_mes,grupo:x.grupo||null})));
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

/* ---------- Checkpoint: detecta o que do extrato já está no sistema ---------- */

/** "Impressão digital" de um lançamento, para comparar o que vem do arquivo com o que já existe. */
function fingerprintItem(tipo, ano, mes, dia, valor, descricao){
  return [tipo, ano, mes, dia, Number(valor).toFixed(2), String(descricao||"").trim().toLowerCase()].join("|");
}

/** Conta quantas vezes cada "impressão digital" já aparece em pendentes + lançamentos. */
function mapaExistentes(){
  const mapa = {};
  const soma = (tipo,ano,mes,dia,valor,descricao)=>{
    if(ano==null || mes==null || !dia) return;
    const fp = fingerprintItem(tipo,ano,mes,dia,valor,descricao);
    mapa[fp] = (mapa[fp]||0)+1;
  };
  state.pendentes.forEach(p=> soma(p.tipo, p.venc_ano, p.venc_mes, p.venc_dia, p.valor, p.descricao));
  state.lancamentos.forEach(l=> soma(l.tipo, l.ano, l.mes, l.dia, l.valor, l.descricao));
  return mapa;
}

/**
 * Marca cada item como "duplicata" (já parece existir em pendentes/lançamentos)
 * ou não. Usa a mesma impressão digital uma única vez por ocorrência real já
 * cadastrada, então dois lançamentos iguais no arquivo só são marcados como
 * duplicata se já existirem duas vezes no sistema.
 */
function marcaDuplicatas(itens){
  const mapa = mapaExistentes();
  return itens.map(it=>{
    if(it.ano==null || it.mes==null || !it.dia) return Object.assign({}, it, {duplicata:false});
    const fp = fingerprintItem(it.tipo, it.ano, it.mes, it.dia, it.valor, it.descricao);
    if(mapa[fp]>0){ mapa[fp]--; return Object.assign({}, it, {duplicata:true}); }
    return Object.assign({}, it, {duplicata:false});
  });
}

/**
 * Modal para escolher o período (De/Até) a importar de um extrato já lido,
 * com um checkpoint mostrando quais lançamentos já parecem estar no sistema
 * (mesma data, tipo, valor e descrição em algum pendente ou lançamento) —
 * útil pra saber o que já foi importado antes e não importar de novo.
 * Itens sem data reconhecida no arquivo sempre entram (não dá pra comparar
 * nem filtrar por período). Resolve com a lista a importar, ou null se
 * cancelado.
 */
function selecionarPeriodoImportacao(itens){
  const isoDe = i => i.ano+"-"+String(i.mes+1).padStart(2,"0")+"-"+String(i.dia).padStart(2,"0");
  const comData = itens.filter(i=> i.dia>=1 && i.dia<=31 && i.mes!=null && i.ano);
  const semData = itens.filter(i=> !(i.dia>=1 && i.dia<=31 && i.mes!=null && i.ano));
  if(!comData.length) return Promise.resolve(itens); // nada tem data: não há o que filtrar nem comparar

  const datasIso = comData.map(isoDe);
  const minData = datasIso.reduce((a,b)=> a<b?a:b);
  const maxData = datasIso.reduce((a,b)=> a>b?a:b);
  const brDe = iso=>{ const [a,m,d]=iso.split("-"); return d+"/"+m+"/"+a; };

  return new Promise(resolve=>{
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dlg-overlay";
    overlay.innerHTML =
      '<div class="modal dlg-modal" style="max-width:580px">'+
        '<div class="modal-head"><h3>Importar extrato</h3></div>'+
        '<div class="dlg-body">'+
          '<div class="hint" style="margin:0 0 14px">O arquivo tem lançamentos de <strong>'+brDe(minData)+'</strong> a <strong>'+brDe(maxData)+'</strong>. Escolha o período que quer importar agora — o resto do arquivo pode ser importado depois, em outra vez.</div>'+
          '<div class="row">'+
            '<div class="field"><label for="impDe">De</label><input type="date" id="impDe" value="'+minData+'" min="'+minData+'" max="'+maxData+'"></div>'+
            '<div class="field"><label for="impAte">Até</label><input type="date" id="impAte" value="'+maxData+'" min="'+minData+'" max="'+maxData+'"></div>'+
          '</div>'+
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:12px">'+
            '<input type="checkbox" id="impPularDup" checked style="width:auto"> Pular os que já parecem estar no sistema (checkpoint)'+
          '</label>'+
          (semData.length ? '<div class="hint" style="margin-top:10px">+ '+semData.length+' lançamento(s) sem data reconhecida no arquivo — sempre incluídos, sem checkpoint.</div>' : '')+
          '<div class="hint" id="impContagem" style="margin-top:10px;font-weight:700;color:var(--text)"></div>'+
          '<div id="impLista" class="imp-lista"></div>'+
        '</div>'+
        '<div class="dlg-acoes">'+
          '<button type="button" class="btn-ghost" data-act="cancelar">Cancelar</button>'+
          '<button type="button" class="btn-primary" data-act="ok">Importar</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);
    const inDe = overlay.querySelector("#impDe");
    const inAte = overlay.querySelector("#impAte");
    const inPular = overlay.querySelector("#impPularDup");
    const contagem = overlay.querySelector("#impContagem");
    const lista = overlay.querySelector("#impLista");
    const filtrar = ()=>{
      let de = inDe.value||minData, ate = inAte.value||maxData;
      if(de>ate){ [de,ate]=[ate,de]; }
      const noPeriodo = comData.filter(i=>{ const d=isoDe(i); return d>=de && d<=ate; });
      const marcados = marcaDuplicatas(noPeriodo).sort((a,b)=>a.dia-b.dia);
      const pular = inPular.checked;
      const aImportar = marcados.filter(it=> !(pular && it.duplicata)).concat(semData);
      const nDup = marcados.filter(it=>it.duplicata).length;
      const nIn = aImportar.filter(i=>i.tipo==="entrada").length;
      const nOut = aImportar.length-nIn;
      contagem.textContent = aImportar.length+" serão importados ("+nIn+" entradas, "+nOut+" saídas)"+
        (nDup ? " · "+nDup+" já no sistema"+(pular?" (ignorados)":"") : "")+".";
      lista.innerHTML = marcados.map(it=>
        '<div class="imp-row'+(it.duplicata?" imp-dup":"")+'">'+
          '<span class="imp-dia">dia '+String(it.dia).padStart(2,"0")+'</span>'+
          '<span class="imp-desc">'+escapeHtml(it.descricao||"(sem descrição)")+'</span>'+
          '<span class="imp-val '+(it.tipo==="entrada"?"in":"out")+'">'+fmt(Number(it.valor))+'</span>'+
          '<span class="imp-tag">'+(it.duplicata?"✅ já no sistema":"🆕 novo")+'</span>'+
        '</div>'
      ).join("") || '<div class="rank-empty">Nenhum lançamento neste período.</div>';
      return aImportar;
    };
    filtrar();
    inDe.addEventListener("change", filtrar);
    inAte.addEventListener("change", filtrar);
    inPular.addEventListener("change", filtrar);
    const fechar = (v)=>{ overlay.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = e=>{ if(e.key==="Escape") fechar(null); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) fechar(null); });
    overlay.querySelector('[data-act="cancelar"]').addEventListener("click", ()=>fechar(null));
    overlay.querySelector('[data-act="ok"]').addEventListener("click", ()=>{
      fechar(filtrar());
    });
  });
}

/** Lê um extrato CSV/OFX e importa o período escolhido como itens "em espera". */
async function importarExtrato(file){
  if(!db){ toast("Conecte ao Supabase primeiro.", "erro"); return; }
  if(ocupado) return; ocupado=true;
  let itens;
  try{
    const texto = await file.text();
    itens = parseExtrato(texto).filter(x=>x.valor>0);
  }catch(e){ toast("Não consegui ler o arquivo: "+(e.message||e), "erro"); ocupado=false; return; }
  if(!itens.length){ toast("Nenhum lançamento reconhecido no arquivo. Verifique se é um extrato CSV ou OFX com data, descrição e valor.", "erro"); ocupado=false; return; }
  const selecionados = await selecionarPeriodoImportacao(itens);
  if(!selecionados){ ocupado=false; return; }
  if(!selecionados.length){ toast("Nenhum lançamento no período escolhido.", "erro"); ocupado=false; return; }
  try{
    const rows=selecionados.map(i=>({
      tipo:i.tipo, descricao:i.descricao, categoria:"", valor:i.valor,
      venc_dia:(i.dia>=1&&i.dia<=31)?i.dia:null, recorrente:false,
      venc_ano:i.ano||null, venc_mes:(i.mes!=null?i.mes:null), origem:"importado"
    }));
    const {data,error}=await db.from("pendentes").insert(rows).select(); if(error) throw error;
    state.pendentes.push(...data.map(x=>({id:x.id,tipo:x.tipo,descricao:x.descricao,categoria:x.categoria,valor:Number(x.valor),venc_dia:x.venc_dia,recorrente:!!x.recorrente,baixa_ano:x.baixa_ano,baixa_mes:x.baixa_mes,venc_ano:x.venc_ano,venc_mes:x.venc_mes,origem:x.origem||"importado"})));
    render();
    toast(selecionados.length+" lançamentos importados para \"Em espera\".");
  }catch(e){ toast("Erro ao importar: "+(e.message||e), "erro"); carregar(); }
  finally{ ocupado=false; }
}
