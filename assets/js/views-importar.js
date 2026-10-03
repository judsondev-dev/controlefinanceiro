/* =====================================================================
   Tela "Importar extrato" (CSV/OFX) com conciliação:
     • linha já existente (mesma data, tipo e valor)  → ignorar
     • linha que bate com um título em aberto         → dar baixa nele
     • linha nova                                     → criar já como pago
   Você revisa e muda a ação de cada linha antes de confirmar.
   ===================================================================== */
"use strict";

const imp = {linhas:[], bruto:[], de:"", ate:"", conta:"", nomeArquivo:""};

async function lerArquivoTexto(file){
  const buf = await file.arrayBuffer();
  let txt = new TextDecoder("utf-8").decode(buf);
  if(txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
  return txt;
}

function analisarExtrato(){
  const abertos = state.titulos.filter(t=>t.status==="aberto");
  const usados = new Set();
  imp.linhas = imp.bruto.filter(l=>l.ano!=null).map(l=>({...l, data:iso(l.ano,l.mes,l.dia)}))
    .filter(l=>(!imp.de || l.data>=imp.de) && (!imp.ate || l.data<=imp.ate))
    .map(l=>{
      const jaTem = state.titulos.some(t=>t.status==="pago" && t.pago_em===l.data && t.tipo===l.tipo && Math.abs(valorEf(t)-l.valor)<0.005 &&
        (t.origem==="importado" || norm(t.descricao)===norm(l.descricao)));
      if(jaTem) return {...l, acao:"ignorar", motivo:"já está no sistema"};
      const cand = abertos.filter(t=>!usados.has(t.id) && t.tipo===l.tipo && Math.abs(t.valor-l.valor)<0.01 && Math.abs(diasEntre(t.vencimento,l.data))<=20)
        .sort((a,b)=>Math.abs(diasEntre(a.vencimento,l.data))-Math.abs(diasEntre(b.vencimento,l.data)))[0];
      if(cand){ usados.add(cand.id); return {...l, acao:"baixar", alvo:cand.id}; }
      return {...l, acao:"criar"};
    })
    .sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0);
}

function renderImportar(){
  const el = document.getElementById("viewImportar");
  const cont = {criar:0, baixar:0, ignorar:0};
  imp.linhas.forEach(l=>cont[l.acao]++);
  const linhas = imp.linhas.map((l,i)=>{
    const alvo = l.alvo && tituloPorId(l.alvo);
    return '<tr data-i="'+i+'" class="acao-'+l.acao+'"><td>'+dataBR(l.data)+'</td><td>'+escapeHtml(l.descricao)+'</td>'+
      '<td class="num '+(l.tipo==="entrada"?"in":"out")+'">'+(l.tipo==="entrada"?"+":"−")+fmt(l.valor)+'</td>'+
      '<td><select class="imp-acao">'+
        '<option value="criar"'+(l.acao==="criar"?" selected":"")+'>Criar como '+(l.tipo==="entrada"?"recebido":"pago")+'</option>'+
        (alvo ? '<option value="baixar"'+(l.acao==="baixar"?" selected":"")+'>Dar baixa em “'+escapeHtml(alvo.descricao)+'” (venc. '+dataCurta(alvo.vencimento)+')</option>' : "")+
        '<option value="ignorar"'+(l.acao==="ignorar"?" selected":"")+'>Ignorar'+(l.motivo?" — "+l.motivo:"")+'</option></select></td></tr>';
  }).join("");

  el.innerHTML =
    '<div class="panel-simples"><div class="fgrid imp-form">'+
      '<div class="field span2"><label>Arquivo do extrato (.csv ou .ofx)</label><input type="file" id="impArq" accept=".csv,.ofx,.txt"></div>'+
      '<div class="field"><label>De</label><input type="date" id="impDe" value="'+imp.de+'"></div>'+
      '<div class="field"><label>Até</label><input type="date" id="impAte" value="'+imp.ate+'"></div>'+
      '<div class="field span2"><label>Conta dos lançamentos novos</label><select id="impConta">'+opcoesConta(imp.conta)+'</select></div>'+
    '</div>'+
    '<p class="dica">O app compara cada linha com o que já existe: o que já foi importado é ignorado, o que combina com uma conta em aberto vira baixa dela, e o resto entra como novo lançamento já pago. Você pode trocar a ação de qualquer linha.</p></div>'+
    (imp.bruto.length ?
      '<div class="barra-filtro"><div><b>'+imp.linhas.length+'</b> linhas no período — <span class="in">'+cont.criar+' novas</span> · <span>'+cont.baixar+' baixas</span> · <span class="muted">'+cont.ignorar+' ignoradas</span></div>'+
      '<button type="button" class="btn-primary" id="impConfirmar"'+(cont.criar+cont.baixar?"":" disabled")+'>Importar '+(cont.criar+cont.baixar)+' linha(s)</button></div>'+
      '<div class="tabela"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Ação</th></tr></thead><tbody>'+(linhas||'<tr><td colspan="4" class="vazio">Nenhuma linha neste período.</td></tr>')+'</tbody></table></div>'
      : '<div class="vazio">Escolha um arquivo para começar.</div>');
}

function ligarImportar(){
  const el = document.getElementById("viewImportar");
  el.addEventListener("change", async e=>{
    if(e.target.id==="impArq" && e.target.files[0]){
      try{
        const bruto = parseExtrato(await lerArquivoTexto(e.target.files[0]));
        if(!bruto.length){ toast("Não encontrei lançamentos nesse arquivo.", "erro"); return; }
        imp.bruto = bruto;
        const datas = bruto.filter(l=>l.ano!=null).map(l=>iso(l.ano,l.mes,l.dia)).sort();
        imp.de = datas[0]||""; imp.ate = datas[datas.length-1]||"";
        analisarExtrato(); renderImportar();
      }catch(err){ toast("Erro ao ler o arquivo: "+err.message, "erro"); }
    }else if(e.target.id==="impDe" || e.target.id==="impAte"){
      imp.de = el.querySelector("#impDe").value; imp.ate = el.querySelector("#impAte").value;
      analisarExtrato(); renderImportar();
    }else if(e.target.id==="impConta"){
      imp.conta = e.target.value;
    }else if(e.target.classList.contains("imp-acao")){
      imp.linhas[+e.target.closest("tr").dataset.i].acao = e.target.value; renderImportar();
    }
  });
  el.addEventListener("click", async e=>{
    if(e.target.id!=="impConfirmar") return;
    const novos = imp.linhas.filter(l=>l.acao==="criar"), baixas = imp.linhas.filter(l=>l.acao==="baixar");
    if(!await confirmDialog({titulo:"Importar extrato", mensagem:novos.length+" lançamento(s) novo(s) e "+baixas.length+" baixa(s) em contas em aberto.", textoOk:"Importar"})) return;
    const ok = await seguro(async ()=>{
      for(const l of baixas) await baixarTitulo(l.alvo, l.data, l.valor);
      if(novos.length) await inserirTitulos(novos.map(l=>({tipo:l.tipo, descricao:l.descricao, valor:l.valor, vencimento:l.data,
        status:"pago", pago_em:l.data, valor_pago:l.valor, origem:"importado", conta_id:imp.conta||null})));
    }, "Erro ao importar");
    if(ok){ toast("Importação concluída."); imp.bruto = []; imp.linhas = []; render(); }
  });
}
