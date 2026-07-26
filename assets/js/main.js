/* =====================================================================
   Inicialização — registra os eventos da página e conecta ao Supabase.
   Deve ser o ÚLTIMO script carregado.
   ===================================================================== */
"use strict";

function init(){
  // Preenche o seletor de meses
  const selMes=document.getElementById("mes");
  MESES.forEach((m,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=m; selMes.appendChild(o); });
  syncConfigInputs();

  // Credenciais: do config.js (se existir) ou das salvas no navegador
  const cfg=getCfg();
  const embutidaUrl = (typeof SUPA_URL!=="undefined") ? SUPA_URL : "";
  const embutidaKey = (typeof SUPA_KEY!=="undefined") ? SUPA_KEY : "";
  const urlInicial = embutidaUrl || cfg.url || "";
  const keyInicial = embutidaKey || cfg.key || "";
  if(urlInicial) document.getElementById("supaUrl").value=urlInicial;
  if(keyInicial) document.getElementById("supaKey").value=keyInicial;

  document.getElementById("btnConectar").addEventListener("click", ()=>{
    const url=document.getElementById("supaUrl").value.trim();
    const key=document.getElementById("supaKey").value.trim();
    if(conectar(url,key)){ mostrarStatus(true); document.getElementById("connPanel").style.display="none"; carregar(); }
  });

  // Barra fixa (navegação de mês)
  document.getElementById("tbPrev").addEventListener("click", ()=>mudarMes(-1));
  document.getElementById("tbNext").addEventListener("click", ()=>mudarMes(1));
  document.getElementById("tbHoje").addEventListener("click", irHoje);
  initColapsaveis();

  // Conexão com a internet (não confundir com a conexão ao Supabase)
  const atualizaConexaoBanner=()=>{
    const b=document.getElementById("offlineBanner");
    if(b) b.style.display = navigator.onLine ? "none" : "block";
  };
  atualizaConexaoBanner();
  window.addEventListener("online", ()=>{ atualizaConexaoBanner(); toast("Conexão com a internet restabelecida."); });
  window.addEventListener("offline", ()=>{ atualizaConexaoBanner(); toast("Você está offline. As próximas ações podem falhar.", "erro"); });

  // Projeção dos próximos meses
  document.getElementById("projMeses").addEventListener("change", e=>{
    localStorage.setItem(PROJ_KEY, e.target.value);
    renderProjecao();
  });
  document.getElementById("tbodyProj").addEventListener("click", e=>{
    const tr=e.target.closest(".proj-row");
    if(!tr) return;
    state.ano=parseInt(tr.dataset.ano,10); state.mes=parseInt(tr.dataset.mes,10);
    syncConfigInputs(); render();
    window.scrollTo({top:0, behavior:"smooth"});
  });

  // Orçamento por categoria
  document.getElementById("btnSalvarOrc").addEventListener("click", salvarOrcamento);
  ["orcCategoria","orcLimite"].forEach(id=>{
    document.getElementById(id).addEventListener("keydown", e=>{ if(e.key==="Enter") salvarOrcamento(); });
  });
  document.getElementById("orcamentosLista").addEventListener("click", async e=>{
    const ed=e.target.closest(".orc-edit");
    if(ed){
      document.getElementById("orcCategoria").value=decodeURIComponent(ed.dataset.cat);
      document.getElementById("orcLimite").value=ed.dataset.lim;
      document.getElementById("orcCategoria").focus();
      return;
    }
    const dl=e.target.closest(".orc-del");
    if(dl){
      const ok = await confirmDialog({titulo:"Remover orçamento", mensagem:"Remover este orçamento?", textoOk:"Remover", perigo:true});
      if(ok) removerOrcamento(dl.dataset.id);
    }
  });

  // Insights: clique numa categoria abre o modal com os lançamentos
  ["topReceitas","topDespesas"].forEach(id=>{
    document.getElementById(id).addEventListener("click", e=>{
      const li=e.target.closest("li[data-cat]");
      if(li) abrirCategoria(decodeURIComponent(li.dataset.cat), li.dataset.tipo);
    });
  });
  document.getElementById("catFechar").addEventListener("click", fecharCategoria);
  document.getElementById("catModal").addEventListener("click", e=>{ if(e.target.id==="catModal") fecharCategoria(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") fecharCategoria(); });
  document.getElementById("catLista").addEventListener("click", async e=>{
    const ed=e.target.closest(".cat-edit");
    if(ed){ fecharCategoria(); iniciarEdicao(ed.dataset.id, ed.dataset.rec==="true"); return; }
    const dl=e.target.closest(".cat-del");
    if(dl){
      await removerItem(dl.dataset.id, dl.dataset.rec==="true", dl.dataset.grupo||"");
      if(document.getElementById("catModal").style.display!=="none" && catAtual!=null) abrirCategoria(catAtual, tipoAtual);
      return;
    }
  });

  // Configuração do mês e formulário
  document.getElementById("btnAplicar").addEventListener("click", aplicarConfig);
  document.getElementById("btnAdd").addEventListener("click", addLancamento);
  document.getElementById("btnLimpar").addEventListener("click", limparMes);
  document.getElementById("btnExport").addEventListener("click", exportar);
  document.getElementById("saldoInicial").addEventListener("change", salvarSaldoInicial);
  document.getElementById("mes").addEventListener("change", aplicarConfig);
  document.getElementById("ano").addEventListener("change", aplicarConfig);
  ["descricao","categoria","valor","dia"].forEach(id=>{
    document.getElementById(id).addEventListener("keydown", e=>{ if(e.key==="Enter") addLancamento(); });
  });
  document.getElementById("btnCancelarEd").addEventListener("click", finalizarEdicao);
  document.getElementById("fabAdd").addEventListener("click", abrirNovoLancamento);

  // Tabela do fluxo (inclui os pendentes exibidos na linha do dia)
  document.getElementById("tbody").addEventListener("click", e=>{
    const pl=e.target.closest(".pend-lancar");
    if(pl){ baixaDireta(pl.dataset.pid); return; }
    const pe=e.target.closest(".pend-edit");
    if(pe){ iniciarEdicaoPendente(pe.dataset.pid); return; }
    const pr=e.target.closest(".pend-remover");
    if(pr){ removerPendente(pr.dataset.pid); return; }
    const ed=e.target.closest(".edit-x");
    if(ed){ iniciarEdicao(ed.dataset.eid, ed.dataset.erec==="true"); return; }
    const sk=e.target.closest(".skip-x");
    if(sk){ pularRecorrente(sk.dataset.rid); return; }
    const rs=e.target.closest(".restore-x");
    if(rs){ restaurarRecorrente(rs.dataset.rid); return; }
    const x=e.target.closest(".del-x");
    if(x) removerItem(x.dataset.id, x.dataset.rec==="true", x.dataset.grupo||"");
  });

  // Importação de extrato e lista de pendentes
  document.getElementById("btnImportExtrato").addEventListener("click", ()=>document.getElementById("fileExtrato").click());
  document.getElementById("fileExtrato").addEventListener("change", e=>{ if(e.target.files[0]) importarExtrato(e.target.files[0]); e.target.value=""; });
  document.getElementById("pendentesLista").addEventListener("click", e=>{
    const ed=e.target.closest(".pend-edit");
    if(ed){ iniciarEdicaoPendente(ed.dataset.pid); return; }
    const rb=e.target.closest(".pend-reabrir");
    if(rb){ reabrirPendente(rb.dataset.pid); return; }
    const b=e.target.closest(".pend-baixa");
    if(b){ iniciarBaixa(b.dataset.pid); return; }
    const d=e.target.closest(".pend-del");
    if(d){ removerPendente(d.dataset.pid); return; }
  });

  // Conecta automaticamente com as credenciais salvas (config.js ou navegador)
  if(urlInicial && keyInicial){
    if(conectar(urlInicial,keyInicial)){
      mostrarStatus(true); carregar();
      document.getElementById("connPanel").style.display="none"; // já conectado: esconde o painel
    }
  }
  else { mostrarStatus(false); }
}

init();
