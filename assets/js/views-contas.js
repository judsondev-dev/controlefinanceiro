/* =====================================================================
   Tela "Contas e pessoas": saldo de cada conta/cartão, ajuste do saldo
   real e resumo do que se deve/recebe por pessoa.
   ===================================================================== */
"use strict";

/** Modal genérico com formulário. onSubmit recebe o <form> e retorna true para fechar. */
function modalForm(titulo, campos, textoOk, onSubmit){
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = '<form class="modal form-modal" autocomplete="off"><div class="modal-head"><h3>'+escapeHtml(titulo)+'</h3><button type="button" class="x" data-x>✕</button></div>'+
    '<div class="fgrid">'+campos+'</div>'+
    '<div class="form-acoes"><button type="button" class="btn-ghost" data-x>Cancelar</button><button type="submit" class="btn-primary">'+escapeHtml(textoOk)+'</button></div></form>';
  document.body.appendChild(ov);
  const f = ov.querySelector("form");
  const fechar = ()=>{ ov.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e=>{ if(e.key==="Escape") fechar(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("mousedown", e=>{ if(e.target===ov) fechar(); });
  ov.querySelectorAll("[data-x]").forEach(b=>b.addEventListener("click", fechar));
  f.addEventListener("submit", async e=>{ e.preventDefault(); if(await onSubmit(f)){ fechar(); render(); } });
  setTimeout(()=>{ const p = f.querySelector("input,select"); if(p) p.focus(); }, 30);
}

const TIPO_CONTA = {corrente:"Conta corrente", dinheiro:"Dinheiro", cartao:"Cartão de crédito"};

function formConta(id){
  const c = id ? contaPorId(id) : null;
  modalForm(c?"Editar conta":"Nova conta",
    '<div class="field span2"><label>Nome</label><input name="nome" type="text" required value="'+escapeHtml(c?c.nome:"")+'" placeholder="Ex.: Inter, Nubank, Carteira"></div>'+
    '<div class="field"><label>Tipo</label><select name="tipo">'+Object.keys(TIPO_CONTA).map(k=>'<option value="'+k+'"'+(c&&c.tipo===k?" selected":"")+'>'+TIPO_CONTA[k]+'</option>').join("")+'</select></div>'+
    '<div class="field"><label>Saldo inicial</label><input name="saldo" type="number" step="0.01" value="'+(c?c.saldo_inicial:0)+'"></div>'+
    '<div class="field span2 inline"><label class="chk"><input name="ativa" type="checkbox"'+(!c||c.ativa?" checked":"")+'> <span>Conta ativa (aparece nas listas)</span></label></div>',
    c?"Salvar":"Criar", f=>{
      const campos = {nome:f.nome.value.trim(), tipo:f.tipo.value, saldo_inicial:arred(parseFloat(f.saldo.value)||0), ativa:f.ativa.checked};
      if(!campos.nome){ toast("Informe o nome.", "erro"); return false; }
      return seguro(async ()=>{
        if(c){
          const {error} = await db.from("contas").update(campos).eq("id", c.id); if(error) throw error;
          Object.assign(c, campos);
        }else{
          const {data, error} = await db.from("contas").insert(campos).select(); if(error) throw error;
          state.contas.push(normConta(data[0]));
        }
      }, "Erro ao salvar conta");
    });
}

/** Ajusta o saldo inicial para que o saldo real de hoje da conta fique igual ao valor informado. */
function formAjusteSaldo(id){
  const c = contaPorId(id), atual = saldoDaConta(c);
  modalForm("Ajustar saldo — "+c.nome,
    '<div class="span2 nota">Saldo real calculado hoje: <b>'+fmt(atual)+'</b>.<br>Informe o saldo que aparece no banco agora; o app corrige o saldo inicial desta conta para bater.</div>'+
    '<div class="field span2"><label>Saldo real agora</label><input name="alvo" type="number" step="0.01" required value="'+atual+'"></div>',
    "Ajustar", f=>{
      const alvo = arred(parseFloat(f.alvo.value)); if(isNaN(alvo)) return false;
      const novoInicial = arred(c.saldo_inicial + (alvo - atual));
      return seguro(async ()=>{
        const {error} = await db.from("contas").update({saldo_inicial:novoInicial}).eq("id", c.id); if(error) throw error;
        c.saldo_inicial = novoInicial;
        toast("Saldo de “"+c.nome+"” ajustado para "+fmt(alvo)+".");
      }, "Erro ao ajustar");
    });
}

function renderContas(){
  const h = hojeISO(), {ano, mes} = state, ini = iniMes(ano,mes), fim = fimMes(ano,mes);
  const cards = state.contas.map(c=>{
    const abertos = state.titulos.filter(t=>t.conta_id===c.id && t.status==="aberto" && t.tipo==="saida");
    const noMes = soma(abertos.filter(t=>t.vencimento<=fim), t=>t.valor);
    const pagoMes = soma(state.titulos.filter(t=>t.conta_id===c.id && t.status==="pago" && t.tipo==="saida" && t.pago_em>=ini && t.pago_em<=fim), valorEf);
    const cartao = c.tipo==="cartao";
    return '<div class="conta'+(c.ativa?"":" inativa")+'" data-id="'+c.id+'">'+
      '<div class="conta-top"><div><div class="conta-nome">'+escapeHtml(c.nome)+'</div><div class="conta-tipo">'+TIPO_CONTA[c.tipo]+(c.ativa?"":" · arquivada")+'</div></div>'+
        '<button type="button" class="btn-mais" data-act="editar" title="Editar">✎</button></div>'+
      (cartao ? '<div class="conta-valor">'+fmt(noMes)+'</div><div class="conta-sub">em aberto até '+dataCurta(fim)+' · pago no mês: '+fmt(pagoMes)+'</div>'
              : '<div class="conta-valor '+(saldoDaConta(c)<0?"neg":"")+'">'+fmt(saldoDaConta(c))+'</div><div class="conta-sub">saldo real · a pagar no mês: '+fmt(noMes)+'</div>')+
      (cartao ? "" : '<button type="button" class="btn-ghost btn-sm" data-act="ajustar">Ajustar saldo</button>')+
    '</div>';
  }).join("");

  const semConta = soma(state.titulos.filter(t=>!t.conta_id && t.status==="pago" && t.pago_em<=h), movimento);
  const pessoas = valoresUsados("pessoa").map(p=>{
    const ts = state.titulos.filter(t=>t.pessoa===p);
    return {p,
      pagar: soma(ts.filter(t=>t.status==="aberto" && t.tipo==="saida"), t=>t.valor),
      receber: soma(ts.filter(t=>t.status==="aberto" && t.tipo==="entrada"), t=>t.valor),
      pagoMes: soma(ts.filter(t=>t.status==="pago" && t.tipo==="saida" && t.pago_em>=ini && t.pago_em<=fim), valorEf),
      qtd: ts.filter(t=>t.status==="aberto").length};
  });

  document.getElementById("viewContas").innerHTML =
    '<div class="kpis"><div class="kpi"><div class="kpi-l">Saldo real total hoje</div><div class="kpi-v '+(saldoEm(h)<0?"neg":"")+'">'+fmt(saldoEm(h))+'</div>'+
      '<div class="kpi-s">'+(Math.abs(semConta)>0.004 ? 'inclui '+fmt(semConta)+' de movimentos sem conta' : 'soma das contas')+'</div></div></div>'+
    '<div class="flex-sp"><h2 class="sec-t">Contas e cartões</h2><button type="button" class="btn-primary btn-sm" data-act="nova">+ Nova conta</button></div>'+
    (cards ? '<div class="contas-grid">'+cards+'</div>' : '<div class="vazio">Nenhuma conta ainda. Crie uma para acompanhar saldos separados — ou use só o saldo geral.</div>')+
    '<h2 class="sec-t" style="margin-top:26px">Por pessoa</h2>'+
    (pessoas.length ? '<div class="tabela"><table><thead><tr><th>Pessoa</th><th class="num">A pagar (aberto)</th><th class="num">A receber (aberto)</th><th class="num">Pago em '+MESES[mes]+'</th><th></th></tr></thead><tbody>'+
      pessoas.map(x=>'<tr><td><b>'+escapeHtml(x.p)+'</b> <small>('+x.qtd+' em aberto)</small></td><td class="num out">'+fmt(x.pagar)+'</td><td class="num in">'+fmt(x.receber)+'</td><td class="num">'+fmt(x.pagoMes)+'</td>'+
        '<td><button type="button" class="btn-ghost btn-sm" data-pessoa="'+escapeHtml(x.p)+'">Ver na tela Hoje</button></td></tr>').join("")+'</tbody></table></div>'
      : '<div class="vazio">Use o campo “Pessoa” ao lançar para ver aqui quanto cada pessoa deve ou tem a receber.</div>');
}

function ligarContas(){
  document.getElementById("viewContas").addEventListener("click", e=>{
    const b = e.target.closest("button"); if(!b) return;
    const card = b.closest(".conta");
    if(b.dataset.act==="nova") formConta();
    else if(b.dataset.act==="editar") formConta(card.dataset.id);
    else if(b.dataset.act==="ajustar") formAjusteSaldo(card.dataset.id);
    else if(b.dataset.pessoa!=null){ state.pessoa = b.dataset.pessoa; irPara("hoje"); }
  });
}
