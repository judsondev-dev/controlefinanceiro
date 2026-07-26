/* =====================================================================
   Orçamento por categoria — limite mensal de gasto, com barra de
   progresso e alerta quando o mês selecionado ultrapassa o limite.
   Considera apenas saídas (não faz sentido limitar entradas).
   ===================================================================== */
"use strict";

/** Orçamento configurado para uma categoria (comparação sem diferenciar maiúsculas). */
function orcamentoDe(categoria){
  const alvo = String(categoria||"").trim().toLowerCase();
  return state.orcamentos.find(o => o.categoria.trim().toLowerCase()===alvo);
}

/** Total gasto (saídas) de uma categoria no mês informado (padrão: mês selecionado). */
function gastoCategoriaMes(categoria, ano, mes){
  return lancamentosDoMes(ano, mes)
    .filter(it => it.tipo==="saida" && !it.pulado && catDe(it)===categoria)
    .reduce((s,it)=> s+Number(it.valor), 0);
}

/** Cria ou atualiza (por categoria) o orçamento informado no formulário. */
async function salvarOrcamento(){
  if(!db){ toast("Conecte ao Supabase primeiro.", "erro"); return; }
  const categoria = document.getElementById("orcCategoria").value.trim();
  const limite = parseFloat(document.getElementById("orcLimite").value);
  if(!categoria){ toast("Informe a categoria.", "erro"); return; }
  if(isNaN(limite) || limite<=0){ toast("Informe um limite maior que zero.", "erro"); return; }
  if(ocupado) return; ocupado=true;
  try{
    const existente = orcamentoDe(categoria);
    if(existente){
      const {error} = await db.from("orcamentos").update({limite}).eq("id", existente.id);
      if(error) throw error;
      existente.limite = limite;
    }else{
      const {data,error} = await db.from("orcamentos").insert({categoria, limite}).select();
      if(error) throw error;
      state.orcamentos.push({id:data[0].id, categoria:data[0].categoria, limite:Number(data[0].limite)});
    }
    document.getElementById("orcCategoria").value = "";
    document.getElementById("orcLimite").value = "";
    render();
    toast("Orçamento salvo.");
  }catch(e){ toast("Erro ao salvar orçamento: "+(e.message||e), "erro"); }
  finally{ ocupado=false; }
}

/** Remove um orçamento. */
async function removerOrcamento(id){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const backup = state.orcamentos.slice();
  state.orcamentos = state.orcamentos.filter(o=>o.id!==id); render(); // otimista
  try{
    const {error} = await db.from("orcamentos").delete().eq("id", id);
    if(error) throw error;
    toast("Orçamento removido.");
  }catch(e){ toast("Erro ao remover orçamento: "+(e.message||e), "erro"); state.orcamentos=backup; render(); }
  finally{ ocupado=false; }
}

/** Desenha a lista de orçamentos (barra de progresso) e o alerta de estouro. */
function renderOrcamentos(){
  const cont = document.getElementById("orcamentosLista");
  if(!cont) return;
  const alerta = document.getElementById("orcAlerta");
  if(!state.orcamentos.length){
    cont.innerHTML = '<div class="rank-empty">Nenhum orçamento definido.</div>';
    if(alerta){ alerta.classList.remove("show"); alerta.innerHTML=""; }
    return;
  }
  const estourados = [];
  let html = '<ul class="orc-list">';
  state.orcamentos.slice().sort((a,b)=>a.categoria.localeCompare(b.categoria, "pt-BR")).forEach(o=>{
    const gasto = gastoCategoriaMes(o.categoria, state.ano, state.mes);
    const pct = Math.min(100, Math.round(gasto/o.limite*100));
    const estourou = gasto>o.limite;
    if(estourou) estourados.push(o.categoria);
    const corBarra = estourou ? "out" : (pct>=80 ? "warn" : "in");
    html +=
      '<li>'+
        '<div class="orc-top">'+
          '<span class="orc-cat">'+escapeHtml(o.categoria)+'</span>'+
          '<span class="orc-acoes">'+
            '<span class="edit-x orc-edit" title="Editar" data-id="'+o.id+'" data-cat="'+encodeURIComponent(o.categoria)+'" data-lim="'+o.limite+'">✎</span>'+
            '<span class="del-x orc-del" title="Remover" data-id="'+o.id+'">✕</span>'+
          '</span>'+
        '</div>'+
        '<div class="orc-vals"><span class="'+(estourou?"neg-txt":"")+'">'+fmt(gasto)+'</span><span class="muted-txt"> de '+fmt(o.limite)+' ('+pct+'%)</span></div>'+
        '<div class="bar orc-bar"><span class="'+corBarra+'" style="width:'+pct+'%"></span></div>'+
      '</li>';
  });
  html += '</ul>';
  cont.innerHTML = html;
  if(alerta){
    if(estourados.length){
      alerta.classList.add("show");
      alerta.innerHTML = "⚠️ <strong>Orçamento estourado</strong> em "+estourados.length+" categoria(s) em "+MESES[state.mes]+"/"+state.ano+": "+estourados.map(escapeHtml).join(", ")+".";
    }else{ alerta.classList.remove("show"); alerta.innerHTML=""; }
  }
}
