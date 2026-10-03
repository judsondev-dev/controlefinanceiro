/* =====================================================================
   Formulário de título (novo / editar) em janela modal.
   Novo: único, parcelado ou mensal (gera uma recorrência).
   Editar: em contas mensais e parcelas, pergunta se vale só para este
   ou também para os próximos.
   ===================================================================== */
"use strict";

const CAMPOS_COMUNS = ["tipo","descricao","categoria","pessoa","conta_id","valor"];

function opcoesConta(sel){
  return '<option value="">(sem conta)</option>' + state.contas.filter(c=>c.ativa||c.id===sel).map(c=>
    '<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+escapeHtml(c.nome)+(c.tipo==="cartao"?" (cartão)":"")+'</option>').join("");
}
const datalist = (id, itens) => '<datalist id="'+id+'">'+itens.map(v=>'<option value="'+escapeHtml(v)+'">').join("")+'</datalist>';

function abrirForm(id, pre){
  const t = id ? tituloPorId(id) : null;
  pre = pre || {};
  const hoje = hojeISO();
  const mesSel = iniMes(state.ano, state.mes);
  const vencPadrao = t ? t.vencimento : pre.vencimento || (mesDe(hoje).ano===state.ano && mesDe(hoje).mes===state.mes ? hoje : mesSel);
  const tipo = t ? t.tipo : (pre.tipo || "saida");

  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML =
   '<form class="modal form-modal" autocomplete="off">'+
    '<div class="modal-head"><h3>'+(t?"Editar":"Novo")+' título</h3><button type="button" class="x" data-x>✕</button></div>'+
    '<div class="seg" role="radiogroup">'+
      '<label class="seg-op out"><input type="radio" name="tipo" value="saida"'+(tipo==="saida"?" checked":"")+'><span>Conta a pagar</span></label>'+
      '<label class="seg-op in"><input type="radio" name="tipo" value="entrada"'+(tipo==="entrada"?" checked":"")+'><span>A receber</span></label>'+
    '</div>'+
    '<div class="fgrid">'+
      '<div class="field span2"><label>Descrição</label><input name="descricao" type="text" required value="'+escapeHtml(t?t.descricao:"")+'" placeholder="Ex.: Aluguel, Cliente X..."></div>'+
      '<div class="field"><label id="lblValor">Valor</label><input name="valor" type="number" step="0.01" min="0.01" required value="'+(t?t.valor:"")+'"></div>'+
      '<div class="field"><label>Vencimento</label><input name="vencimento" type="date" required value="'+vencPadrao+'"></div>'+
      '<div class="field"><label>Conta</label><select name="conta_id">'+opcoesConta(t ? t.conta_id : pre.conta_id)+'</select></div>'+
      '<div class="field"><label>Pessoa (opcional)</label><input name="pessoa" type="text" list="dlPessoas" value="'+escapeHtml(t&&t.pessoa||"")+'" placeholder="Ex.: Jackeline"></div>'+
      '<div class="field span2"><label>Categoria</label><input name="categoria" type="text" list="dlCats" value="'+escapeHtml(t&&t.categoria||"")+'" placeholder="Ex.: Moradia, Honorários..."></div>'+
      (t ? "" :
      '<div class="field"><label>Repetição</label><select name="rep"><option value="unico">Único</option><option value="parcelado">Parcelado</option><option value="mensal">Mensal (todo mês)</option></select></div>'+
      '<div class="field" id="boxParcelas" style="display:none"><label>Nº de parcelas</label><input name="parcelas" type="number" min="2" max="120" value="2"></div>'+
      '<div class="field span2 inline"><label class="chk"><input name="jaPago" type="checkbox"> <span id="lblJaPago">Já foi pago</span></label>'+
        '<input name="pagoEm" type="date" value="'+hoje+'" style="display:none"></div>')+
      (t && t.status==="pago" ?
      '<div class="field"><label>Pago em</label><input name="pagoEmEd" type="date" required value="'+t.pago_em+'"></div>'+
      '<div class="field"><label>Valor pago</label><input name="valorPago" type="number" step="0.01" min="0.01" required value="'+valorEf(t)+'"></div>' : "")+
    '</div>'+
    datalist("dlPessoas", valoresUsados("pessoa"))+datalist("dlCats", valoresUsados("categoria"))+
    '<div class="form-acoes"><button type="button" class="btn-ghost" data-x>Cancelar</button><button type="submit" class="btn-primary">'+(t?"Salvar":"Adicionar")+'</button></div>'+
   '</form>';
  document.body.appendChild(ov);
  const f = ov.querySelector("form");
  const fechar = ()=>{ ov.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e=>{ if(e.key==="Escape") fechar(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("mousedown", e=>{ if(e.target===ov) fechar(); });
  ov.querySelectorAll("[data-x]").forEach(b=>b.addEventListener("click", fechar));

  const atualizaRotulos = ()=>{
    const ent = f.tipo.value==="entrada";
    const rotJa = f.querySelector("#lblJaPago"); if(rotJa) rotJa.textContent = ent ? "Já foi recebido" : "Já foi pago";
    f.querySelector("#lblValor").textContent = (f.rep && f.rep.value==="parcelado") ? "Valor de cada parcela" : "Valor";
  };
  f.querySelectorAll('[name="tipo"]').forEach(r=>r.addEventListener("change", atualizaRotulos));
  if(f.rep){
    f.rep.addEventListener("change", ()=>{ f.querySelector("#boxParcelas").style.display = f.rep.value==="parcelado" ? "" : "none"; atualizaRotulos(); });
    f.jaPago.addEventListener("change", ()=>{ f.pagoEm.style.display = f.jaPago.checked ? "" : "none"; });
  }
  setTimeout(()=>f.descricao.focus(), 30);

  f.addEventListener("submit", async e=>{
    e.preventDefault();
    const v = lerForm(f);
    if(!v.descricao){ toast("Informe a descrição.", "erro"); return; }
    if(!(v.valor>0)){ toast("Informe um valor maior que zero.", "erro"); return; }
    const ok = t ? await salvarEdicao(t, v) : await salvarNovo(v);
    if(ok){ fechar(); render(); }
  });
}

function lerForm(f){
  const g = n => f[n] ? f[n].value.trim() : "";
  return {
    tipo:f.tipo.value, descricao:g("descricao"), valor:arred(parseFloat(g("valor"))), vencimento:g("vencimento"),
    conta_id:g("conta_id")||null, pessoa:g("pessoa")||null, categoria:g("categoria")||null,
    rep:g("rep")||"unico", parcelas:parseInt(g("parcelas"),10)||2,
    jaPago: !!(f.jaPago && f.jaPago.checked), pagoEm:g("pagoEm"),
    pagoEmEd:g("pagoEmEd"), valorPago:f.valorPago ? arred(parseFloat(f.valorPago.value)) : null
  };
}

/* ---------------- novo ---------------- */
async function salvarNovo(v){
  const base = {tipo:v.tipo, descricao:v.descricao, categoria:v.categoria, pessoa:v.pessoa, conta_id:v.conta_id, valor:v.valor, origem:"manual"};
  const marcaPago = r => v.jaPago ? {...r, status:"pago", pago_em:v.pagoEm||v.vencimento, valor_pago:v.valor} : {...r, status:"aberto"};
  return seguro(async ()=>{
    if(v.rep==="mensal"){
      const p = partes(v.vencimento);
      const gerados = await criarRecorrencia({tipo:v.tipo, descricao:v.descricao, categoria:v.categoria, pessoa:v.pessoa,
        conta_id:v.conta_id, valor:v.valor, dia:p.dia, inicio:v.vencimento});
      if(v.jaPago){
        const comp = iniMes(p.ano, p.mes);
        const t0 = gerados.find(t=>t.competencia===comp);
        if(t0) await baixarTitulo(t0.id, v.pagoEm||v.vencimento, v.valor);
        else{
          const r = state.recorrencias[state.recorrencias.length-1];
          await inserirTitulos([marcaPago({...tituloDaRecorrencia(r, p.ano, p.mes), vencimento:v.vencimento})]);
        }
      }
      toast("Conta mensal criada — os próximos meses já estão gerados.");
    }else if(v.rep==="parcelado"){
      const p = partes(v.vencimento), grupo = uuid();
      const rows = [];
      for(let i=0;i<v.parcelas;i++){
        const r = {...base, vencimento:iso(p.ano, p.mes+i, p.dia), grupo, parcela:i+1, parcelas:v.parcelas};
        rows.push(i===0 ? marcaPago(r) : {...r, status:"aberto"});
      }
      await inserirTitulos(rows);
      toast(v.parcelas+" parcelas criadas — cada uma é paga separadamente.");
    }else{
      await inserirTitulos([marcaPago({...base, vencimento:v.vencimento})]);
      toast(v.jaPago ? "Lançado como "+(v.tipo==="entrada"?"recebido":"pago")+"." : "Título adicionado.");
    }
  }, "Erro ao salvar");
}

/* ---------------- edição ---------------- */
async function salvarEdicao(t, v){
  const comuns = {tipo:v.tipo, descricao:v.descricao, categoria:v.categoria, pessoa:v.pessoa, conta_id:v.conta_id, valor:v.valor};
  const mudouComum = CAMPOS_COMUNS.some(c => (t[c]||null) !== (comuns[c]||null));
  const mudouDia = partes(v.vencimento).dia !== partes(t.vencimento).dia;
  const proprio = {...comuns, vencimento:v.vencimento};
  if(t.status==="pago"){ proprio.pago_em = v.pagoEmEd||t.pago_em; proprio.valor_pago = v.valorPago||t.valor_pago; }

  let escopo = "este";
  const serie = t.recorrencia_id && t.status==="aberto" && (mudouComum || mudouDia);
  const parcelasGrupo = t.grupo && t.parcelas>1 && t.status==="aberto" && mudouComum;
  if(serie || parcelasGrupo){
    escopo = await chooseDialog(serie ? "Conta mensal" : "Compra parcelada",
      serie ? "Aplicar a alteração só neste mês, ou neste e nos próximos meses em aberto?" : "Aplicar a alteração só nesta parcela, ou nesta e nas próximas em aberto?",
      [{label:"Este e os próximos", value:"proximos", estilo:"primary"}, {label:"Só este", value:"este", estilo:"ghost"}, {label:"Cancelar", value:null, estilo:"ghost"}]);
    if(!escopo) return false;
  }
  return seguro(async ()=>{
    await atualizarTitulos([t.id], proprio);
    if(escopo==="proximos" && serie){
      const r = state.recorrencias.find(x=>x.id===t.recorrencia_id);
      const novoDia = partes(v.vencimento).dia;
      await atualizarRecorrencia(r.id, {...comuns, dia:novoDia});
      const seguintes = state.titulos.filter(x=>x.recorrencia_id===r.id && x.status==="aberto" && x.id!==t.id && x.competencia>t.competencia);
      for(const x of seguintes){
        const pc = partes(x.competencia);
        await atualizarTitulos([x.id], {...comuns, vencimento:iso(pc.ano, pc.mes, novoDia)});
      }
    }else if(escopo==="proximos" && parcelasGrupo){
      const ids = state.titulos.filter(x=>x.grupo===t.grupo && x.status==="aberto" && x.id!==t.id && x.parcela>t.parcela).map(x=>x.id);
      if(ids.length) await atualizarTitulos(ids, comuns);
    }
    toast("Alterações salvas.");
  }, "Erro ao salvar");
}
