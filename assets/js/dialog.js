/* =====================================================================
   Dialogs — substituem confirm() (que sempre usa o visual padrão do
   navegador, sem estilo). Reaproveitam o mesmo modal usado na tela de
   categoria, com o tema do app. Ambos retornam uma Promise.
   ===================================================================== */
"use strict";

/**
 * Confirmação simples (Cancelar / Confirmar). Aceita uma string simples
 * ou {titulo, mensagem, textoOk, textoCancelar, perigo}. Resolve para
 * true (confirmou) ou false (cancelou/Esc/clique fora).
 */
function confirmDialog(opts){
  const cfg = typeof opts === "string" ? {mensagem: opts} : (opts||{});
  const titulo = cfg.titulo || "Confirmar";
  const mensagem = cfg.mensagem || "";
  const textoOk = cfg.textoOk || "Confirmar";
  const textoCancelar = cfg.textoCancelar || "Cancelar";
  const perigo = !!cfg.perigo;
  return new Promise(resolve=>{
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dlg-overlay";
    overlay.innerHTML =
      '<div class="modal dlg-modal">'+
        '<div class="modal-head"><h3>'+escapeHtml(titulo)+'</h3></div>'+
        '<div class="dlg-body">'+escapeHtml(mensagem).replace(/\n/g,"<br>")+'</div>'+
        '<div class="dlg-acoes">'+
          '<button type="button" class="btn-ghost" data-act="cancelar">'+escapeHtml(textoCancelar)+'</button>'+
          '<button type="button" class="'+(perigo?"btn-danger":"btn-primary")+'" data-act="ok">'+escapeHtml(textoOk)+'</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);
    const fechar = (v)=>{ overlay.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = e=>{ if(e.key==="Escape") fechar(false); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) fechar(false); });
    overlay.querySelector('[data-act="cancelar"]').addEventListener("click", ()=>fechar(false));
    overlay.querySelector('[data-act="ok"]').addEventListener("click", ()=>fechar(true));
    setTimeout(()=>overlay.querySelector('[data-act="ok"]').focus(), 20);
  });
}

/**
 * Escolha entre várias opções (substitui confirm() encadeados do tipo
 * "OK decide A, Cancelar decide entre B e C"). opcoes: [{label, value, estilo}],
 * estilo: "primary" (padrão), "danger" ou "ghost". Resolve para o value
 * escolhido, ou null se cancelado (Esc/clique fora).
 */
function chooseDialog(titulo, mensagem, opcoes){
  return new Promise(resolve=>{
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dlg-overlay";
    const botoes = opcoes.map((o,i)=>
      '<button type="button" class="btn-'+(o.estilo||"ghost")+'" data-i="'+i+'">'+escapeHtml(o.label)+'</button>'
    ).join("");
    overlay.innerHTML =
      '<div class="modal dlg-modal">'+
        '<div class="modal-head"><h3>'+escapeHtml(titulo)+'</h3></div>'+
        '<div class="dlg-body">'+escapeHtml(mensagem).replace(/\n/g,"<br>")+'</div>'+
        '<div class="dlg-acoes dlg-acoes-col">'+botoes+'</div>'+
      '</div>';
    document.body.appendChild(overlay);
    const fechar = (v)=>{ overlay.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = e=>{ if(e.key==="Escape") fechar(null); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) fechar(null); });
    overlay.querySelectorAll("[data-i]").forEach(b=>{
      b.addEventListener("click", ()=>fechar(opcoes[+b.dataset.i].value));
    });
  });
}
