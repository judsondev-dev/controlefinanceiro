/* =====================================================================
   Projeção — simula os próximos meses a partir do mês selecionado,
   usando apenas o que já está lançado (contas fixas + parcelas futuras
   já criadas). Não inclui "em espera" nem lançamentos avulsos que ainda
   não existem, por não serem previsíveis.
   ===================================================================== */
"use strict";

const PROJ_KEY = "cf_proj_meses";

/** Simula um mês inteiro dia a dia a partir de um saldo inicial dado. */
function simulaMes(ano, mes, saldoInicial){
  const nDias = diasNoMes(ano, mes);
  const itens = lancamentosDoMes(ano, mes);
  const porDia = {};
  itens.forEach(it=>{
    if(it.pulado) return;
    (porDia[it.dia] = porDia[it.dia] || []).push(it);
  });
  let saldo = saldoInicial, totalIn = 0, totalOut = 0, menor = saldoInicial;
  for(let d=1; d<=nDias; d++){
    (porDia[d]||[]).forEach(it=>{
      if(it.tipo==="entrada"){ saldo += Number(it.valor); totalIn += Number(it.valor); }
      else{ saldo -= Number(it.valor); totalOut += Number(it.valor); }
    });
    if(saldo<menor) menor=saldo;
  }
  return {saldoFinal:saldo, menorSaldo:menor, totalIn, totalOut};
}

/**
 * Projeta N meses a partir do mês selecionado. O saldo inicial de cada
 * mês é o saldo final projetado do mês anterior, a menos que o usuário
 * já tenha um saldo inicial salvo explicitamente para aquele mês.
 */
function computeProjecao(nMeses){
  const out = [];
  let ano = state.ano, mes = state.mes;
  let saldoIni = saldoInicialAtual();
  for(let i=0; i<nMeses; i++){
    const override = state.saldos[chave(ano,mes)];
    const saldoInicialMes = (i>0 && override!=null) ? Number(override) : saldoIni;
    const r = simulaMes(ano, mes, saldoInicialMes);
    out.push({ano, mes, saldoInicial:saldoInicialMes, saldoFinal:r.saldoFinal, menorSaldo:r.menorSaldo, totalIn:r.totalIn, totalOut:r.totalOut});
    saldoIni = r.saldoFinal;
    mes++; if(mes>11){ mes=0; ano++; }
  }
  return out;
}

/** Quantidade de meses da projeção, lembrada no navegador (padrão 12). */
function getProjMeses(){
  const v = parseInt(localStorage.getItem(PROJ_KEY), 10);
  return [6,12,24].includes(v) ? v : 12;
}

/** Redesenha a tabela e o gráfico do painel de projeção. */
function renderProjecao(){
  const nMeses = getProjMeses();
  const sel = document.getElementById("projMeses");
  if(sel) sel.value = String(nMeses);
  const linhas = computeProjecao(nMeses);

  const tbody = document.getElementById("tbodyProj");
  if(tbody){
    tbody.innerHTML = "";
    linhas.forEach(l=>{
      const tr = document.createElement("tr");
      tr.className = "proj-row" + (l.saldoFinal<0 ? " neg" : "");
      tr.dataset.ano = l.ano; tr.dataset.mes = l.mes;
      tr.innerHTML =
        '<td class="day-cell">'+MESES[l.mes]+"/"+l.ano+'</td>'+
        '<td class="num">'+fmt(l.saldoInicial)+'</td>'+
        '<td class="num entrada">'+fmt(l.totalIn)+'</td>'+
        '<td class="num saida">'+fmt(l.totalOut)+'</td>'+
        '<td class="num" style="'+(l.menorSaldo<0?"color:var(--neg-text);font-weight:700":"")+'">'+fmt(l.menorSaldo)+'</td>'+
        '<td class="saldo" style="'+(l.saldoFinal<0?"color:var(--neg-text)":"")+'">'+fmt(l.saldoFinal)+'</td>';
      tbody.appendChild(tr);
    });
  }
  renderChartProj(linhas);
}

/** Gráfico de linha do saldo final projetado, mês a mês. */
function renderChartProj(linhas){
  if(typeof Chart === "undefined") return;
  const ctx = document.getElementById("chartProj");
  if(!ctx) return;
  const labels = linhas.map(l => MESES[l.mes].slice(0,3)+"/"+String(l.ano).slice(2));
  const data = linhas.map(l => Number(l.saldoFinal.toFixed(2)));
  const pointColors = data.map(v => v<0 ? "#dc2626" : "#2563eb");
  if(chartInstProj){
    chartInstProj.data.labels = labels;
    chartInstProj.data.datasets[0].data = data;
    chartInstProj.data.datasets[0].pointBackgroundColor = pointColors;
    chartInstProj.data.datasets[0].pointBorderColor = pointColors;
    chartInstProj.update();
    return;
  }
  chartInstProj = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Saldo final projetado",
        data: data,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,.12)",
        fill: true, tension: .3, pointRadius: 3, pointHoverRadius: 5,
        pointBackgroundColor: pointColors, pointBorderColor: pointColors,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => "Saldo final: "+fmt(c.parsed.y) } }
      },
      scales: {
        y: {
          ticks: { callback: v => "R$ "+Number(v).toLocaleString("pt-BR") },
          grid: { color: ctx2 => ctx2.tick.value===0 ? "rgba(220,38,38,.5)" : "rgba(30,50,90,.08)" }
        },
        x: { grid: { display:false } }
      }
    }
  });
}
