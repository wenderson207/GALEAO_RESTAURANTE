// Peças reaproveitadas pelas páginas administrativas
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { esc, num, inputData } from "../../core/util.js";
import { STATUS, chaveDia } from "../../core/previsao.js";

const DIA = 86400000;

export function selo(statusId, texto) {
  const s = STATUS[statusId] || STATUS.normal;
  return `<span class="selo selo-${s.cor}">${esc(texto || s.rotulo)}</span>`;
}

export function fotoMini(p) {
  return p?.foto ? `<img class="mini-foto" src="${esc(p.foto)}" alt="">` : `<span class="mini-foto">📦</span>`;
}

export function produtosFiltrados(unidadeId, incluirInativos = false) {
  return sync.lista("produtos")
    .filter((p) => (incluirInativos || p.ativo !== false) && (!unidadeId || p.unidadeId === unidadeId))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
}

export function categorias() {
  const base = sync.empresa()?.categorias || ["Grãos", "Massas", "Carnes", "Bebidas", "Hortifruti", "Limpeza", "Outros"];
  const extras = sync.lista("produtos").map((p) => p.categoria).filter(Boolean);
  return [...new Set([...base, ...extras])];
}

export function opcoesUnidade(sel, comTodas = false) {
  return (comTodas ? `<option value="">Todas</option>` : "")
    + estado.unidadesPermitidas().map((u) => `<option value="${u.id}" ${u.id === sel ? "selected" : ""}>${esc(u.nome)}</option>`).join("");
}

export function opcoesFornecedor(sel) {
  return `<option value="">—</option>` + sync.lista("fornecedores").filter((f) => f.ativo !== false)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
    .map((f) => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${esc(f.nome)}</option>`).join("");
}

export function vazio(emoji, texto) {
  return `<div class="vazio"><span class="emoji">${emoji}</span>${texto}</div>`;
}

// Período: { de, ate } em ms (ate = fim do dia)
export function periodoPadrao(dias = 30) {
  const ate = new Date(); ate.setHours(23, 59, 59, 999);
  const de = new Date(ate.getTime() - (dias - 1) * DIA); de.setHours(0, 0, 0, 0);
  return { de: de.getTime(), ate: ate.getTime() };
}
export function camposPeriodo(p) {
  return `
    <label class="campo"><span>De</span><input type="date" data-de value="${inputData(p.de)}"></label>
    <label class="campo"><span>Até</span><input type="date" data-ate value="${inputData(p.ate)}"></label>`;
}
export function lerPeriodo(raiz, p) {
  const de = raiz.querySelector("[data-de]")?.value, ate = raiz.querySelector("[data-ate]")?.value;
  if (de) p.de = new Date(de + "T00:00:00").getTime();
  if (ate) p.ate = new Date(ate + "T23:59:59").getTime();
  return p;
}

// Consumo diário (a partir do agregado consumoDiario) para gráfico dos últimos N dias
export function serieConsumo(unidadeId, dias = 30, produtoIds = null) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mapa = {};
  for (const cd of sync.lista("consumoDiario")) {
    if (unidadeId && cd.unidadeId !== unidadeId) continue;
    let t = 0;
    for (const [pid, q] of Object.entries(cd.itens || {})) if (!produtoIds || produtoIds.has(pid)) t += Number(q || 0);
    mapa[cd.dia] = (mapa[cd.dia] || 0) + t;
  }
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * DIA);
    const k = chaveDia(d);
    serie.push({ dia: k, rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), valor: mapa[k] || 0 });
  }
  return serie;
}

export function graficoBarras(serie, sufixo = "") {
  const max = Math.max(1, ...serie.map((s) => s.valor));
  if (!serie.some((s) => s.valor > 0)) return vazio("📉", "Ainda não há retiradas neste período.");
  return `
    <div class="barras">${serie.map((s) => `<div class="b" style="height:${(s.valor / max) * 100}%" data-v="${s.rotulo}: ${num(s.valor)}${sufixo}"></div>`).join("")}</div>
    <div class="barras-legenda"><span>${serie[0].rotulo}</span><span>${serie[Math.floor(serie.length / 2)].rotulo}</span><span>${serie[serie.length - 1].rotulo}</span></div>`;
}

export function ranking(itens, formatar = (v) => num(v)) {
  if (!itens.length) return vazio("📊", "Sem dados no período.");
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return `<div class="ranking">${itens.map((i) => `
    <div class="item"><span>${esc(i.nome)}</span><b>${formatar(i.valor, i)}</b>
      <div class="trilho"><i style="width:${(i.valor / max) * 100}%"></i></div></div>`).join("")}</div>`;
}

export function exportarCSV(nomeArquivo, cabecalho, linhas) {
  const escCSV = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [cabecalho, ...linhas].map((l) => l.map(escCSV).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
