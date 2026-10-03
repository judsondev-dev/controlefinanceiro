/* =====================================================================
   Tela "Agenda": o mês dia a dia, com o saldo previsto. O que já foi
   pago aparece cheio; o que ainda vai vencer, tracejado — assim dá pra
   ver onde o dinheiro aperta ANTES de acontecer.
   ===================================================================== */
"use strict";

function renderAgenda(){
  const tl = timelineMes(state.ano, state.mes);
  const h = hojeISO();
  const soAbertos = state.agendaFiltro==="abertos";
  const alerta = tl.menor.valor<0
    ? '<div class="alerta">⚠ O saldo previsto fica negativo'+(tl.menor.data?' a partir de <b>'+dataBR(tl.menor.data)+'</b>':' desde o início do mês')+' (menor ponto: <b>'+fmt(tl.menor.valor)+'</b>).</div>' : "";

  const dias = tl.dias.map(d=>{
    const itens = soAbertos ? d.itens.filter(t=>t.status==="aberto") : d.itens;
    if(!itens.length) return "";
    return '<div class="dia'+(d.data===h?" hoje":"")+(d.saldo<0?" neg":"")+'">'+
      '<div class="dia-cab"><div class="dia-data"><b>'+diaSemana(d.data)+' '+dataCurta(d.data)+'</b>'+(d.data===h?' <span class="tag hoje">hoje</span>':"")+'</div>'+
      '<div class="dia-saldo" title="Saldo previsto ao fim do dia">'+fmt(d.saldo)+'</div></div>'+
      itens.map(t=>'<div class="ag-item '+t.status+'" data-id="'+t.id+'">'+
        '<span class="ag-st" title="'+(t.status==="pago"?"já aconteceu":"ainda vai acontecer")+'">'+(t.status==="pago"?"●":"○")+'</span>'+
        '<span class="ag-desc">'+escapeHtml(t.descricao)+'</span><span class="t-tags">'+tagsDe(t)+'</span>'+
        '<span class="ag-valor '+(t.tipo==="entrada"?"in":"out")+'">'+(t.tipo==="entrada"?"+":"−")+fmt(valorEf(t))+'</span></div>').join("")+
    '</div>';
  }).join("");

  document.getElementById("viewAgenda").innerHTML =
    '<div class="kpis">'+
      '<div class="kpi"><div class="kpi-l">Saldo previsto no início</div><div class="kpi-v '+(tl.b0<0?"neg":"")+'">'+fmt(tl.b0)+'</div>'+
        '<div class="kpi-s">'+(tl.atrasadosQtd ? 'inclui '+tl.atrasadosQtd+' em aberto de meses anteriores ('+fmt(tl.atrasadosTotal)+')' : 'saldo real do fim do mês anterior')+'</div></div>'+
      '<div class="kpi in"><div class="kpi-l">Entradas</div><div class="kpi-v">'+fmt(tl.entradas)+'</div></div>'+
      '<div class="kpi out"><div class="kpi-l">Saídas</div><div class="kpi-v">'+fmt(tl.saidas)+'</div></div>'+
      '<div class="kpi"><div class="kpi-l">Saldo final previsto</div><div class="kpi-v '+(tl.final<0?"neg":"pos")+'">'+fmt(tl.final)+'</div>'+
        '<div class="kpi-s">menor ponto: '+fmt(tl.menor.valor)+'</div></div>'+
    '</div>'+alerta+
    '<div class="barra-filtro"><div class="seg seg-mini">'+
      '<label class="seg-op"><input type="radio" name="agf" value="tudo"'+(!soAbertos?" checked":"")+'><span>Tudo</span></label>'+
      '<label class="seg-op"><input type="radio" name="agf" value="abertos"'+(soAbertos?" checked":"")+'><span>Só em aberto</span></label></div>'+
      '<span class="legenda"><b>●</b> já aconteceu &nbsp; <b>○</b> ainda vai acontecer</span></div>'+
    (dias || '<div class="vazio">Nada neste mês.</div>');
}

function ligarAgenda(){
  const el = document.getElementById("viewAgenda");
  el.addEventListener("click", e=>{ const it = e.target.closest(".ag-item"); if(it) abrirForm(it.dataset.id); });
  el.addEventListener("change", e=>{ if(e.target.name==="agf"){ state.agendaFiltro = e.target.value; render(); } });
}
