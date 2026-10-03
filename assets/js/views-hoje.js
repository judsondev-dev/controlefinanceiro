/* =====================================================================
   Tela "Hoje": saldo real, A receber × A pagar do mês (com atrasados)
   e baixa direta com data editável.
   ===================================================================== */
"use strict";

function tagsDe(t){
  const x = [];
  if(t.parcelas>1) x.push('<span class="tag parc">'+t.parcela+'/'+t.parcelas+'</span>');
  if(t.recorrencia_id) x.push('<span class="tag rec">🔁 mensal</span>');
  if(t.origem==="importado") x.push('<span class="tag imp">📥 importado</span>');
  if(t.pessoa) x.push('<span class="tag pes">👤 '+escapeHtml(t.pessoa)+'</span>');
  const c = t.conta_id && contaPorId(t.conta_id);
  if(c && (c.tipo==="cartao" || state.contas.filter(k=>k.tipo!=="cartao").length>1)) x.push('<span class="tag cnt">'+(c.tipo==="cartao"?"💳 ":"")+escapeHtml(c.nome)+'</span>');
  if(t.categoria) x.push('<span class="tag cat">'+escapeHtml(t.categoria)+'</span>');
  return x.join("");
}

function linhaAberta(t, ini){
  const venceHoje = t.vencimento===hojeISO();
  const quando = t.vencimento < hojeISO()
    ? '<span class="tag atr">⏰ venceu em '+dataCurta(t.vencimento)+(t.vencimento<ini?" (mês anterior)":"")+'</span>'
    : '<span class="quando'+(venceHoje?" hoje":"")+'">'+(venceHoje?"vence hoje":"vence "+dataCurta(t.vencimento))+'</span>';
  return '<div class="t-row'+(t.vencimento<hojeISO()?" vencido":"")+'" data-id="'+t.id+'">'+
    '<div class="t-main"><div class="t-desc">'+escapeHtml(t.descricao)+'</div><div class="t-tags">'+quando+tagsDe(t)+'</div></div>'+
    '<div class="t-valor '+(t.tipo==="entrada"?"in":"out")+'">'+fmt(t.valor)+'</div>'+
    '<div class="t-act">'+
      '<input type="date" class="t-data" value="'+t.vencimento+'" title="Data em que '+(t.tipo==="entrada"?"recebeu":"pagou")+'">'+
      '<button type="button" class="btn-baixa '+(t.tipo==="entrada"?"in":"out")+'" title="'+(t.tipo==="entrada"?"Dar baixa — recebido":"Dar baixa — pago")+'">✓ <span>'+(t.tipo==="entrada"?"Recebi":"Paguei")+'</span></button>'+
      '<button type="button" class="btn-mais" title="Mais opções">⋯</button>'+
    '</div></div>';
}

function linhaFechada(t){
  const quando = t.status==="pago" ? (t.tipo==="entrada"?"recebido":"pago")+" em "+dataCurta(t.pago_em) : "pulado";
  const dif = (t.status==="pago" && Math.abs(valorEf(t)-t.valor)>0.004) ? ' <small>(previsto '+fmt(t.valor)+')</small>' : "";
  return '<div class="t-row fechada" data-id="'+t.id+'">'+
    '<div class="t-main"><div class="t-desc">'+escapeHtml(t.descricao)+'</div><div class="t-tags"><span class="quando">'+quando+'</span>'+tagsDe(t)+'</div></div>'+
    '<div class="t-valor '+(t.tipo==="entrada"?"in":"out")+'">'+fmt(valorEf(t))+dif+'</div>'+
    '<div class="t-act">'+
      (t.status==="pago" ? '<button type="button" class="btn-ghost btn-sm btn-reabrir" title="Voltar para em aberto">↺ Reabrir</button>'
                         : '<button type="button" class="btn-ghost btn-sm btn-restaurar">↺ Restaurar</button>')+
      '<button type="button" class="btn-mais" title="Mais opções">⋯</button>'+
    '</div></div>';
}

function coluna(titulo, classe, abertos, totalAberto, vazioMsg, ini){
  return '<section class="col '+classe+'"><header class="col-head"><h3>'+titulo+'</h3><span class="col-total">'+fmt(totalAberto)+'</span></header>'+
    (abertos.length ? abertos.map(t=>linhaAberta(t, ini)).join("") : '<div class="vazio">'+vazioMsg+'</div>')+'</section>';
}

function renderHoje(){
  const {ano, mes} = state;
  const ini = iniMes(ano,mes), fim = fimMes(ano,mes), h = hojeISO();
  const filtra = t => !state.pessoa || t.pessoa===state.pessoa;

  const abertosMes = state.titulos.filter(t=>t.status==="aberto" && t.vencimento<=fim && filtra(t))
    .sort((a,b)=>a.vencimento<b.vencimento?-1:a.vencimento>b.vencimento?1:a.descricao.localeCompare(b.descricao));
  const receber = abertosMes.filter(t=>t.tipo==="entrada"), pagar = abertosMes.filter(t=>t.tipo==="saida");
  const totR = soma(receber, t=>t.valor), totP = soma(pagar, t=>t.valor);
  const fechadosMes = state.titulos.filter(t=>filtra(t) && (
      (t.status==="pago" && t.pago_em>=ini && t.pago_em<=fim) ||
      (t.status==="cancelado" && t.vencimento>=ini && t.vencimento<=fim)))
    .sort((a,b)=>(a.pago_em||a.vencimento)<(b.pago_em||b.vencimento)?-1:1);

  const saldoHoje = saldoEm(h), previsto = previstoEm(fim);
  const pessoas = valoresUsados("pessoa");
  const detAntes = document.querySelector("#viewHoje details.fechados");
  const detAberto = detAntes ? detAntes.open : false;

  document.getElementById("viewHoje").innerHTML =
    '<div class="kpis">'+
      '<div class="kpi"><div class="kpi-l">Saldo real hoje</div><div class="kpi-v '+(saldoHoje<0?"neg":"")+'">'+fmt(saldoHoje)+'</div><div class="kpi-s">só o que já foi pago/recebido</div></div>'+
      '<div class="kpi in"><div class="kpi-l">A receber</div><div class="kpi-v">'+fmt(totR)+'</div><div class="kpi-s">'+receber.length+' em aberto até '+dataCurta(fim)+'</div></div>'+
      '<div class="kpi out"><div class="kpi-l">A pagar</div><div class="kpi-v">'+fmt(totP)+'</div><div class="kpi-s">'+pagar.length+' em aberto até '+dataCurta(fim)+'</div></div>'+
      '<div class="kpi"><div class="kpi-l">Previsto em '+dataCurta(fim)+'</div><div class="kpi-v '+(previsto<0?"neg":"pos")+'">'+fmt(previsto)+'</div><div class="kpi-s">saldo real + tudo em aberto</div></div>'+
    '</div>'+
    (pessoas.length ? '<div class="chips"><span class="chips-l">Filtrar por pessoa:</span>'+
      '<button type="button" class="chip'+(!state.pessoa?" on":"")+'" data-pessoa="">Todas</button>'+
      pessoas.map(p=>'<button type="button" class="chip'+(state.pessoa===p?" on":"")+'" data-pessoa="'+escapeHtml(p)+'">'+escapeHtml(p)+'</button>').join("")+'</div>' : "")+
    '<div class="duas-colunas">'+
      coluna("💚 A receber","receber",receber,totR,"Nada a receber neste mês. 🎉",ini)+
      coluna("🔴 A pagar","pagar",pagar,totP,"Nada a pagar neste mês. 🎉",ini)+
    '</div>'+
    '<details class="fechados"'+(detAberto?" open":"")+'><summary>✓ Já resolvidos em '+MESES[mes]+' <b>('+fechadosMes.length+')</b></summary>'+
      (fechadosMes.length ? fechadosMes.map(linhaFechada).join("") : '<div class="vazio">Nada resolvido neste mês ainda.</div>')+'</details>'+
    '<p class="dica">O saldo real só muda quando você dá baixa. Itens vencidos de meses anteriores continuam aqui até serem resolvidos. Ajuste a data ao lado do ✓ se o pagamento/recebimento não caiu no dia previsto.</p>';
}

function ligarHoje(){
  const el = document.getElementById("viewHoje");
  el.addEventListener("click", e=>{
    const chip = e.target.closest(".chip"); if(chip){ state.pessoa = chip.dataset.pessoa; render(); return; }
    const row = e.target.closest(".t-row"); if(!row) return;
    const id = row.dataset.id;
    if(e.target.closest(".btn-baixa")) acaoBaixar(id, row.querySelector(".t-data").value);
    else if(e.target.closest(".btn-reabrir")) acaoReabrir(id);
    else if(e.target.closest(".btn-restaurar")) acaoRestaurar(id);
    else if(e.target.closest(".btn-mais")) acaoMenu(id);
  });
}
