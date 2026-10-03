/* =====================================================================
   Inicialização, navegação entre telas e redesenho.
   ===================================================================== */
"use strict";

const TELAS = {
  hoje:     {titulo:"Hoje — o que receber e pagar", mes:true,  render:()=>renderHoje()},
  agenda:   {titulo:"Agenda do mês",                mes:true,  render:()=>renderAgenda()},
  contas:   {titulo:"Contas e pessoas",             mes:true,  render:()=>renderContas()},
  importar: {titulo:"Importar extrato",             mes:false, render:()=>renderImportar()},
  analises: {titulo:"Análises e projeção",          mes:true,  render:()=>renderAnalises()}
};

function render(){
  const tela = TELAS[state.view];
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

async function iniciar(){
  const cred = credenciais();
  if(!cred){ document.getElementById("telaConectar").style.display = "flex"; return; }
  if(!conectar(cred.url, cred.key, false)) return;
  try{
    await carregar();
    await garantirRecorrencias();
  }catch(e){
    const msg = String(e.message||e);
    toast(/relation .* does not exist|schema cache/i.test(msg)
      ? "As tabelas novas não existem no Supabase. Rode o sql/v2_schema.sql no SQL Editor."
      : "Erro ao carregar os dados: "+msg, "erro");
    return;
  }
  document.getElementById("telaConectar").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("fabNovo").style.display = "flex";
  render();
}

document.addEventListener("DOMContentLoaded", ()=>{
  ligarHoje(); ligarAgenda(); ligarContas(); ligarImportar(); ligarAnalises();

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
