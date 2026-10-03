/* =====================================================================
   Migração dos dados do app antigo (lancamentos / recorrentes /
   pendentes) para o modelo novo (titulos / recorrencias / contas).

   Uso (na pasta do projeto, com Node 18+):
     node tools/migrar_v1_para_v2.js            → só mostra o plano (não grava nada)
     node tools/migrar_v1_para_v2.js --aplicar  → grava no Supabase

   Lê as credenciais de assets/js/config.js. As tabelas antigas NÃO são
   alteradas — continuam como backup. Recusa rodar duas vezes (se já
   houver títulos), a menos que use --forcar.
   ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const cfg = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "config.js"), "utf8");
const URL_ = cfg.match(/SUPA_URL\s*=\s*"([^"]+)"/)[1];
const KEY = cfg.match(/SUPA_KEY\s*=\s*"([^"]+)"/)[1];
const APLICAR = process.argv.includes("--aplicar"), FORCAR = process.argv.includes("--forcar");

async function rest(p, opts = {}){
  const r = await fetch(URL_ + "/rest/v1/" + p, {...opts, headers:{apikey:KEY, Authorization:"Bearer "+KEY, "Content-Type":"application/json", Prefer:"return=representation", ...(opts.headers||{})}});
  const t = await r.text(); if(!r.ok) throw new Error(p+" → "+r.status+" "+t);
  return t ? JSON.parse(t) : null;
}
const ORDEM = {saldos:"ano,mes", recorrentes_override:"recorrente_id,ano,mes"};
const lerTudo = async tab => { let out = [], de = 0; for(;;){ const d = await rest(tab+"?select=*&order="+(ORDEM[tab]||"id"), {headers:{Range:de+"-"+(de+999), "Range-Unit":"items"}}); out = out.concat(d); if(d.length<1000) return out; de += 1000; } };

/* ---- datas ---- */
const pad = n => String(n).padStart(2,"0");
const diasNoMes = (a,m) => new Date(a,m+1,0).getDate();
function iso(a,m,d){ const x = new Date(a,m,1); const A = x.getFullYear(), M = x.getMonth(); return A+"-"+pad(M+1)+"-"+pad(Math.min(Math.max(d||1,1), diasNoMes(A,M))); }
const iniMes = (a,m) => iso(a,m,1);
const hoje = (()=>{ const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); })();
const [HA, HM] = hoje.split("-").map(Number).map((n,i)=>i===1?n-1:n);
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();
const arred = v => Math.round(v*100)/100;

/* ---- classificação de categoria (cartão + pessoa) ---- */
function classif(cat){
  const c = (cat||"").trim();
  if(/jackeline/i.test(c)){
    const resto = c.replace(/jackeline/ig,"").trim().toUpperCase();
    const cartao = {INTER:"Inter", NUBANK:"Nubank"}[resto] || null;
    return {pessoa:"Jackeline", conta:cartao, categoria: cartao ? "Cartão de crédito" : "Outros"};
  }
  return {pessoa:null, conta:null, categoria:c||null};
}
function parcelasDe(desc){
  const m = String(desc||"").match(/^(.*?)\s*\((\d+)\/(\d+)\)\s*$/);
  return m ? {descricao:m[1].trim()||"(sem descrição)", parcela:+m[2], parcelas:+m[3]} : {descricao:(desc||"").trim()||"(sem descrição)", parcela:null, parcelas:null};
}

(async()=>{
  const [lanc, recs, ovs, pend, saldos] = await Promise.all(["lancamentos","recorrentes","recorrentes_override","pendentes","saldos"].map(lerTudo));
  console.log("Origem:", {lancamentos:lanc.length, recorrentes:recs.length, overrides:ovs.length, pendentes:pend.length, saldos:saldos.length});

  if(APLICAR && !FORCAR){
    const ja = await rest("titulos?select=id&limit=1");
    if(ja.length){ console.error("Já existem títulos no banco novo. Nada foi feito (use --forcar se for de propósito)."); process.exit(1); }
  }

  /* ---------- títulos já pagos (lançamentos) ---------- */
  const tit = [];   // {…, _conta, _recKey}
  lanc.forEach(l=>{
    const k = classif(l.categoria), p = parcelasDe(l.descricao), d = iso(l.ano,l.mes,l.dia);
    tit.push({tipo:l.tipo, descricao:p.descricao, categoria:k.categoria, pessoa:k.pessoa, _conta:k.conta, valor:Number(l.valor), vencimento:d,
      status:"pago", pago_em:d, valor_pago:Number(l.valor), grupo:l.grupo||null, parcela:p.parcela, parcelas:p.parcelas, origem:l.origem||"manual",
      _recVelho: l.origem_recorrente_id ? "r:"+l.origem_recorrente_id : null, _ano:l.ano, _mes:l.mes});
  });

  /* ---------- recorrências ---------- */
  const rec = [];   // {_key, tipo, descricao, categoria, pessoa, _conta, valor, dia, inicio}
  const inicioRec = iniMes(HA, HM-1);       // a partir do mês passado (o que ficou em aberto lá)
  recs.forEach(r=>{ const k = classif(r.categoria); rec.push({_key:"r:"+r.id, tipo:r.tipo, descricao:r.descricao||"(sem descrição)", categoria:k.categoria, pessoa:k.pessoa, _conta:k.conta, valor:Number(r.valor), dia:r.dia, inicio:inicioRec}); });
  pend.filter(p=>p.recorrente).forEach(p=>{ const k = classif(p.categoria); rec.push({_key:"p:"+p.id, _pend:p, tipo:p.tipo, descricao:p.descricao||"(sem descrição)", categoria:k.categoria, pessoa:k.pessoa, _conta:k.conta, valor:Number(p.valor), dia:p.venc_dia||1, inicio:inicioRec}); });

  const ovMap = {}; ovs.forEach(o=>{ ovMap["r:"+o.recorrente_id+"|"+o.ano+"|"+o.mes] = o; });
  const HORIZONTE = 14;
  rec.forEach(r=>{
    for(let i=-1;i<HORIZONTE;i++){                       // mês passado + mês atual + horizonte
      const d = new Date(HA, HM+i, 1), a = d.getFullYear(), m = d.getMonth();
      const base = {tipo:r.tipo, descricao:r.descricao, categoria:r.categoria, pessoa:r.pessoa, _conta:r._conta, valor:r.valor, vencimento:iso(a,m,r.dia), status:"aberto", origem:"manual", _recKey:r._key, competencia:iniMes(a,m)};
      // já resolvido no app antigo? então o título pago correspondente é que vira o da competência
      const pagoVelho = tit.find(t=>t._recVelho===r._key && t._ano===a && t._mes===m);
      if(pagoVelho){ pagoVelho._recKey = r._key; pagoVelho.competencia = base.competencia; continue; }
      if(r._pend && r._pend.baixa_ano===a && r._pend.baixa_mes===m){
        const par = tit.find(t=>!t._recKey && t._ano===a && t._mes===m && t.tipo===r.tipo && Math.abs(t.valor-r.valor)<0.01 && norm(t.descricao)===norm(r.descricao));
        if(par){ par._recKey = r._key; par.competencia = base.competencia; }
        continue;
      }
      const ov = ovMap[r._key+"|"+a+"|"+m];
      if(ov){
        const k = classif(ov.categoria);
        Object.assign(base, {tipo:ov.tipo, descricao:ov.descricao||base.descricao, categoria:k.categoria, valor:Number(ov.valor), vencimento:iso(a,m,ov.dia)});
        if(ov.pulado) base.status = "cancelado";
      }
      tit.push(base);
    }
  });

  /* ---------- pendentes avulsos ---------- */
  pend.filter(p=>!p.recorrente).forEach(p=>{
    const k = classif(p.categoria), pc = parcelasDe(p.descricao);
    const venc = p.venc_ano!=null && p.venc_mes!=null ? iso(p.venc_ano, p.venc_mes, p.venc_dia||1) : (p.venc_dia ? iso(HA,HM,p.venc_dia) : hoje);
    tit.push({tipo:p.tipo, descricao:pc.descricao, categoria:k.categoria, pessoa:k.pessoa, _conta:k.conta, valor:Number(p.valor), vencimento:venc,
      status:"aberto", grupo:p.grupo||null, parcela:pc.parcela, parcelas:pc.parcelas, origem:p.origem||"manual"});
  });

  /* ---------- contas e saldo inicial ---------- */
  const nomesCartao = [...new Set([...tit.map(t=>t._conta), ...rec.map(r=>r._conta)].filter(Boolean))];
  const principal = "Conta principal";
  const movimento = t => (t.tipo==="entrada"?1:-1) * (t.valor_pago!=null ? t.valor_pago : t.valor);
  let saldoInicial = 0, refDia = null;
  if(saldos.length){
    const s = saldos.sort((a,b)=>a.ano*12+a.mes-(b.ano*12+b.mes))[0];
    refDia = new Date(s.ano, s.mes, 0);                  // último dia do mês anterior ao saldo informado
    const refIso = iso(refDia.getFullYear(), refDia.getMonth(), refDia.getDate());
    const soAntes = tit.filter(t=>t.status==="pago" && t.pago_em<=refIso).reduce((a,t)=>a+movimento(t),0);
    saldoInicial = arred(Number(s.valor) - soAntes);
  }
  const saldoHoje = arred(saldoInicial + tit.filter(t=>t.status==="pago" && t.pago_em<=hoje).reduce((a,t)=>a+movimento(t),0));

  /* ---------- resumo ---------- */
  const porStatus = {}; tit.forEach(t=>porStatus[t.status] = (porStatus[t.status]||0)+1);
  console.log("\nPLANO:");
  console.log(" contas:", [principal, ...nomesCartao.map(n=>n+" (cartão)")].join(", "), "| saldo inicial da principal:", saldoInicial);
  console.log(" recorrências:", rec.length, "| títulos:", tit.length, porStatus);
  console.log(" saldo real hoje (", hoje, ") ficaria:", saldoHoje);
  console.log(" pessoas:", [...new Set(tit.map(t=>t.pessoa).filter(Boolean))].join(", ")||"-");
  if(!APLICAR){ console.log("\n(simulação — nada foi gravado. Use --aplicar para gravar.)"); return; }

  /* ---------- grava ---------- */
  const contasNovas = await rest("contas", {method:"POST", body:JSON.stringify([
    {nome:principal, tipo:"corrente", saldo_inicial:saldoInicial},
    ...nomesCartao.map(n=>({nome:n, tipo:"cartao", saldo_inicial:0}))])});
  const idConta = {}; contasNovas.forEach(c=>idConta[c.nome] = c.id);
  const contaDe = x => idConta[x._conta] || idConta[principal];

  const recNovas = await rest("recorrencias", {method:"POST", body:JSON.stringify(rec.map(r=>({tipo:r.tipo, descricao:r.descricao, categoria:r.categoria, pessoa:r.pessoa,
    conta_id:contaDe(r), valor:r.valor, dia:r.dia, inicio:r.inicio})))});
  const idRec = {}; rec.forEach((r,i)=>idRec[r._key] = recNovas[i].id);

  const linhas = tit.map(t=>{
    const o = {tipo:t.tipo, descricao:t.descricao, categoria:t.categoria, pessoa:t.pessoa, conta_id:contaDe(t), valor:t.valor, vencimento:t.vencimento, status:t.status,
      pago_em:t.pago_em||null, valor_pago:t.valor_pago!=null?t.valor_pago:null, grupo:t.grupo||null, parcela:t.parcela||null, parcelas:t.parcelas||null, origem:t.origem||"manual",
      recorrencia_id:t._recKey ? idRec[t._recKey] : null, competencia:t._recKey ? t.competencia : null};
    return o;
  });
  for(let i=0;i<linhas.length;i+=200){
    await rest("titulos", {method:"POST", body:JSON.stringify(linhas.slice(i,i+200)), headers:{Prefer:"return=minimal"}});
    process.stdout.write(".");
  }
  console.log("\nMigração concluída:", linhas.length, "títulos,", recNovas.length, "recorrências,", contasNovas.length, "contas.");
})().catch(e=>{ console.error("ERRO:", e.message); process.exit(1); });
