/* =====================================================================
   Inicialização, navegação entre telas e redesenho.
   ===================================================================== */
"use strict";

const TELAS = {
  hoje:     {titulo:"Hoje — o que receber e pagar", mes:true,  render:()=>renderHoje()},
  lista:    {titulo:"Todas as contas",             mes:true,  render:()=>renderLista()},
  cartoes:  {titulo:"Cartões e faturas",          mes:true,  render:()=>renderCartoes()},
  agenda:   {titulo:"Agenda do mês",                mes:true,  render:()=>renderAgenda()},
  contas:   {titulo:"Saldos e pessoas",             mes:true,  render:()=>renderContas()},
  importar: {titulo:"Importar extrato",             mes:false, render:()=>renderImportar()},
  analises: {titulo:"Análises e projeção",          mes:true,  render:()=>renderAnalises()}
};

function render(){
  const tela = TELAS[state.view];
  if(!render.marcado && state.titulos.length){ render.marcado = true; try{ performance.mark("primeira-tela"); }catch(e){} }
  document.querySelectorAll(".view").forEach(v=>{ v.hidden = (v.id !== "view"+state.view[0].toUpperCase()+state.view.slice(1)); });
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active", n.dataset.view===state.view));
  document.getElementById("tbMes").style.visibility = tela.mes ? "visible" : "hidden";
  document.getElementById("tbPeriodo").textContent = MESES[state.mes]+" / "+state.ano;
  document.getElementById("tbTitulo").textContent = tela.titulo;
  tela.render();
  const n = state.titulos.length;
  document.getElementById("rodape").textContent = "Controle Financeiro · dados no Supabase · "+n+" título(s), "+state.recorrencias.length+" conta(s) mensal(is)";
}

function irPara(view){
  state.view = view;
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("show");
  render();
  window.scrollTo(0,0);
}

function mudarMes(delta){
  ({ano:state.ano, mes:state.mes} = somaMeses(state.ano, state.mes, delta));
  render();
}

function mostrarApp(){
  document.getElementById("telaConectar").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("fabNovo").style.display = "flex";
}

function erroDeCarga(e){
  const msg = String(e.message||e);
  toast(/relation .* does not exist|schema cache/i.test(msg)
    ? "As tabelas novas não existem no Supabase. Rode o sql/v2_schema.sql no SQL Editor."
    : "Erro ao carregar os dados: "+msg, "erro");
}

/** Abre na hora com os dados salvos no navegador e atualiza do banco em segundo plano. */
async function iniciar(){
  const cred = credenciais();
  if(!cred){ document.getElementById("telaConectar").style.display = "flex"; return; }
  if(!conectar(cred.url, cred.key, false)) return;
  mostrarApp();

  const cache = lerCache();
  const carregando = document.getElementById("carregando");
  if(cache){
    aplicarDados({contas:cache.contas, recorrencias:cache.recorrencias, titulos:cache.titulos, metas:cache.metas});
    carregando.hidden = true; render();
  }
  try{
    const dados = await buscarTudo();
    if(!gravando()){                       // não sobrescreve alterações ainda em gravação
      aplicarDados(dados); garantirRecorrencias(); salvarCache();
    }
  }catch(e){
    if(!cache){ carregando.hidden = true; erroDeCarga(e); return; }
    toast("Sem conexão com o banco — mostrando os últimos dados salvos.", "erro");
  }
  carregando.hidden = true; render();
  setTimeout(()=>{ if(typeof carregarChartJs==="function") carregarChartJs().catch(()=>{}); }, 2500);   // gráfico: baixa depois, sem atrasar a abertura
}

document.addEventListener("DOMContentLoaded", ()=>{
  ligarHoje(); ligarLista(); ligarCartoes(); ligarAgenda(); ligarContas(); ligarImportar(); ligarAnalises();

  document.getElementById("nav").addEventListener("click", e=>{ const b = e.target.closest(".nav-item"); if(b) irPara(b.dataset.view); });
  document.getElementById("mesAnt").addEventListener("click", ()=>mudarMes(-1));
  document.getElementById("mesProx").addEventListener("click", ()=>mudarMes(1));
  document.getElementById("mesHoje").addEventListener("click", ()=>{ const d = new Date(); state.ano = d.getFullYear(); state.mes = d.getMonth(); render(); });
  document.getElementById("fabNovo").addEventListener("click", ()=>abrirForm());
  document.getElementById("btnHamburger").addEventListener("click", ()=>{
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarOverlay").classList.toggle("show");
  });
  document.getElementById("sidebarOverlay").addEventListener("click", ()=>{
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("show");
  });
  document.getElementById("btnConectar").addEventListener("click", ()=>{
    const url = document.getElementById("cfgUrl").value.trim(), key = document.getElementById("cfgKey").value.trim();
    if(!url || !key){ toast("Informe a URL e a chave.", "erro"); return; }
    if(conectar(url, key, true)) iniciar();
  });
  const off = ()=>{ document.getElementById("offlineBanner").style.display = navigator.onLine ? "none" : "block"; };
  window.addEventListener("online", off); window.addEventListener("offline", off); off();

  iniciar();
});
