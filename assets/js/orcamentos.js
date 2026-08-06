/* =====================================================================
   Metas e compromissos por categoria — um valor mensal a cumprir,
   com barra de progresso e aviso quando a meta é atingida.
   Funciona tanto para saída (ex.: limite de gasto) quanto para
   entrada (ex.: "quero investir/aportar até R$ 300 no mês") — o
   progresso soma só os lançamentos da categoria com o mesmo tipo
   da meta, no mês selecionado.
   ===================================================================== */
"use strict";

/** Meta configurada para uma categoria+tipo (comparação sem diferenciar maiúsculas). */
function orcamentoDe(categoria, tipo){
  const alvo = String(categoria||"").trim().toLowerCase();
  return state.orcamentos.find(o => o.categoria.trim().toLowerCase()===alvo && o.tipo===tipo);
}

/** Total já feito (entradas ou saídas, conforme o tipo) de uma categoria no mês informado. */
function progressoCategoriaMes(categoria, tipo, ano, mes){
  return lancamentosDoMes(ano, mes)
    .filter(it => it.tipo===tipo && !it.pulado && catDe(it)===categoria)
    .reduce((s,it)=> s+Number(it.valor), 0);
}

/** Cria ou atualiza (por categoria+tipo) a meta informada no formulário. */
async function salvarOrcamento(){
  if(!db){ toast("Conecte ao Supabase primeiro.", "erro"); return; }
  const categoria = document.getElementById("orcCategoria").value.trim();
  const tipo = document.getElementById("orcTipo").value;
  const limite = parseFloat(document.getElementById("orcLimite").value);
  if(!categoria){ toast("Informe a categoria.", "erro"); return; }
  if(isNaN(limite) || limite<=0){ toast("Informe um valor maior que zero.", "erro"); return; }
  if(ocupado) return; ocupado=true;
  try{
    const existente = orcamentoDe(categoria, tipo);
    if(existente){
      const {error} = await db.from("orcamentos").update({limite}).eq("id", existente.id);
      if(error) throw error;
      existente.limite = limite;
    }else{
      const {data,error} = await db.from("orcamentos").insert({categoria, tipo, limite}).select();
      if(error) throw error;
      state.orcamentos.push({id:data[0].id, categoria:data[0].categoria, tipo:data[0].tipo, limite:Number(data[0].limite)});
    }
    document.getElementById("orcCategoria").value = "";
    document.getElementById("orcLimite").value = "";
    render();
    toast("Meta salva.");
  }catch(e){ toast("Erro ao salvar meta: "+(e.message||e), "erro"); }
  finally{ ocupado=false; }
}

/** Remove uma meta. */
async function removerOrcamento(id){
  if(!db) return;
  if(ocupado) return; ocupado=true;
  const backup = state.orcamentos.slice();
  state.orcamentos = state.orcamentos.filter(o=>o.id!==id); render(); // otimista
  try{
    const {error} = await db.from("orcamentos").delete().eq("id", id);
    if(error) throw error;
    toast("Meta removida.");
  }catch(e){ toast("Erro ao remover meta: "+(e.message||e), "erro"); state.orcamentos=backup; render(); }
  finally{ ocupado=false; }
}

/** Desenha a lista de metas (barra de progresso) e o aviso de metas atingidas. */
function renderOrcamentos(){
  const cont = document.getElementById("orcamentosLista");
  if(!cont) return;
  const alerta = document.getElementById("orcAlerta");
  if(!state.orcamentos.length){
    cont.innerHTML = '<div class="rank-empty">Nenhuma meta definida.</div>';
    if(alerta){ alerta.classList.remove("show"); alerta.innerHTML=""; }
    return;
  }
  const atingidas = [];
  let html = '<ul class="orc-list">';
  state.orcamentos.slice()
    .sort((a,b)=> a.categoria.localeCompare(b.categoria,"pt-BR") || a.tipo.localeCompare(b.tipo))
    .forEach(o=>{
      const progresso = progressoCategoriaMes(o.categoria, o.tipo, state.ano, state.mes);
      const pct = Math.min(100, Math.round(progresso/o.limite*100));
      const atingiu = progresso>=o.limite;
      if(atingiu) atingidas.push(o.categoria);
      const corBarra = atingiu ? "in" : (pct>=80 ? "warn" : "prog");
      const tipoLbl = o.tipo==="entrada" ? "entrada" : "saída";
      html +=
        '<li>'+
          '<div class="orc-top">'+
            '<span class="orc-cat">'+escapeHtml(o.categoria)+' <span class="pill '+(o.tipo==="entrada"?"in":"out")+'">'+tipoLbl+'</span></span>'+
            '<span class="orc-acoes">'+
              '<span class="edit-x orc-edit" title="Editar" data-id="'+o.id+'" data-cat="'+encodeURIComponent(o.categoria)+'" data-tipo="'+o.tipo+'" data-lim="'+o.limite+'">✎</span>'+
              '<span class="del-x orc-del" title="Remover" data-id="'+o.id+'">✕</span>'+
            '</span>'+
          '</div>'+
          '<div class="orc-vals"><span class="'+(atingiu?"pos-txt":"")+'">'+fmt(progresso)+'</span><span class="muted-txt"> de '+fmt(o.limite)+' ('+pct+'%)</span>'+(atingiu?' <span class="tag ok">✓ meta atingida</span>':'')+'</div>'+
          '<div class="bar orc-bar"><span class="'+corBarra+'" style="width:'+pct+'%"></span></div>'+
        '</li>';
    });
  html += '</ul>';
  cont.innerHTML = html;
  if(alerta){
    if(atingidas.length){
      alerta.classList.add("show");
      alerta.innerHTML = "🎉 <strong>Meta atingida</strong> em "+atingidas.length+" categoria(s) em "+MESES[state.mes]+"/"+state.ano+": "+atingidas.map(escapeHtml).join(", ")+".";
    }else{ alerta.classList.remove("show"); alerta.innerHTML=""; }
  }
}
