/* =====================================================================
   Tela "Análises": projeção dos próximos meses, metas por categoria e
   ranking de categorias do mês — tudo calculado sobre os títulos.
   ===================================================================== */
"use strict";

const PROJ_KEY = "cf2_proj_meses";
let chartProj = null;

function mesesProj(){ let v = 12; try{ v = parseInt(localStorage.getItem(PROJ_KEY),10); }catch(e){} return [6,12,24].includes(v) ? v : 12; }

function projecao(n){
  const out = []; let {ano, mes} = state;
  for(let i=0;i<n;i++){
    const tl = timelineMes(ano, mes);
    out.push({ano, mes, b0:tl.b0, entradas:tl.entradas, saidas:tl.saidas, menor:tl.menor.valor, final:tl.final});
    ({ano, mes} = somaMeses(ano, mes, 1));
  }
  return out;
}

/** Soma por categoria no mês: realizado (pago) e previsto (em aberto). */
function totaisPorCategoria(tipo){
  const ini = iniMes(state.ano,state.mes), fim = fimMes(state.ano,state.mes), m = {};
  state.titulos.forEach(t=>{
    if(t.tipo!==tipo) return;
    const c = t.categoria || "(sem categoria)";
    if(t.status==="pago" && t.pago_em>=ini && t.pago_em<=fim){ (m[c]=m[c]||{real:0,prev:0}).real += valorEf(t); }
    else if(t.status==="aberto" && t.vencimento>=ini && t.vencimento<=fim){ (m[c]=m[c]||{real:0,prev:0}).prev += t.valor; }
  });
  return m;
}

function barraMeta(real, prev, limite, tipo){
  const pr = Math.min(real/limite*100,100), pp = Math.min((real+prev)/limite*100,100)-pr;
  const estourou = tipo==="saida" && real+prev>limite;
  return '<div class="barra"><i class="b-real '+(tipo==="saida"?(estourou?"estouro":"saida"):"entrada")+'" style="width:'+pr+'%"></i><i class="b-prev" style="width:'+Math.max(pp,0)+'%"></i></div>';
}

function renderAnalises(){
  const n = mesesProj(), linhas = projecao(n);
  const sai = totaisPorCategoria("saida"), ent = totaisPorCategoria("entrada");
  const ranking = (m, cls)=>{
    const arr = Object.entries(m).map(([c,v])=>({c, tot:v.real+v.prev, ...v})).sort((a,b)=>b.tot-a.tot).slice(0,8);
    const max = arr.length ? arr[0].tot : 1;
    return arr.length ? arr.map(x=>'<div class="rk"><div class="rk-top"><span>'+escapeHtml(x.c)+'</span><b class="'+cls+'">'+fmt(x.tot)+'</b></div>'+
      '<div class="barra"><i class="b-real '+(cls==="out"?"saida":"entrada")+'" style="width:'+(x.real/max*100)+'%"></i><i class="b-prev" style="width:'+(x.prev/max*100)+'%"></i></div></div>').join("")
      : '<div class="vazio">Sem movimento neste mês.</div>';
  };
  const metas = state.metas.map(g=>{
    const v = (g.tipo==="saida"?sai:ent)[g.categoria] || {real:0,prev:0};
    const total = v.real+v.prev;
    return '<div class="meta" data-id="'+g.id+'"><div class="rk-top"><span><b>'+escapeHtml(g.categoria)+'</b> <small>'+(g.tipo==="saida"?"limite de gasto":"meta de entrada")+'</small></span>'+
      '<span><b>'+fmt(total)+'</b> / '+fmt(g.limite)+' <button type="button" class="btn-mais" data-act="edit" title="Editar">✎</button><button type="button" class="btn-mais" data-act="del" title="Excluir">✕</button></span></div>'+
      barraMeta(v.real, v.prev, g.limite, g.tipo)+
      '<div class="kpi-s">'+(g.tipo==="saida" ? (total>g.limite ? '<span class="neg">estourou em '+fmt(total-g.limite)+'</span>' : 'restam '+fmt(g.limite-total)) : (total>=g.limite ? '<span class="pos">meta atingida ✓</span>' : 'faltam '+fmt(g.limite-total)))+
      ' · realizado '+fmt(v.real)+' + previsto '+fmt(v.prev)+'</div></div>';
  }).join("");

  document.getElementById("viewAnalises").innerHTML =
    '<div class="flex-sp"><h2 class="sec-t">Projeção do saldo</h2><label class="sel-inline">Meses: <select id="projN">'+[6,12,24].map(v=>'<option'+(v===n?" selected":"")+'>'+v+'</option>').join("")+'</select></label></div>'+
    '<div class="chart-box"><canvas id="chartProj"></canvas></div>'+
    '<div class="tabela"><table><thead><tr><th>Mês</th><th class="num">Início</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Menor saldo</th><th class="num">Final</th></tr></thead><tbody>'+
      linhas.map(l=>'<tr class="proj-row'+(l.final<0?" neg":"")+'" data-ano="'+l.ano+'" data-mes="'+l.mes+'"><td><b>'+MESES[l.mes]+'/'+l.ano+'</b></td><td class="num">'+fmt(l.b0)+'</td><td class="num in">'+fmt(l.entradas)+'</td><td class="num out">'+fmt(l.saidas)+'</td>'+
        '<td class="num'+(l.menor<0?" neg":"")+'">'+fmt(l.menor)+'</td><td class="num"><b class="'+(l.final<0?"neg":"")+'">'+fmt(l.final)+'</b></td></tr>').join("")+'</tbody></table></div>'+
    '<p class="dica">A projeção parte do saldo real e soma tudo o que está em aberto (contas mensais geradas, parcelas, a receber). Clique num mês para ver a agenda dele.</p>'+
    '<div class="flex-sp" style="margin-top:26px"><h2 class="sec-t">Metas por categoria — '+MESES[state.mes]+'</h2><button type="button" class="btn-primary btn-sm" id="metaNova">+ Nova meta</button></div>'+
    (metas || '<div class="vazio">Defina um limite de gasto (ex.: Alimentação R$ 800) ou uma meta de entrada/aporte para acompanhar aqui.</div>')+
    '<div class="duas-colunas" style="margin-top:26px"><section class="col"><header class="col-head"><h3>Maiores saídas do mês</h3></header>'+ranking(sai,"out")+'</section>'+
    '<section class="col"><header class="col-head"><h3>Maiores entradas do mês</h3></header>'+ranking(ent,"in")+'</section></div>'+
    '<p class="dica">Barra cheia = já realizado (pago/recebido); barra clara = ainda previsto (em aberto).</p>';

  desenharChartProj(linhas);
}

let chartJsPromessa = null;
/** O Chart.js só é baixado quando a tela de análises precisa dele. */
function carregarChartJs(){
  if(typeof Chart!=="undefined") return Promise.resolve();
  if(!chartJsPromessa) chartJsPromessa = new Promise((ok, falha)=>{
    const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/chart.js@4";
    s.onload = ok; s.onerror = ()=>{ chartJsPromessa = null; falha(new Error("Chart.js")); };
    document.head.appendChild(s);
  });
  return chartJsPromessa;
}

function desenharChartProj(linhas){
  carregarChartJs().then(()=>{
    const ctx = document.getElementById("chartProj"); if(!ctx || state.view!=="analises") return;
    if(chartProj){ chartProj.destroy(); chartProj = null; }
    const data = linhas.map(l=>l.final), cores = data.map(v=>v<0?"#dc2626":"#2563eb");
    chartProj = new Chart(ctx, {type:"line",
      data:{labels:linhas.map(l=>MESES[l.mes].slice(0,3)+"/"+String(l.ano).slice(2)), datasets:[{label:"Saldo final previsto", data, borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.12)",
        fill:true, tension:.3, pointRadius:3, pointBackgroundColor:cores, pointBorderColor:cores, borderWidth:2.5}]},
      options:{responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>"Final: "+fmt(c.parsed.y)}}},
        scales:{y:{ticks:{callback:v=>"R$ "+Number(v).toLocaleString("pt-BR")}, grid:{color:c=>c.tick.value===0?"rgba(220,38,38,.5)":"rgba(30,50,90,.08)"}}, x:{grid:{display:false}}}}});
  }).catch(()=>{ const box = document.querySelector(".chart-box"); if(box) box.innerHTML = '<div class="vazio">Não foi possível carregar o gráfico (sem internet?).</div>'; });
}

function formMeta(id){
  const g = id ? state.metas.find(x=>x.id===id) : null;
  modalForm(g?"Editar meta":"Nova meta",
    '<div class="field span2"><label>Categoria</label><input name="categoria" type="text" list="dlCatsM" required value="'+escapeHtml(g?g.categoria:"")+'">'+datalist("dlCatsM", valoresUsados("categoria"))+'</div>'+
    '<div class="field"><label>Tipo</label><select name="tipo"><option value="saida"'+(g&&g.tipo==="entrada"?"":" selected")+'>Limite de gasto</option><option value="entrada"'+(g&&g.tipo==="entrada"?" selected":"")+'>Meta de entrada</option></select></div>'+
    '<div class="field"><label>Valor mensal</label><input name="limite" type="number" step="0.01" min="0.01" required value="'+(g?g.limite:"")+'"></div>',
    g?"Salvar":"Criar", f=>{
      const campos = {categoria:f.categoria.value.trim(), tipo:f.tipo.value, limite:arred(parseFloat(f.limite.value))};
      if(!campos.categoria || !(campos.limite>0)) return false;
      return seguro(async ()=>{
        if(g){ const {error} = await db.from("orcamentos").update(campos).eq("id",g.id); if(error) throw error; Object.assign(g, campos); }
        else{ const {data, error} = await db.from("orcamentos").insert(campos).select(); if(error) throw error; state.metas.push({...data[0], limite:Number(data[0].limite)}); }
      }, "Erro ao salvar meta");
    });
}

function ligarAnalises(){
  const el = document.getElementById("viewAnalises");
  el.addEventListener("change", e=>{ if(e.target.id==="projN"){ try{ localStorage.setItem(PROJ_KEY, e.target.value); }catch(_){} render(); } });
  el.addEventListener("click", async e=>{
    if(e.target.id==="metaNova") return formMeta();
    const meta = e.target.closest(".meta");
    if(meta && e.target.dataset.act==="edit") return formMeta(meta.dataset.id);
    if(meta && e.target.dataset.act==="del"){
      if(!await confirmDialog({titulo:"Excluir meta", mensagem:"Remover esta meta?", textoOk:"Excluir", perigo:true})) return;
      const ok = await seguro(async ()=>{ const {error} = await db.from("orcamentos").delete().eq("id", meta.dataset.id); if(error) throw error; state.metas = state.metas.filter(x=>x.id!==meta.dataset.id); }, "Erro ao excluir");
      if(ok) render();
      return;
    }
    const tr = e.target.closest(".proj-row");
    if(tr){ state.ano = +tr.dataset.ano; state.mes = +tr.dataset.mes; irPara("agenda"); }
  });
}
