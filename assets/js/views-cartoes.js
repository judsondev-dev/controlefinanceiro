/* =====================================================================
   Tela "Cartões": a fatura de cada cartão no mês selecionado é a soma
   das compras/parcelas lançadas nele (pelo mês de vencimento) MAIS o que
   ficou em aberto de meses anteriores (o débito "rola" para o mês
   seguinte). Dá para pagar a fatura inteira ou só uma parte: o valor é
   abatido dos itens mais antigos primeiro.
   ===================================================================== */
"use strict";

const porVenc = (a,b) => a.vencimento<b.vencimento?-1 : a.vencimento>b.vencimento?1 : a.descricao.localeCompare(b.descricao);

function itensFatura(contaId, ano, mes){
  const ini = iniMes(ano,mes), fim = fimMes(ano,mes);
  return state.titulos.filter(t=>t.conta_id===contaId && t.status!=="cancelado" && t.vencimento>=ini && t.vencimento<=fim).sort(porVenc);
}

/** Em aberto de meses anteriores, que rola para este mês (só do mês atual em diante). */
function rolado(contaId, ano, mes){
  const h = mesDe(hojeISO());
  if(mesIdx(ano,mes) < mesIdx(h.ano,h.mes)) return [];
  const ini = iniMes(ano,mes);
  return state.titulos.filter(t=>t.conta_id===contaId && t.status==="aberto" && t.vencimento<ini).sort(porVenc);
}

const totalFatura = itens => arred(soma(itens, t=>-movimento(t)));   // saídas positivas, créditos abatem

/** Dia de vencimento mais usado no cartão (para sugerir ao lançar uma compra). */
function diaDoCartao(contaId){
  const c = {}; state.titulos.filter(t=>t.conta_id===contaId).forEach(t=>{ const d = partes(t.vencimento).dia; c[d] = (c[d]||0)+1; });
  const top = Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
  return top ? +top[0] : 10;
}

function situacaoFatura(itens, ant){
  if(!itens.length && !ant.length) return {txt:"sem lançamentos", cls:"vazia"};
  const ab = itens.filter(t=>t.status==="aberto").concat(ant);
  if(!ab.length) return {txt:"paga ✓", cls:"paga"};
  const vencida = ab.some(t=>t.vencimento<hojeISO());
  const pago = itens.some(t=>t.status==="pago");
  return {txt: vencida ? "vencida ⏰" : (pago ? "parcialmente paga" : "em aberto"), cls: vencida ? "vencida" : "aberta"};
}

function linhaFatura(t, tagExtra){
  return '<tr class="l-row" data-id="'+t.id+'"><td class="nowrap">'+dataCurta(t.vencimento)+'</td><td><div class="t-desc">'+escapeHtml(t.descricao)+'</div><div class="t-tags">'+(tagExtra||"")+tagsDe(t)+'</div></td>'+
    '<td class="num '+(t.tipo==="entrada"?"in":"out")+'">'+(t.tipo==="entrada"?"−":"")+fmt(valorEf(t))+'</td><td>'+ROTULO_STATUS[t.status]+'</td><td><button type="button" class="btn-mais" data-mais>⋯</button></td></tr>';
}

function renderCartoes(){
  const cartoes = state.contas.filter(c=>c.tipo==="cartao" && c.ativa);
  const {ano, mes} = state;
  const html = cartoes.map(c=>{
    const itens = itensFatura(c.id, ano, mes), ant = rolado(c.id, ano, mes), sit = situacaoFatura(itens, ant);
    const abertos = itens.filter(t=>t.status==="aberto").concat(ant);
    const total = arred(totalFatura(itens) + totalFatura(ant)), aPagar = totalFatura(abertos), pago = arred(total - aPagar);
    const porPessoa = {}; itens.concat(ant).forEach(t=>{ const p = t.pessoa || "Meu"; porPessoa[p] = (porPessoa[p]||0) - movimento(t); });
    const prox = [0,1,2,3,4,5].map(i=>{ const m = somaMeses(ano, mes, i), tt = totalFatura(itensFatura(c.id, m.ano, m.mes));
      return '<button type="button" class="mini-mes'+(i===0?" on":"")+'" data-ano="'+m.ano+'" data-mes="'+m.mes+'"><small>'+MESES[m.mes].slice(0,3)+'/'+String(m.ano).slice(2)+'</small><b>'+fmt(tt)+'</b></button>'; }).join("");
    return '<section class="cartao" data-id="'+c.id+'">'+
      '<header class="cartao-cab"><div><div class="cartao-nome">💳 '+escapeHtml(c.nome)+'</div><div class="conta-sub">Fatura de '+MESES[mes]+'/'+ano+'</div></div>'+
        '<div class="cartao-acoes"><button type="button" class="btn-ghost btn-sm" data-act="editar">✎</button><button type="button" class="btn-primary btn-sm" data-act="compra">+ Lançar compra</button></div></header>'+
      '<div class="cartao-total"><div><div class="cartao-valor">'+fmt(total)+'</div><span class="pill-sit '+sit.cls+'">'+sit.txt+'</span>'+
        (pago>0.004 ? ' <span class="conta-sub">pago '+fmt(pago)+' · falta <b>'+fmt(aPagar)+'</b></span>' : "")+'</div>'+
        (abertos.length ? '<button type="button" class="btn-baixa out" data-act="pagar">✓ Pagar fatura <span>'+fmt(aPagar)+'</span></button>' : "")+'</div>'+
      (ant.length ? '<div class="alerta-leve">↪ Inclui <b>'+fmt(totalFatura(ant))+'</b> em aberto de meses anteriores (rolou para este mês).</div>' : "")+
      (Object.keys(porPessoa).length>1 || (Object.keys(porPessoa)[0] && Object.keys(porPessoa)[0]!=="Meu") ? '<div class="chips quebra">'+Object.entries(porPessoa).map(([p,v])=>'<span class="chip-info">'+escapeHtml(p)+': <b>'+fmt(v)+'</b></span>').join("")+'</div>' : "")+
      ((itens.length||ant.length) ? '<div class="tabela"><table><tbody>'+ant.map(t=>linhaFatura(t,'<span class="tag atr">↪ rolado de '+MESES[mesDe(t.vencimento).mes].slice(0,3)+'</span>')).join("")+itens.map(t=>linhaFatura(t)).join("")+'</tbody></table></div>'
        : '<div class="vazio">Nenhuma compra nesta fatura. Use “+ Lançar compra” — parcelas já caem nos meses seguintes.</div>')+
      '<div class="mini-meses"><span class="chips-l">Próximas faturas (só o que vence em cada mês):</span>'+prox+'</div>'+
    '</section>';
  }).join("");

  document.getElementById("viewCartoes").innerHTML =
    '<div class="flex-sp"><h2 class="sec-t">Cartões e faturas</h2><button type="button" class="btn-primary btn-sm" data-act="novo">+ Novo cartão</button></div>'+
    (html || '<div class="vazio">Nenhum cartão cadastrado. Crie um cartão para lançar compras e acompanhar a fatura de cada mês.</div>')+
    '<p class="dica">A fatura do mês é a soma das compras e parcelas com vencimento naquele mês, mais o que ficou em aberto dos meses anteriores. Você pode pagar tudo ou só uma parte: o que não for pago continua em aberto e rola para a fatura do mês seguinte. Se ainda tem uma conta mensal tipo “Fatura do cartão” com o total digitado, apague-a para não contar duas vezes.</p>';
}

function formPagarFatura(contaId){
  const c = contaPorId(contaId);
  const itens = itensFatura(contaId, state.ano, state.mes), ant = rolado(contaId, state.ano, state.mes);
  const abertos = ant.concat(itens.filter(t=>t.status==="aberto"));
  const total = totalFatura(abertos);
  modalForm("Pagar fatura — "+c.nome,
    '<div class="span2 nota">Em aberto: <b>'+fmt(total)+'</b> ('+abertos.length+' lançamento(s)'+(ant.length?", incluindo o que rolou de meses anteriores":"")+').<br>'+
      'Informe quanto está pagando agora. Se for menos que o total, o valor é abatido dos itens <b>mais antigos primeiro</b> e o restante continua em aberto (rolando para o mês seguinte se não for pago).</div>'+
    '<div class="field"><label>Valor pago agora</label><input name="valor" type="number" step="0.01" min="0.01" max="'+total+'" required value="'+total+'"></div>'+
    '<div class="field"><label>Data do pagamento</label><input name="data" type="date" required value="'+hojeISO()+'"></div>',
    "Pagar", f=>{
      const v = arred(parseFloat(f.valor.value)), data = f.data.value;
      if(!(v>0) || !data){ toast("Informe o valor e a data.", "erro"); return false; }
      if(v > total+0.004){ toast("O valor passa do que está em aberto ("+fmt(total)+").", "erro"); return false; }
      const tudo = Math.abs(v-total) < 0.005;
      return seguro(async ()=>{
        let regs;
        if(tudo){
          regs = [];
          for(const t of abertos){ await baixarTitulo(t.id, data); regs.push({pagoId:t.id, total:true}); }
        }else{
          regs = await pagarValorEmTitulos(abertos.filter(t=>t.tipo==="saida"), v, data);
        }
        toastAcao(tudo ? "Fatura de "+c.nome+" paga em "+dataBR(data)+"." : "Pago "+fmt(v)+" na fatura de "+c.nome+" — restam "+fmt(arred(total-v))+" em aberto.", "Desfazer", async ()=>{
          if(await seguro(()=>desfazerPagamentos(regs), "Erro ao desfazer")) render();
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
