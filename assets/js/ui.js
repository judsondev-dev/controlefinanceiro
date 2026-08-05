/* =====================================================================
   Interface — controle do formulário (edição/baixa), modal de categoria,
   navegação de mês, seções recolhíveis e exportação.
   Não grava no banco: prepara a tela e delega para actions.js.
   ===================================================================== */
"use strict";

/* ---------- Formulário: edição de lançamento ---------- */

/** Carrega um lançamento no formulário para edição. */
function iniciarEdicao(id, rec){
  let item;
  if(rec){
    const r = state.recorrentes.find(x=>x.id===id);
    const ov = state.overrides[ovKey(id, state.ano, state.mes)];
    item = ov || r;
  }else{
    item = state.lancamentos.find(l=>l.id===id);
  }
  if(!item){ return; }
  editando = {id, rec};
  const temGrupo = !rec && !!item.grupo;
  const plano = !rec && !temGrupo; // lançamento avulso: permite converter em fixo/espera
  document.getElementById("tipo").value = item.tipo;
  document.getElementById("dia").value = item.dia;
  document.getElementById("descricao").value = item.descricao || "";
  document.getElementById("categoria").value = item.categoria || "";
  document.getElementById("valor").value = item.valor;
  document.getElementById("recorrente").checked = rec;          // conta fixa mostra marcado
  document.getElementById("recorrente").disabled = !plano;      // avulso pode virar fixo
  document.getElementById("emEspera").checked = false;
  document.getElementById("emEspera").disabled = !plano;        // avulso pode virar "em espera"
  const p = document.getElementById("parcelas");
  p.value = "1"; p.disabled = true;
  document.getElementById("btnAdd").textContent = "Salvar edição";
  document.getElementById("btnCancelarEd").style.display = "inline-block";
  destacarFormulario();
  document.getElementById("descricao").focus();
}

/** Sai de qualquer modo especial (edição, baixa, edição de pendente). */
function finalizarEdicao(){
  editando = null;
  baixando = null;
  editandoPend = null;
  document.getElementById("recorrente").disabled = false;
  document.getElementById("recorrente").checked = false;
  document.getElementById("emEspera").disabled = false;
  document.getElementById("emEspera").checked = false;
  const p = document.getElementById("parcelas");
  p.disabled = false; p.value = "1";
  document.getElementById("btnAdd").textContent = "+ Adicionar";
  document.getElementById("btnCancelarEd").style.display = "none";
  document.getElementById("descricao").value = "";
  document.getElementById("valor").value = "";
  const painel = document.getElementById("descricao").closest(".panel");
  if(painel) painel.classList.remove("editando-form");
}

/** Expande o painel se estiver recolhido (seções começam todas fechadas). */
function expandirSeSeNecessario(painel){
  if(painel && painel.classList.contains("collapsed")){
    const h2 = painel.querySelector("h2");
    if(h2) toggleSecao(h2);
  }
}

/** Destaca o painel do formulário e rola até ele (expande se estiver recolhido). */
function destacarFormulario(){
  const painel = document.getElementById("descricao").closest(".panel");
  if(!painel) return;
  expandirSeSeNecessario(painel);
  painel.classList.add("editando-form");
  painel.scrollIntoView({behavior:"smooth", block:"center"});
}

/** Atalho do botão flutuante "+": abre a seção, expande se estiver recolhida e foca a descrição. */
function abrirNovoLancamento(){
  const painel = document.getElementById("descricao").closest(".panel");
  if(!painel) return;
  expandirSeSeNecessario(painel);
  painel.scrollIntoView({behavior:"smooth", block:"start"});
  setTimeout(()=>document.getElementById("descricao").focus(), 350);
}

/* ---------- Formulário: baixa e edição de pendentes ---------- */

/** Abre um pendente no formulário para confirmar a baixa. */
function iniciarBaixa(id){
  const p = state.pendentes.find(x=>x.id===id);
  if(!p) return;
  if(editando) finalizarEdicao();
  baixando = {id};
  // Se veio de extrato (tem data original), posiciona o app no mês da transação
  if(p.venc_ano!=null && p.venc_mes!=null){
    state.ano = p.venc_ano; state.mes = p.venc_mes;
    syncConfigInputs(); render();
  }
  document.getElementById("tipo").value = p.tipo;
  document.getElementById("dia").value = p.venc_dia || (new Date()).getDate();
  document.getElementById("descricao").value = p.descricao || "";
  document.getElementById("categoria").value = p.categoria || "";
  document.getElementById("valor").value = p.valor;
  document.getElementById("recorrente").checked = false;
  document.getElementById("recorrente").disabled = true;
  document.getElementById("emEspera").checked = false;
  document.getElementById("emEspera").disabled = true;
  const pr = document.getElementById("parcelas"); pr.value="1"; pr.disabled=false; // permite parcelar ao dar baixa
  document.getElementById("btnAdd").textContent = "Confirmar baixa → "+MESES[state.mes]+"/"+state.ano;
  document.getElementById("btnCancelarEd").style.display = "inline-block";
  destacarFormulario();
  document.getElementById("dia").focus();
}

/** Carrega um pendente no formulário para classificar/editar. */
function iniciarEdicaoPendente(id){
  const p = state.pendentes.find(x=>x.id===id);
  if(!p) return;
  if(editando) finalizarEdicao();
  editandoPend = {id};
  document.getElementById("tipo").value = p.tipo;
  document.getElementById("dia").value = p.venc_dia || "";
  document.getElementById("descricao").value = p.descricao || "";
  document.getElementById("categoria").value = p.categoria || "";
  document.getElementById("valor").value = p.valor;
  document.getElementById("recorrente").checked = !!p.recorrente;
  document.getElementById("recorrente").disabled = false; // pode alternar "mensal"
  document.getElementById("emEspera").checked = true;
  document.getElementById("emEspera").disabled = true;
  const pr = document.getElementById("parcelas"); pr.value="1"; pr.disabled=false; // >1 lança parcelado direto no fluxo
  document.getElementById("btnAdd").textContent = "Salvar em espera";
  document.getElementById("btnCancelarEd").style.display = "inline-block";
  destacarFormulario();
  document.getElementById("descricao").focus();
}

/* ---------- Modal: lançamentos de uma categoria ---------- */

/** Abre a janela com os lançamentos de uma categoria no mês. */
function abrirCategoria(cat, tipo){
  catAtual = cat; tipoAtual = tipo;
  const itens = lancamentosDoMes()
    .filter(it => it.tipo===tipo && !it.pulado && catDe(it)===cat)
    .sort((a,b)=> a.dia-b.dia);
  const cls = tipo==="entrada" ? "in" : "out";
  document.getElementById("catTitulo").innerHTML =
    escapeHtml(cat)+' <span class="pill '+cls+'" style="margin-left:6px">'+(tipo==="entrada"?"receitas":"despesas")+'</span>'+
    ' <span style="color:var(--muted);font-weight:400;font-size:13px">· '+MESES[state.mes]+'/'+state.ano+'</span>';
  let total=0, html="";
  if(!itens.length){
    html='<div class="rank-empty">Nenhum lançamento nesta categoria neste mês.</div>';
  }else{
    itens.forEach(it=>{
      total+=Number(it.valor);
      html += '<div class="cat-row">'+
        '<span class="cd">dia '+String(it.dia).padStart(2,"0")+'</span>'+
        '<span class="cn">'+escapeHtml(it.descricao||"(sem descrição)")+(it.rec?' <span class="tag rec">fixo</span>':'')+'</span>'+
        '<span class="cv '+cls+'">'+fmt(Number(it.valor))+'</span>'+
        '<span class="cat-acoes">'+
          '<span class="ico cat-edit" title="Editar" data-id="'+it.id+'" data-rec="'+it.rec+'">✎</span>'+
          '<span class="ico cat-del" title="Excluir" data-id="'+it.id+'" data-rec="'+it.rec+'" data-grupo="'+(it.grupo||"")+'">✕</span>'+
        '</span>'+
      '</div>';
    });
    html += '<div class="cat-total"><span>Total ('+itens.length+')</span><span class="'+cls+'" style="color:var(--'+(tipo==="entrada"?"in":"out")+')">'+fmt(total)+'</span></div>';
  }
  document.getElementById("catLista").innerHTML = html;
  document.getElementById("catModal").style.display = "flex";
}

function fecharCategoria(){ document.getElementById("catModal").style.display = "none"; }

/* ---------- Seleção de mês ---------- */

function aplicarConfig(){
  state.mes=parseInt(document.getElementById("mes").value,10);
  state.ano=parseInt(document.getElementById("ano").value,10);
  document.getElementById("saldoInicial").value=saldoInicialAtual()||"";
  render();
}

function syncConfigInputs(){
  document.getElementById("mes").value=state.mes;
  document.getElementById("ano").value=state.ano;
  document.getElementById("saldoInicial").value=saldoInicialAtual()||"";
}

/** Avança/retrocede o mês, virando o ano quando necessário. */
function mudarMes(delta){
  let m=state.mes+delta, a=state.ano;
  if(m<0){ m=11; a--; } if(m>11){ m=0; a++; }
  state.mes=m; state.ano=a;
  syncConfigInputs(); render();
}

/** Vai para o mês atual e rola até a linha de hoje. */
function irHoje(){
  const h=new Date();
  state.mes=h.getMonth(); state.ano=h.getFullYear();
  syncConfigInputs(); render();
  setTimeout(()=>{ const el=document.querySelector("#tbody tr.today"); if(el) el.scrollIntoView({behavior:"smooth", block:"center"}); }, 60);
}

/* ---------- Seções recolhíveis ---------- */
/* Padrão: tudo começa fechado. A lista salva guarda só as seções que o
   usuário abriu manualmente (exceção ao padrão), não as fechadas. */

function getSecsAbertas(){ try{ return JSON.parse(localStorage.getItem(SEC_KEY))||[]; }catch(e){ return []; } }

function toggleSecao(h2){
  const panel=h2.closest(".panel"); if(!panel) return;
  const nome=(h2.textContent||"").trim();
  panel.classList.toggle("collapsed");
  let secs=getSecsAbertas();
  if(!panel.classList.contains("collapsed")){ if(!secs.includes(nome)) secs.push(nome); }
  else { secs=secs.filter(s=>s!==nome); }
  localStorage.setItem(SEC_KEY, JSON.stringify(secs));
  if(chartInst && !panel.classList.contains("collapsed")) setTimeout(()=>{ try{chartInst.resize();}catch(e){} }, 60);
}

function initColapsaveis(){
  const abertas=getSecsAbertas();
  document.querySelectorAll(".panel > h2, .panel .flex-sp > h2").forEach(h2=>{
    const painel = h2.closest(".panel");
    if(painel.id==="connPanel") return; // conexão inicial: nunca começa fechada
    const nome=(h2.textContent||"").trim();
    if(!abertas.includes(nome)) painel.classList.add("collapsed");
    h2.addEventListener("click", ()=>toggleSecao(h2));
  });
}

/* ---------- Diversos ---------- */

/** Baixa um backup JSON dos dados carregados. */
function exportar(){
  const blob=new Blob([JSON.stringify({saldos:state.saldos,lancamentos:state.lancamentos,recorrentes:state.recorrentes},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="controle-financeiro-backup.json"; a.click(); URL.revokeObjectURL(a.href);
}

/** Mostra/esconde a área do app conforme o status da conexão. */
function mostrarStatus(conectado){
  document.getElementById("statusConn").textContent = conectado? "🟢 Conectado ao Supabase" : "🔴 Não conectado";
  document.getElementById("appArea").style.display = conectado? "block" : "none";
  document.getElementById("fabAdd").style.display = conectado? "flex" : "none";
}
