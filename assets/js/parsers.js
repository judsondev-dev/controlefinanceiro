/* =====================================================================
   Parsers de extrato bancário — CSV (padrão BR) e OFX.
   Não dependem de DOM nem do Supabase: funções puras, fáceis de testar.
   ===================================================================== */
"use strict";

/** Converte texto de valor para número. Aceita "1.234,56", "-50,00", "(50)", "R$ 10". */
function parseValorBR(s){
  if(s==null) return NaN;
  let t=String(s).trim().replace(/r\$/i,"").replace(/\s/g,"");
  let neg=false;
  if(/^\(.*\)$/.test(t)){ neg=true; t=t.slice(1,-1); }
  if(t.endsWith("-")){ neg=true; t=t.slice(0,-1); }
  if(t.startsWith("-")){ neg=true; t=t.slice(1); }
  if(t.includes(",") && t.includes(".")){ t=t.replace(/\./g,"").replace(",", "."); }
  else if(t.includes(",")){ t=t.replace(",", "."); }
  const v=parseFloat(t);
  if(isNaN(v)) return NaN;
  return neg ? -v : v;
}

/** Converte texto de data para {dia, mes(0-11), ano}. Aceita ISO, dd/mm/aaaa e YYYYMMDD. */
function parseDataBR(s){
  if(!s) return null;
  s=String(s).trim();
  let m=s.match(/^\s*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);   // ISO yyyy-mm-dd
  if(m){ return {dia:+m[3], mes:+m[2]-1, ano:+m[1]}; }
  m=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);          // dd/mm/yyyy
  if(m){ let a=+m[3]; if(a<100) a+=2000; return {dia:+m[1], mes:+m[2]-1, ano:a}; }
  m=s.match(/^(\d{4})(\d{2})(\d{2})/);                             // YYYYMMDD (OFX)
  if(m){ return {dia:+m[3], mes:+m[2]-1, ano:+m[1]}; }
  return null;
}

/** Divide uma linha CSV respeitando aspas. */
function splitCSVLine(line, delim){
  const out=[]; let cur=""; let q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(q && line[i+1]==='"'){ cur+='"'; i++; } else q=!q; }
    else if(c===delim && !q){ out.push(cur); cur=""; }
    else cur+=c;
  }
  out.push(cur);
  return out.map(x=>x.trim().replace(/^"|"$/g,""));
}

/** Extrai transações de um arquivo OFX. */
function parseOFX(text){
  const out=[];
  const blocos=text.split(/<STMTTRN>/i).slice(1);
  const tag=(b,n)=>{ const m=b.match(new RegExp("<"+n+">([^<\\r\\n]*)","i")); return m?m[1].trim():null; };
  blocos.forEach(b=>{
    const amt=tag(b,"TRNAMT"); if(amt==null) return;
    const v=parseValorBR(amt); if(isNaN(v)) return;
    const dt=parseDataBR(tag(b,"DTPOSTED")||"");
    const memo=(tag(b,"MEMO")||tag(b,"NAME")||"").trim();
    const trntype=tag(b,"TRNTYPE")||"";
    const tipo=(v<0 || /DEBIT|SAIDA|DEB/i.test(trntype))?"saida":"entrada";
    out.push({tipo, descricao:memo||"(sem descrição)", valor:Math.abs(v),
      dia:dt?dt.dia:null, mes:dt?dt.mes:null, ano:dt?dt.ano:null});
  });
  return out;
}

/** Extrai transações de um CSV, detectando separador e colunas automaticamente. */
function parseCSVExtrato(text){
  const linhas=text.split(/\r?\n/).filter(l=>l.trim());
  if(!linhas.length) return [];
  const delim=(linhas[0].split(";").length > linhas[0].split(",").length)?";":",";
  const header=splitCSVLine(linhas[0], delim).map(h=>h.toLowerCase());
  const find=(re)=>header.findIndex(h=>re.test(h));
  const iData=find(/data|date|dt/);
  const iDesc=find(/desc|hist|lan[çc]|memo|detal|estabelec/);
  const iValor=find(/valor|value|amount|montante|quantia/);
  const iCred=find(/cr[ée]d/);
  const iDeb=find(/d[ée]b/);
  const iTipo=find(/tipo|type|natureza/);
  const temHeader=(iData>=0||iValor>=0||iDesc>=0);
  const dados=temHeader?linhas.slice(1):linhas;
  const out=[];
  dados.forEach(l=>{
    const c=splitCSVLine(l, delim);
    if(!c.length) return;
    const dt=parseDataBR(iData>=0?c[iData]:c[0]);
    const desc=((iDesc>=0?c[iDesc]:(c[1]||""))||"").trim() || "(sem descrição)";
    let valor, tipo;
    if(iCred>=0 || iDeb>=0){
      const cr=iCred>=0?parseValorBR(c[iCred]):NaN;
      const de=iDeb>=0?parseValorBR(c[iDeb]):NaN;
      if(!isNaN(cr) && Math.abs(cr)>0){ tipo="entrada"; valor=Math.abs(cr); }
      else if(!isNaN(de) && Math.abs(de)>0){ tipo="saida"; valor=Math.abs(de); }
      else return;
    }else{
      const v=parseValorBR(iValor>=0?c[iValor]:c[c.length-1]);
      if(isNaN(v)||v===0) return;
      tipo=(iTipo>=0)?(/sa[íi]|deb|d[ée]b|-/i.test(c[iTipo])?"saida":"entrada"):(v<0?"saida":"entrada");
      valor=Math.abs(v);
    }
    out.push({tipo, descricao:desc, valor, dia:dt?dt.dia:null, mes:dt?dt.mes:null, ano:dt?dt.ano:null});
  });
  return out;
}

/** Detecta o formato do arquivo e devolve a lista de transações. */
function parseExtrato(text){
  if(/<OFX>|<STMTTRN>/i.test(text)) return parseOFX(text);
  return parseCSVExtrato(text);
}
