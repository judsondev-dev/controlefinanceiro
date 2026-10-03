/* =====================================================================
   Tela "Cartões": a fatura de cada cartão no mês selecionado é a soma
   das compras/parcelas lançadas nele (pelo mês de vencimento). "Pagar
   fatura" dá baixa em tudo de uma vez, na data do pagamento.
   ===================================================================== */
"use strict";

function itensFatura(contaId, ano, mes){
  const ini = iniMes(ano,mes), fim = fimMes(ano,mes);
  return state.titulos.filter(t=>t.conta_id===contaId && t.status!=="cancelado" && t.vencimento>=ini && t.vencimento<=fim)
    .sort((a,b)=>a.vencimento<b.vencimento?-1:a.vencimento>b.vencimento?1:a.descricao.localeCompare(b.descricao));
}
const totalFatura = itens => arred(soma(itens, t=>-movimento(t)));   // saídas positivas, créditos abatem

/** Dia de vencimento mais usado no cartão (para sugerir ao lançar uma compra). */
function diaDoCartao(contaId){
  const c = {}; state.titulos.filter(t=>t.conta_id===contaId).forEach(t=>{ const d = partes(t.vencimento).dia; c[d] = (c[d]||0)+1; });
  const top = Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
  return top ? +top[0] : 10;
}

function situacaoFatura(itens){
  if(!itens.length) return {txt:"sem lançamentos", cls:"vazia"};
  const ab = itens.filter(t=>t.status==="aberto");
  if(!ab.length) return {txt:"paga ✓", cls:"paga"};
  const vencida = ab.some(t=>t.vencimento<hojeISO());
  return {txt: vencida ? "vencida ⏰" : (ab.length<itens.length ? "parcialmente paga" : "em aberto"), cls: vencida ? "vencida" : "aberta"};
}

function renderCartoes(){
  const cartoes = state.contas.filter(c=>c.tipo==="cartao" && c.ativa);
  const {ano, mes} = state;
  const html = cartoes.map(c=>{
    const itens = itensFatura(c.id, ano, mes), total = totalFatura(itens), sit = situacaoFatura(itens);
    const abertos = itens.filter(t=>t.status==="aberto"), aPagar = totalFatura(abertos);
    const porPessoa = {}; itens.forEach(t=>{ const p = t.pessoa || "Meu"; porPessoa[p] = (porPessoa[p]||0) - movimento(t); });
    const prox = [0,1,2,3,4,5].map(i=>{ const m = somaMeses(ano, mes, i), tt = totalFatura(itensFatura(c.id, m.ano, m.mes));
      return '<button type="button" class="mini-mes'+(i===0?" on":"")+'" data-ano="'+m.ano+'" data-mes="'+m.mes+'"><small>'+MESES[m.mes].slice(0,3)+'/'+String(m.ano).slice(2)+'</small><b>'+fmt(tt)+'</b></button>'; }).join("");
    return '<section class="cartao" data-id="'+c.id+'">'+
      '<header class="cartao-cab"><div><div class="cartao-nome">💳 '+escapeHtml(c.nome)+'</div><div class="conta-sub">Fatura de '+MESES[mes]+'/'+ano+'</div></div>'+
        '<div class="cartao-acoes"><button type="button" class="btn-ghost btn-sm" data-act="editar">✎</button><button type="button" class="btn-primary btn-sm" data-act="compra">+ Lançar compra</button></div></header>'+
      '<div class="cartao-total"><div><div class="cartao-valor">'+fmt(total)+'</div><span class="pill-sit '+sit.cls+'">'+sit.txt+'</span></div>'+
        (abertos.length ? '<button type="button" class="btn-baixa out" data-act="pagar">✓ Pagar fatura <span>'+fmt(aPagar)+'</span></button>' : "")+'</div>'+
      (Object.keys(porPessoa).length>1 || (Object.keys(porPessoa)[0] && Object.keys(porPessoa)[0]!=="Meu") ? '<div class="chips quebra">'+Object.entries(porPessoa).map(([p,v])=>'<span class="chip-info">'+escapeHtml(p)+': <b>'+fmt(v)+'</b></span>').join("")+'</div>' : "")+
      (itens.length ? '<div class="tabela"><table><tbody>'+itens.map(t=>
        '<tr class="l-row" data-id="'+t.id+'"><td class="nowrap">'+dataCurta(t.vencimento)+'</td><td><div class="t-desc">'+escapeHtml(t.descricao)+'</div><div class="t-tags">'+tagsDe(t)+'</div></td>'+
        '<td class="num '+(t.tipo==="entrada"?"in":"out")+'">'+(t.tipo==="entrada"?"−":"")+fmt(valorEf(t))+'</td><td>'+ROTULO_STATUS[t.status]+'</td><td><button type="button" class="btn-mais" data-mais>⋯</button></td></tr>').join("")+'</tbody></table></div>'
        : '<div class="vazio">Nenhuma compra nesta fatura. Use “+ Lançar compra” — parcelas já caem nos meses seguintes.</div>')+
      '<div class="mini-meses"><span class="chips-l">Próximas faturas:</span>'+prox+'</div>'+
    '</section>';
  }).join("");

  document.getElementById("viewCartoes").innerHTML =
    '<div class="flex-sp"><h2 class="sec-t">Cartões e faturas</h2><button type="button" class="btn-primary btn-sm" data-act="novo">+ Novo cartão</button></div>'+
    (html || '<div class="vazio">Nenhum cartão cadastrado. Crie um cartão para lançar compras e acompanhar a fatura de cada mês.</div>')+
    '<p class="dica">A fatura do mês é a soma das compras e parcelas lançadas no cartão com vencimento naquele mês (informe como vencimento a data em que a fatura vence). Se você ainda tem uma conta mensal tipo “Fatura do cartão” com o valor total digitado, apague-a para não contar duas vezes.</p>';
}

function formPagarFatura(contaId){
  const c = contaPorId(contaId), abertos = itensFatura(contaId, state.ano, state.mes).filter(t=>t.status==="aberto");
  const total = totalFatura(abertos);
  modalForm("Pagar fatura — "+c.nome,
    '<div class="span2 nota">Fatura de '+MESES[state.mes]+'/'+state.ano+': <b>'+fmt(total)+'</b> em '+abertos.length+' lançamento(s).<br>Todos recebem baixa de uma vez, na data abaixo.</div>'+
    '<div class="field span2"><label>Data do pagamento</label><input name="data" type="date" required value="'+hojeISO()+'"></div>',
    "Pagar "+fmt(total), f=>{
      const data = f.data.value; if(!data) return false;
      const ids = abertos.map(t=>t.id);
      return seguro(async ()=>{
        for(const id of ids) await baixarTitulo(id, data);
        toastAcao("Fatura de "+c.nome+" paga em "+dataBR(data)+".", "Desfazer", async ()=>{
          if(await seguro(async ()=>{ for(const id of ids) await reabrirTitulo(id); }, "Erro ao desfazer")) render();
        });
      }, "Erro ao pagar a fatura");
    });
}

function ligarCartoes(){
  document.getElementById("viewCartoes").addEventListener("click", e=>{
    const b = e.target.closest("button");
    const card = e.target.closest(".cartao");
    if(b && b.dataset.act==="novo") return formConta(null, "cartao");
    if(b && b.classList.contains("mini-mes")){ state.ano = +b.dataset.ano; state.mes = +b.dataset.mes; return render(); }
    if(!card) return;
    const id = card.dataset.id;
    if(b && b.dataset.act==="editar") return formConta(id);
    if(b && b.dataset.act==="pagar") return formPagarFatura(id);
    if(b && b.dataset.act==="compra") return abrirForm(null, {conta_id:id, tipo:"saida", vencimento:iso(state.ano, state.mes, diaDoCartao(id))});
    const tr = e.target.closest(".l-row"); if(!tr) return;
    if(e.target.closest("[data-mais]")) acaoMenu(tr.dataset.id); else abrirForm(tr.dataset.id);
  });
}
