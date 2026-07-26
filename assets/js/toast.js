/* =====================================================================
   Toast — aviso não bloqueante no rodapé da tela (substitui a maioria
   dos alert() de erro/confirmação de ação). Erros de configuração
   inicial (conectar ao Supabase, carga inicial) continuam em alert(),
   propositalmente, por bloquearem o uso do app até serem resolvidos.
   ===================================================================== */
"use strict";

let toastTimer = null;

/** Elemento único do toast, criado sob demanda. */
function toastEl(){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  return el;
}

/** Mostra uma mensagem simples. tipo: "ok" (padrão) ou "erro". */
function toast(msg, tipo){
  const el = toastEl();
  el.textContent = msg;
  el.className = "toast show " + (tipo==="erro" ? "erro" : "ok");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.className = "toast"; }, tipo==="erro" ? 5000 : 3000);
}

/** Mostra uma mensagem com um botão de ação (ex.: "Desfazer"). */
function toastAcao(msg, textoAcao, acao){
  const el = toastEl();
  el.innerHTML = escapeHtml(msg) + ' <button type="button" class="toast-btn" id="toastBtnAcao">' + escapeHtml(textoAcao) + "</button>";
  el.className = "toast show ok";
  const fechar = ()=>{ el.className = "toast"; };
  document.getElementById("toastBtnAcao").addEventListener("click", ()=>{ fechar(); acao(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(fechar, 6000);
}
