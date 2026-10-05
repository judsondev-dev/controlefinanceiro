/* =====================================================================
   Tela "Visão mensal": mês a mês, do passado ao futuro, o total de
   entradas e de saídas — separando o que já aconteceu (pago/recebido)
   do que ainda está em aberto — mais o resultado e o saldo previsto.
   ===================================================================== */
"use strict";

const VM_KEY = "cf2_visao_mensal";
const vm = (()=>{ try{ return {atras:"tudo", frente:12, pessoa:"", ...JSON.parse(localStorage.getItem(VM_KEY)||"{}")}; }catch(e){ return {atras:"tudo", frente:12, pessoa:""}; } })();
let chartMeses = null;
function salvarVm(){ try{ localStorage.setItem(VM_KEY, JSON.stringify(vm)); }catch(e){} }

/** Totais por mês ("AAAA-MM"): realizado (pago na data da baixa) e em aberto (no mês do vencimento). */
function agregarMeses(pessoa){
  const m = {};
  state.titulos.forEach(t=>{
    if(t.status==="cancelado" || (pessoa && t.pessoa!==pessoa)) return;
    const k = (t.status==="pago" ? t.pago_em : t.vencimento).slice(0,7);
    const o = m[k] || (m[k] = {ent:0, entAb:0, sai:0, saiAb:0});
    const v = valorEf(t);
    if(t.status==="pago"){ if(t.tipo==="entrada") o.ent += v; else o.sai += v; }
    else{ if(t.tipo==="entrada") o.entAb += v; else o.saiAb += v; }
  });
  return m;
}

function mesesDaVisao(agg){
  const h = mesDe(hojeISO()), chaves = Object.keys(agg).sort();
  let ini = chaves.length ? {ano:+chaves[0].slice(0,4), mes:+chaves[0].slice(5,7)-1} : h;
  if(vm.atras!=="tudo"){ const lim = somaMeses(h.ano, h.mes, -Number(vm.atras)); if(mesIdx(ini.ano,ini.mes) < mesIdx(lim.ano,lim.mes)) ini = lim; }
  const fim = somaMeses(h.ano, h.mes, Number(vm.frente)), out = [];
  for(let c = ini; mesIdx(c.ano,c.mes) <= mesIdx(fim.ano,fim.mes); c = somaMeses(c.ano, c.mes, 1)) out.push(c);
  return out;
}

const celulaTotal = (total, feito, aberto, rotFeito, rotAberto, cls) =>
  '<td class="num"><b class="'+cls+'">'+fmt(total)+'</b><small class="sub">'+(feito>0.004?rotFeito+' '+fmt(feito):"")+(feito>0.004&&aberto>0.004?" · ":"")+(aberto>0.004?rotAberto+' '+fmt(aberto):"")+'</small></td>';

function renderMeses(){
  const agg = agregarMeses(vm.pessoa), meses = mesesDaVisao(agg), h = mesDe(hojeISO()), hi = mesIdx(h.ano,h.mes);
  const linhas = meses.map(c=>{
    const k = c.ano+"-"+pad2(c.mes+1), o = agg[k] || {ent:0, entAb:0, sai:0, saiAb:0};
    const ent = o.ent+o.entAb, sai = o.sai+o.saiAb, res = arred(ent-sai);
    return {...c, k, ...o, ent_t:ent, sai_t:sai, res, saldo: (vm.pessoa || mesIdx(c.ano,c.mes) < hi) ? null : timelineMes(c.ano, c.mes).final, idx:mesIdx(c.ano,c.mes)};
  });
  const tot = linhas.reduce((a,l)=>({ent:a.ent+l.ent, entAb:a.entAb+l.entAb, sai:a.sai+l.sai, saiAb:a.saiAb+l.saiAb}), {ent:0,entAb:0,sai:0,saiAb:0});
  const totEnt = tot.ent+tot.entAb, totSai = tot.sai+tot.saiAb;
  const pessoas = valoresUsados("pessoa");
  const sel = (id, atual, ops) => '<select id="'+id+'">'+ops.map(o=>'<option value="'+escapeHtml(o[0])+'"'+(String(atual)===String(o[0])?" selected":"")+'>'+escapeHtml(o[1])+'</option>').join("")+'</select>';

  document.getElementById("viewMeses").innerHTML =
    '<div class="flex-sp"><h2 class="sec-t">Visão mensal — entradas e saídas</h2></div>'+
    '<div class="panel-simples filtros">'+
      '<div class="field"><label>Meses para trás</label>'+sel("vmAtras", vm.atras, [["3","3 meses"],["6","6 meses"],["12","12 meses"],["tudo","Desde o primeiro lançamento"]])+'</div>'+
      '<div class="field"><label>Meses para a frente</label>'+sel("vmFrente", vm.frente, [["6","6 meses"],["12","12 meses"],["24","24 meses"]])+'</div>'+
      '<div class="field"><label>Pessoa</label>'+sel("vmPessoa", vm.pessoa, [["","Todas"],...pessoas.map(p=>[p,p])])+'</div>'+
    '</div>'+
    '<div class="kpis">'+
      '<div class="kpi in"><div class="kpi-l">Entradas no período</div><div class="kpi-v">'+fmt(totEnt)+'</div><div class="kpi-s">recebido '+fmt(tot.ent)+' · a receber '+fmt(tot.entAb)+'</div></div>'+
      '<div class="kpi out"><div class="kpi-l">Saídas no período</div><div class="kpi-v">'+fmt(totSai)+'</div><div class="kpi-s">pago '+fmt(tot.sai)+' · a pagar '+fmt(tot.saiAb)+'</div></div>'+
      '<div class="kpi"><div class="kpi-l">Resultado do período</div><div class="kpi-v '+(totEnt-totSai<0?"neg":"pos")+'">'+fmt(arred(totEnt-totSai))+'</div><div class="kpi-s">entradas − saídas</div></div>'+
    '</div>'+
    '<div class="chart-box"><canvas id="chartMeses"></canvas></div>'+
    '<div class="tabela"><table><thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Resultado</th><th class="num" title="Saldo previsto no fim do mês: real + o que está em aberto">Saldo previsto no fim</th></tr></thead><tbody>'+
      linhas.map(l=>'<tr class="mes-row '+(l.idx<hi?"passado":l.idx===hi?"atual":"futuro")+'" data-ano="'+l.ano+'" data-mes="'+l.mes+'">'+
        '<td><b>'+MESES[l.mes]+'/'+l.ano+'</b>'+(l.idx===hi?' <span class="tag hoje">mês atual</span>':"")+'</td>'+
        celulaTotal(l.ent_t, l.ent, l.entAb, "recebido", "a receber", "in")+
        celulaTotal(l.sai_t, l.sai, l.saiAb, "pago", "a pagar", "out")+
        '<td class="num"><b class="'+(l.res<0?"neg":"pos")+'">'+fmt(l.res)+'</b></td>'+
        '<td class="num'+(l.saldo!=null&&l.saldo<0?" neg":"")+'">'+(l.saldo==null?"—":fmt(l.saldo))+'</td></tr>').join("")+
      '<tr class="tot"><td><b>Total do período</b></td><td class="num"><b class="in">'+fmt(totEnt)+'</b></td><td class="num"><b class="out">'+fmt(totSai)+'</b></td><td class="num"><b class="'+(totEnt-totSai<0?"neg":"pos")+'">'+fmt(arred(totEnt-totSai))+'</b></td><td></td></tr>'+
    '</tbody></table></div>'+
    '<p class="dica">“Recebido/pago” é o que já foi baixado, contado no mês da baixa. “A receber/a pagar” é o que ainda está em aberto, contado no mês do vencimento (atrasados ficam no mês em que venceram). Contas puladas não entram. Clique num mês para ver a agenda dele.'+" O saldo previsto só é mostrado do mês atual em diante e sem filtro de pessoa (ele parte do saldo real de hoje e considera todas as contas)."+'</p>';

  desenharChartMeses(linhas);
}

function desenharChartMeses(linhas){
  carregarChartJs().then(()=>{
    const ctx = document.getElementById("chartMeses"); if(!ctx || state.view!=="meses") return;
    if(chartMeses){ chartMeses.destroy(); chartMeses = null; }
    chartMeses = new Chart(ctx, {data:{labels:linhas.map(l=>MESES[l.mes].slice(0,3)+"/"+String(l.ano).slice(2)), datasets:[
      {type:"bar", label:"Entradas", data:linhas.map(l=>l.ent_t), backgroundColor:"rgba(22,163,74,.75)", borderRadius:4},
      {type:"bar", label:"Saídas", data:linhas.map(l=>l.sai_t), backgroundColor:"rgba(220,38,38,.75)", borderRadius:4},
      {type:"line", label:"Resultado", data:linhas.map(l=>l.res), borderColor:"#2563eb", backgroundColor:"#2563eb", tension:.25, pointRadius:3, borderWidth:2.5}]},
      options:{responsive:true, maintainAspectRatio:false, animation:false, interaction:{mode:"index", intersect:false},
        plugins:{legend:{position:"bottom"}, tooltip:{callbacks:{label:c=>c.dataset.label+": "+fmt(c.parsed.y)}}},
        scales:{y:{ticks:{callback:v=>"R$ "+Number(v).toLocaleString("pt-BR")}, grid:{color:c=>c.tick.value===0?"rgba(30,50,90,.4)":"rgba(30,50,90,.08)"}}, x:{grid:{display:false}}}}});
  }).catch(()=>{ const box = document.querySelector("#viewMeses .chart-box"); if(box) box.innerHTML = '<div class="vazio">Não foi possível carregar o gráfico (sem internet?).</div>'; });
}

function ligarMeses(){
  const el = document.getElementById("viewMeses");
  el.addEventListener("change", e=>{
    if(e.target.id==="vmAtras") vm.atras = e.target.value;
    else if(e.target.id==="vmFrente") vm.frente = Number(e.target.value);
    else if(e.target.id==="vmPessoa") vm.pessoa = e.target.value;
    else return;
    salvarVm(); renderMeses();
  });
  el.addEventListener("click", e=>{
    const tr = e.target.closest(".mes-row"); if(!tr) return;
    state.ano = +tr.dataset.ano; state.mes = +tr.dataset.mes; irPara("agenda");
  });
}
