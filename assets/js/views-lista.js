/* =====================================================================
   Tela "Todas as contas": lista completa de títulos com busca e
   filtros (situação, tipo, conta, pessoa, natureza e período), e atalho
   para incluir uma nova conta.
   ===================================================================== */
"use strict";

const lista = {busca:"", status:"aberto", tipo:"", conta:"", pessoa:"", natureza:"", periodo:"tudo", limite:150};

function natureza(t){ return t.recorrencia_id ? "mensal" : (t.parcelas>1 ? "parcelada" : "avulsa"); }

function filtrarLista(){
  const ini = iniMes(state.ano,state.mes), fim = fimMes(state.ano,state.mes);
  const q = norm(lista.busca);
  return state.titulos.filter(t=>{
    if(lista.status && t.status!==lista.status) return false;
    if(lista.tipo && t.tipo!==lista.tipo) return false;
    if(lista.conta && (lista.conta==="-" ? t.conta_id : t.conta_id!==lista.conta)) return false;
    if(lista.pessoa && (lista.pessoa==="-" ? t.pessoa : t.pessoa!==lista.pessoa)) return false;
    if(lista.natureza && natureza(t)!==lista.natureza) return false;
    if(lista.periodo==="mes"){
      const d = t.status==="pago" ? t.pago_em : t.vencimento;
      if(d<ini || d>fim) return false;
    }
    if(q && !norm(t.descricao+" "+(t.categoria||"")+" "+(t.pessoa||"")).includes(q)) return false;
    return true;
  }).sort((a,b)=>{
    const da = a.status==="pago" ? a.pago_em : a.vencimento, db_ = b.status==="pago" ? b.pago_em : b.vencimento;
    return lista.status==="pago" ? (da<db_?1:-1) : (da<db_?-1:da>db_?1:0);
  });
}

const ROTULO_STATUS = {aberto:'<span class="st st-aberto">em aberto</span>', pago:'<span class="st st-pago">pago</span>', cancelado:'<span class="st st-canc">pulado</span>'};

function renderListaResultado(){
  const todos = filtrarLista(), vis = todos.slice(0, lista.limite), h = hojeISO();
  const ent = soma(todos.filter(t=>t.tipo==="entrada"), valorEf), sai = soma(todos.filter(t=>t.tipo==="saida"), valorEf);
  const linhas = vis.map(t=>{
    const c = t.conta_id && contaPorId(t.conta_id);
    const data = t.status==="pago" ? t.pago_em : t.vencimento;
    const atras = t.status==="aberto" && t.vencimento<h;
    return '<tr class="l-row" data-id="'+t.id+'"><td class="nowrap'+(atras?" neg":"")+'">'+dataBR(data)+(atras?' <small>⏰</small>':"")+'</td>'+
      '<td><div class="t-desc">'+escapeHtml(t.descricao)+'</div><div class="t-tags">'+tagsDe(t)+'</div></td>'+
      '<td class="muted">'+(c?escapeHtml(c.nome):"—")+'</td>'+
      '<td class="num '+(t.tipo==="entrada"?"in":"out")+'">'+(t.tipo==="entrada"?"+":"−")+fmt(valorEf(t))+'</td>'+
      '<td>'+ROTULO_STATUS[t.status]+'</td><td><button type="button" class="btn-mais" data-mais>⋯</button></td></tr>';
  }).join("");
  document.getElementById("listaRes").innerHTML =
    '<div class="barra-filtro"><div><b>'+todos.length+'</b> conta(s) · <span class="in">a receber/recebido '+fmt(ent)+'</span> · <span class="out">a pagar/pago '+fmt(sai)+'</span></div></div>'+
    (vis.length ? '<div class="tabela"><table><thead><tr><th>Data</th><th>Conta</th><th>Onde</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>'+linhas+'</tbody></table></div>'
      : '<div class="vazio">Nada encontrado com esses filtros.</div>')+
    (todos.length>vis.length ? '<div style="text-align:center;margin-top:12px"><button type="button" class="btn-ghost" id="listaMais">Mostrar mais ('+(todos.length-vis.length)+' restantes)</button></div>' : "");
}

function renderLista(){
  const sel = (id, atual, ops) => '<select id="'+id+'">'+ops.map(o=>'<option value="'+escapeHtml(o[0])+'"'+(String(atual)===String(o[0])?" selected":"")+'>'+escapeHtml(o[1])+'</option>').join("")+'</select>';
  document.getElementById("viewLista").innerHTML =
    '<div class="flex-sp"><h2 class="sec-t">Todas as contas</h2><button type="button" class="btn-primary btn-sm" id="listaNova">+ Incluir conta</button></div>'+
    '<div class="panel-simples filtros">'+
      '<div class="field grow"><label>Buscar</label><input id="listaBusca" type="search" placeholder="Descrição, categoria ou pessoa" value="'+escapeHtml(lista.busca)+'"></div>'+
      '<div class="field"><label>Situação</label>'+sel("fStatus", lista.status, [["","Todas"],["aberto","Em aberto"],["pago","Pagas/recebidas"],["cancelado","Puladas"]])+'</div>'+
      '<div class="field"><label>Tipo</label>'+sel("fTipo", lista.tipo, [["","A pagar e a receber"],["saida","A pagar"],["entrada","A receber"]])+'</div>'+
      '<div class="field"><label>Natureza</label>'+sel("fNat", lista.natureza, [["","Todas"],["mensal","Mensais (fixas)"],["parcelada","Parceladas"],["avulsa","Avulsas"]])+'</div>'+
      '<div class="field"><label>Conta</label>'+sel("fConta", lista.conta, [["","Todas"],["-","(sem conta)"],...state.contas.map(c=>[c.id,c.nome])])+'</div>'+
      '<div class="field"><label>Pessoa</label>'+sel("fPessoa", lista.pessoa, [["","Todas"],["-","(sem pessoa)"],...valoresUsados("pessoa").map(p=>[p,p])])+'</div>'+
      '<div class="field"><label>Período</label>'+sel("fPeriodo", lista.periodo, [["tudo","Todos os meses"],["mes","Só "+MESES[state.mes]+"/"+state.ano]])+'</div>'+
    '</div><div id="listaRes"></div>';
  renderListaResultado();
}

function ligarLista(){
  const el = document.getElementById("viewLista");
  const mapa = {fStatus:"status", fTipo:"tipo", fNat:"natureza", fConta:"conta", fPessoa:"pessoa", fPeriodo:"periodo"};
  el.addEventListener("change", e=>{ if(mapa[e.target.id]){ lista[mapa[e.target.id]] = e.target.value; lista.limite = 150; renderListaResultado(); } });
  el.addEventListener("input", e=>{ if(e.target.id==="listaBusca"){ lista.busca = e.target.value; lista.limite = 150; renderListaResultado(); } });
  el.addEventListener("click", e=>{
    if(e.target.id==="listaNova") return abrirForm();
    if(e.target.id==="listaMais"){ lista.limite += 150; return renderListaResultado(); }
    const tr = e.target.closest(".l-row"); if(!tr) return;
    if(e.target.closest("[data-mais]")) acaoMenu(tr.dataset.id); else abrirForm(tr.dataset.id);
  });
}
