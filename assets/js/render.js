/* =====================================================================
   Renderização — tabela do fluxo diário, cards, gráfico, insights
   e lista de pendentes. Lê o estado e desenha; não grava no banco.
   ===================================================================== */
"use strict";

/** Redesenha toda a tela a partir do estado atual. */
function render(){
  document.getElementById("periodoLabel").textContent = MESES[state.mes] + " / " + state.ano;
  const nDias = diasNoMes(state.ano, state.mes);
  const itens = lancamentosDoMes();
  const porDia = {};
  for(let d=1; d<=nDias; d++) porDia[d] = [];
  itens.forEach(it => { if(porDia[it.dia]) porDia[it.dia].push(it); });
  // pendentes (em espera) com data neste mês, mostrados na linha do dia
  const pendPorDia = {};
  state.pendentes.forEach(p=>{
    if(p.venc_ano===state.ano && p.venc_mes===state.mes && p.venc_dia && !pendBaixadoNoMes(p)){
      (pendPorDia[p.venc_dia] = pendPorDia[p.venc_dia] || []).push(p);
    }
  });

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";
  let saldo = saldoInicialAtual();
  let totalIn=0, totalOut=0, menorSaldo=saldo, diasNegativos=[];
  const chartLabels=[], chartSaldo=[];
  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear()===state.ano && hoje.getMonth()===state.mes;

  for(let d=1; d<=nDias; d++){
    const dow = new Date(state.ano, state.mes, d).getDay();
    let inDia=0, outDia=0;
    const lista = porDia[d].slice().sort((a,b)=> (a.tipo>b.tipo?1:-1));
    lista.forEach(it=>{ if(it.pulado) return; if(it.tipo==="entrada") inDia+=Number(it.valor); else outDia+=Number(it.valor); });
    totalIn+=inDia; totalOut+=outDia;
    saldo = saldo + inDia - outDia;
    if(saldo<menorSaldo) menorSaldo=saldo;
    const neg = saldo<0; if(neg) diasNegativos.push(d);
    chartLabels.push(String(d).padStart(2,"0"));
    chartSaldo.push(Number(saldo.toFixed(2)));

    const tr = document.createElement("tr");
    let cls=[];
    if(dow===0||dow===6) cls.push("weekend");
    if(ehMesAtual && d===hoje.getDate()) cls.push("today");
    if(neg) cls.push("neg");
    tr.className = cls.join(" ");
    tr.dataset.dia = d;

    const tdDia = document.createElement("td");
    tdDia.className="day-cell";
    tdDia.innerHTML = String(d).padStart(2,"0")+"<small>"+DIAS_SEMANA[dow]+"</small>";
    tr.appendChild(tdDia);

    const tdItens = document.createElement("td");
    let temConteudo=false;
    if(lista.length){
      temConteudo=true;
      const ul=document.createElement("ul"); ul.className="items";
      lista.forEach(it=>{
        const li=document.createElement("li");
        if(it.pulado) li.className="pulado";
        const sign = it.tipo==="entrada"?"+":"−";
        const catHtml = it.categoria?' <span class="cat">('+escapeHtml(it.categoria)+')</span>':"";
        const recTag = it.rec?'<span class="tag rec">fixo</span>':"";
        const ovTag = it.ov?'<span class="tag ov">editado</span>':"";
        const pulTag = it.pulado?'<span class="tag pul">pulado</span>':"";
        let acoes;
        if(it.pulado){
          acoes = '<span class="restore-x" title="Restaurar (incluir de novo neste mês)" data-rid="'+it.id+'">↺</span>';
        }else{
          const skipBtn = it.rec ? '<span class="skip-x" title="Pular só este mês (conta não paga)" data-rid="'+it.id+'">⊘</span>' : "";
          acoes =
            '<span class="edit-x" title="Editar" data-eid="'+it.id+'" data-erec="'+it.rec+'">✎</span>'+
            skipBtn+
            '<span class="del-x" title="Remover" data-id="'+it.id+'" data-rec="'+it.rec+'" data-grupo="'+(it.grupo||"")+'">✕</span>';
        }
        li.innerHTML =
          '<span class="li-desc">'+escapeHtml(it.descricao||"(sem descrição)")+catHtml+recTag+ovTag+pulTag+'</span>'+
          '<span style="display:flex;align-items:center;gap:6px">'+
            '<span class="amt '+(it.tipo==="entrada"?"in":"out")+'">'+sign+" "+fmt(Number(it.valor))+'</span>'+
            acoes+
          '</span>';
        ul.appendChild(li);
      });
      tdItens.appendChild(ul);
    }
    const pendDia = pendPorDia[d]||[];
    if(pendDia.length){
      temConteudo=true;
      const box=document.createElement("div"); box.className="pend-inline";
      box.innerHTML='<div class="pend-inline-tit">⏳ Em espera (extrato)</div>';
      const ul2=document.createElement("ul"); ul2.className="items";
      pendDia.forEach(p=>{
        const li=document.createElement("li");
        const sign=p.tipo==="entrada"?"+":"−";
        const cat=p.categoria?' <span class="cat">('+escapeHtml(p.categoria)+')</span>':"";
        const badge='<span class="pill '+(p.tipo==="entrada"?"in":"out")+'">'+(p.tipo==="entrada"?"receber":"pagar")+'</span>';
        li.innerHTML=
          '<span class="li-desc">'+escapeHtml(p.descricao||"(sem descrição)")+cat+' '+badge+'</span>'+
          '<span style="display:flex;align-items:center;gap:6px">'+
            '<span class="amt '+(p.tipo==="entrada"?"in":"out")+'">'+sign+" "+fmt(Number(p.valor))+'</span>'+
            '<button class="btn-primary btn-sm pend-lancar" title="Lançar no fluxo nesta data" data-pid="'+p.id+'">Lançar</button>'+
            '<span class="ico pend-edit" title="Classificar / editar" data-pid="'+p.id+'">✎</span>'+
            '<span class="ico pend-remover" title="Excluir" data-pid="'+p.id+'">✕</span>'+
          '</span>';
        ul2.appendChild(li);
      });
      box.appendChild(ul2);
      tdItens.appendChild(box);
    }
    if(!temConteudo){ tdItens.innerHTML='<span class="empty">—</span>'; }
    tr.appendChild(tdItens);

    const tdIn=document.createElement("td"); tdIn.className="num entrada"; tdIn.textContent=inDia?fmt(inDia):""; tr.appendChild(tdIn);
    const tdOut=document.createElement("td"); tdOut.className="num saida"; tdOut.textContent=outDia?fmt(outDia):""; tr.appendChild(tdOut);
    const tdSaldo=document.createElement("td"); tdSaldo.className="saldo"; tdSaldo.textContent=fmt(saldo); tr.appendChild(tdSaldo);
    tbody.appendChild(tr);
  }

  const saldoFinal = saldo;
  // Barra fixa
  document.getElementById("tbPeriodo").textContent = MESES[state.mes]+" / "+state.ano;
  const tbMe=document.getElementById("tbMenor"); tbMe.textContent=fmt(menorSaldo); tbMe.className="tb-val "+(menorSaldo<0?"neg":"pos");
  const tbFi=document.getElementById("tbFinal"); tbFi.textContent=fmt(saldoFinal); tbFi.className="tb-val "+(saldoFinal<0?"neg":"pos");
  const cards=document.getElementById("cards"); cards.innerHTML="";
  cards.appendChild(cardEl("Saldo inicial", fmt(saldoInicialAtual()), ""));
  cards.appendChild(cardEl("Total entradas", fmt(totalIn), "pos"));
  cards.appendChild(cardEl("Total saídas", fmt(totalOut), "neg"));
  cards.appendChild(cardEl("Menor saldo do mês", fmt(menorSaldo), menorSaldo<0?"neg":"pos"));
  cards.appendChild(cardEl("Saldo final", fmt(saldoFinal), saldoFinal<0?"neg":"pos"));

  const alerta=document.getElementById("alerta");
  if(diasNegativos.length){
    alerta.classList.add("show");
    alerta.innerHTML="⚠️ <strong>Atenção:</strong> o saldo fica negativo em "+diasNegativos.length+
      " dia(s): "+diasNegativos.map(d=>String(d).padStart(2,"0")).join(", ")+
      ". O dinheiro disponível não é suficiente para cobrir as contas até lá.";
  }else{ alerta.classList.remove("show"); alerta.innerHTML=""; }

  atualizaCategorias();
  renderChart(chartLabels, chartSaldo);
  renderInsights(itens, totalIn, totalOut);
  renderTipos(itens);
  renderProjecao();
  renderOrcamentos();
  renderPendentes();
  document.getElementById("totalLanc").textContent =
    state.lancamentos.length+" lançamento(s), "+state.recorrentes.length+" fixo(s)";
}

/** Cria um card do resumo do mês. */
function cardEl(lbl,val,cls){
  const d=document.createElement("div"); d.className="card"+(cls?(" "+cls):"");
  d.innerHTML='<div class="lbl">'+lbl+'</div><div class="val">'+val+'</div>'; return d;
}

/** Preenche o datalist de categorias já usadas. */
function atualizaCategorias(){
  const set=new Set();
  state.lancamentos.forEach(l=>l.categoria&&set.add(l.categoria));
  state.recorrentes.forEach(l=>l.categoria&&set.add(l.categoria));
  const dl=document.getElementById("cats"); dl.innerHTML="";
  [...set].sort().forEach(c=>{ const o=document.createElement("option"); o.value=c; dl.appendChild(o); });
}

/* ---------- Gráfico da evolução do saldo ---------- */

/** Desenha (ou atualiza) o gráfico de saldo acumulado. */
function renderChart(labels, data){
  if(typeof Chart === "undefined") return;
  const ctx = document.getElementById("chartSaldo");
  if(!ctx) return;
  const azul = "#2563eb", vermelho = "#dc2626";
  const gridCor = "rgba(30,50,90,.08)", txtCor = "#6b7688";
  // cor do ponto conforme positivo/negativo
  const pointColors = data.map(v => v<0 ? vermelho : azul);
  // gradiente de preenchimento
  let grad = "rgba(37,99,235,.18)";
  try{
    const c = ctx.getContext("2d");
    grad = c.createLinearGradient(0,0,0,280);
    grad.addColorStop(0, "rgba(37,99,235,.35)");
    grad.addColorStop(1, "rgba(37,99,235,0)");
  }catch(e){}
  // Reaproveita a instância existente (muito mais rápido que recriar)
  if(chartInst){
    chartInst.data.labels = labels;
    chartInst.data.datasets[0].data = data;
    chartInst.data.datasets[0].pointBackgroundColor = pointColors;
    chartInst.data.datasets[0].pointBorderColor = pointColors;
    chartInst.update();
    return;
  }
  chartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Saldo acumulado",
        data: data,
        borderColor: azul,
        backgroundColor: grad,
        fill: true,
        tension: .3,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#ffffff", borderColor: "#e6ebf3", borderWidth: 1,
          titleColor: "#1b2536", bodyColor: "#1b2536", padding: 10,
          callbacks: { label: c => "Saldo dia "+c.label+": "+fmt(c.parsed.y) }
        }
      },
      scales: {
        y: {
          ticks: { color: txtCor, callback: v => "R$ "+Number(v).toLocaleString("pt-BR") },
          grid: { color: ctx2 => ctx2.tick.value===0 ? "rgba(220,38,38,.5)" : gridCor }
        },
        x: { ticks: { color: txtCor }, grid: { display:false } }
      }
    }
  });
}

/* ---------- Insights: maiores receitas e despesas por categoria ---------- */

/** Soma os itens por categoria, ordenado do maior para o menor. */
function agrupaPorCategoria(itens, tipo){
  const mapa = {};
  itens.filter(i => i.tipo===tipo && !i.pulado).forEach(i => {
    const cat = catDe(i);
    mapa[cat] = (mapa[cat]||0) + Number(i.valor);
  });
  return Object.entries(mapa).map(([nome,valor])=>({nome,valor})).sort((a,b)=>b.valor-a.valor);
}

/**
 * Desenha um ranking de categorias (clicável). Quando totalReceita é
 * informado (usado nas despesas), mostra também quanto a categoria
 * representa da receita total do mês — ex.: "Aluguel · 32% da receita".
 */
function renderRank(elId, lista, total, cls, totalReceita){
  const el = document.getElementById(elId);
  if(!lista.length){ el.innerHTML = '<div class="rank-empty">Nenhum lançamento neste mês.</div>'; return; }
  const max = lista[0].valor || 1;
  const top = lista; // todas as categorias, da maior para a menor
  let html = '<ul class="rank">';
  const tipo = cls==="in" ? "entrada" : "saida";
  top.forEach(item=>{
    const pct = total>0 ? Math.round(item.valor/total*100) : 0;
    const larg = Math.max(4, Math.round(item.valor/max*100));
    const temReceita = totalReceita!=null && totalReceita>0;
    const pctReceita = temReceita ? Math.round(item.valor/totalReceita*100) : 0;
    const pctReceitaHtml = totalReceita!=null
      ? ' <span class="rk-pct rk-pct-receita">· '+(temReceita?pctReceita+"% da receita":"sem receita no mês")+'</span>'
      : '';
    html += '<li class="rk-click" title="Ver lançamentos" data-cat="'+encodeURIComponent(item.nome)+'" data-tipo="'+tipo+'">'+
      '<div class="rk-top"><span class="rk-name">'+escapeHtml(item.nome)+
        '<span class="rk-pct">'+pct+'% do total</span>'+pctReceitaHtml+'</span>'+
        '<span class="rk-val '+cls+'">'+fmt(item.valor)+'</span></div>'+
      '<div class="bar"><span class="'+cls+'" style="width:'+larg+'%"></span></div>'+
    '</li>';
  });
  html += '</ul>';
  el.innerHTML = html;
}

function renderInsights(itens, totalIn, totalOut){
  renderRank("topReceitas", agrupaPorCategoria(itens,"entrada"), totalIn, "in");
  renderRank("topDespesas", agrupaPorCategoria(itens,"saida"), totalOut, "out", totalIn);
}

/* ---------- Avulso, parcelado e fixo ---------- */

/** Desenha uma lista clicável (vai até o dia no fluxo) de um dos três grupos. */
function renderTiposLista(elId, itens){
  const el = document.getElementById(elId);
  if(!itens.length){ el.innerHTML = '<div class="rank-empty">Nenhum neste mês.</div>'; return; }
  let html = '<ul class="pend">';
  itens.slice().sort((a,b)=>a.dia-b.dia).forEach(it=>{
    const cat = it.categoria ? ' <span class="cat">('+escapeHtml(it.categoria)+')</span>' : "";
    html += '<li class="tipos-row" data-dia="'+it.dia+'" title="Ver no fluxo, dia '+String(it.dia).padStart(2,"0")+'">'+
      '<span class="pend-info"><span class="pend-venc">dia '+String(it.dia).padStart(2,"0")+'</span>'+
        ' <span class="pend-desc">'+escapeHtml(it.descricao||"(sem descrição)")+'</span>'+cat+'</span>'+
      '<span class="pend-val '+(it.tipo==="entrada"?"in":"out")+'">'+fmt(Number(it.valor))+'</span>'+
    '</li>';
  });
  html += '</ul>';
  el.innerHTML = html;
}

/** Separa os lançamentos do mês em avulso / parcelado / fixo e desenha os três blocos. */
function renderTipos(itens){
  const validos = itens.filter(it=>!it.pulado);
  const fixos = validos.filter(it=>it.rec);
  const parcelados = validos.filter(it=>!it.rec && it.grupo);
  const avulsos = validos.filter(it=>!it.rec && !it.grupo);
  const soma = arr => arr.reduce((s,it)=> s+Number(it.valor), 0);

  const cards = document.getElementById("tiposCards");
  cards.innerHTML = "";
  cards.appendChild(cardEl("Avulsos ("+avulsos.length+")", fmt(soma(avulsos)), ""));
  cards.appendChild(cardEl("Parcelados ("+parcelados.length+")", fmt(soma(parcelados)), ""));
  cards.appendChild(cardEl("Fixos ("+fixos.length+")", fmt(soma(fixos)), ""));

  renderTiposLista("tpAvulsoLista", avulsos);
  renderTiposLista("tpParceladoLista", parcelados);
  renderTiposLista("tpFixoLista", fixos);
}

/* ---------- Pendentes (em espera) ---------- */

/** Um pendente mensal já baixado no mês selecionado? */
function pendBaixadoNoMes(p){
  return p.recorrente && p.baixa_ano===state.ano && p.baixa_mes===state.mes;
}

/** Desenha a lista de itens em espera e o resumo a receber/a pagar. */
function renderPendentes(){
  const cont = document.getElementById("pendentesLista");
  if(!cont) return;
  const lista = state.pendentes.slice().sort((a,b)=>
    (pendBaixadoNoMes(a)?1:0)-(pendBaixadoNoMes(b)?1:0) || (a.venc_dia||99)-(b.venc_dia||99));
  // resumo considera só o que ainda está em aberto no mês selecionado
  let somaIn=0, somaOut=0, abertos=0;
  state.pendentes.forEach(p=>{
    if(pendBaixadoNoMes(p)) return;
    abertos++;
    if(p.tipo==="entrada") somaIn+=Number(p.valor); else somaOut+=Number(p.valor);
  });
  const resumo = document.getElementById("pendResumo");
  if(resumo) resumo.innerHTML = abertos
    ? 'A receber: <span style="color:var(--in)">'+fmt(somaIn)+'</span> · A pagar: <span style="color:var(--out)">'+fmt(somaOut)+'</span>'
    : "";
  if(!lista.length){ cont.innerHTML = '<div class="rank-empty">Nada em espera.</div>'; return; }
  let html = '<ul class="pend">';
  lista.forEach(p=>{
    const baixado = pendBaixadoNoMes(p);
    let venc = "";
    if(p.venc_ano!=null && p.venc_mes!=null && p.venc_dia){
      venc = '<span class="pend-venc">'+String(p.venc_dia).padStart(2,"0")+"/"+String(p.venc_mes+1).padStart(2,"0")+"/"+p.venc_ano+'</span>';
    }else if(p.venc_dia){
      venc = '<span class="pend-venc">previsto dia '+String(p.venc_dia).padStart(2,"0")+'</span>';
    }
    const cat = p.categoria ? ' <span class="cat">('+escapeHtml(p.categoria)+')</span>' : "";
    const badge = p.tipo==="entrada" ? '<span class="pill in">a receber</span>' : '<span class="pill out">a pagar</span>';
    const mensal = p.recorrente ? '<span class="tag rec">🔁 mensal</span>' : "";
    const okTag = baixado ? '<span class="tag ok">✓ baixado em '+MESES[state.mes]+'</span>' : "";
    let acoes;
    if(baixado){
      acoes = '<span class="restore-x pend-reabrir" title="Reabrir (desfazer baixa deste mês)" data-pid="'+p.id+'">↺</span>';
    }else{
      acoes =
        '<span class="edit-x pend-edit" title="Editar" data-pid="'+p.id+'">✎</span>'+
        '<button class="btn-primary btn-sm pend-baixa" data-pid="'+p.id+'">Dar baixa</button>'+
        '<span class="del-x pend-del" title="Remover" data-pid="'+p.id+'">✕</span>';
    }
    html += '<li class="'+(baixado?"pend-done":"")+'">'+
      '<span class="pend-info">'+badge+' <span class="pend-desc">'+escapeHtml(p.descricao||"(sem descrição)")+'</span>'+cat+mensal+okTag+' '+venc+'</span>'+
      '<span class="pend-acoes">'+
        '<span class="pend-val '+(p.tipo==="entrada"?"in":"out")+'">'+fmt(Number(p.valor))+'</span>'+
        acoes+
      '</span>'+
    '</li>';
  });
  html += '</ul>';
  cont.innerHTML = html;
}
