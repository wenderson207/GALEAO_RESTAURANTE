// =====================================================================
// RELATÓRIOS — consumo, estoque, compras, reposição, funcionários, histórico
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { garantirHistorico } from "../../core/db.js";
import { previsoesDaUnidade } from "../../core/previsao.js";
import { esc, num, moeda, toast } from "../../core/util.js";
import { vazio, periodoPadrao, camposPeriodo, lerPeriodo, exportarCSV, ranking, selo, produtosFiltrados } from "./componentes.js";
import { linhaDias } from "./reposicao.js";

const periodo = periodoPadrao(30);
let aba = "consumo";
const ABAS = { consumo: "📉 Consumo", estoque: "📦 Estoque", compras: "📥 Compras", reposicao: "🚨 Reposição", funcionarios: "👥 Funcionários", historico: "🔄 Histórico" };

function movs(unidadeId, tipo) {
  return sync.lista("movimentacoes").filter((m) => (!tipo || m.tipo === tipo) && (!unidadeId || m.unidadeId === unidadeId)
    && (m.dataMs || 0) >= periodo.de && (m.dataMs || 0) <= periodo.ate);
}

function tabela(cab, linhas, numericas = []) {
  if (!linhas.length) return vazio("📊", "Sem dados no período.");
  return `<div class="tabela-wrap"><table><thead><tr>${cab.map((c, i) => `<th class="${numericas.includes(i) ? "num" : ""}">${c}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td class="${numericas.includes(i) ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function montar(unidadeId) {
  const csv = { cab: [], linhas: [] };
  let html = "";

  if (aba === "consumo") {
    const soma = {};
    movs(unidadeId, "saida").forEach((m) => {
      const s = soma[m.produtoId] = soma[m.produtoId] || { nome: m.produtoNome, un: m.unidadeMedida, cat: m.categoria, valor: 0, vezes: 0, custo: Number(sync.get("produtos", m.produtoId)?.custo || 0) };
      s.valor += Number(m.quantidade || 0); s.vezes++;
    });
    const dias = Math.max(1, Math.round((periodo.ate - periodo.de) / 86400000));
    const lista = Object.values(soma).sort((a, b) => b.valor - a.valor);
    html = `<div class="grade grade-2"><div class="card"><h3 style="margin-bottom:14px">Produtos mais consumidos</h3>${ranking(lista.slice(0, 10), (v, i) => `${num(v)} ${esc(i.un)}`)}</div>
      <div>${tabela(["Produto", "Categoria", "Quantidade", "Retiradas", "Média/dia", "Custo estimado"],
        lista.map((i) => [esc(i.nome), esc(i.cat || "—"), `${num(i.valor)} ${esc(i.un)}`, i.vezes, num(i.valor / dias, 1), i.custo ? moeda(i.custo * i.valor) : "—"]), [2, 3, 4, 5])}</div></div>`;
    csv.cab = ["Produto", "Categoria", "Quantidade", "Medida", "Retiradas", "Média por dia", "Custo estimado"];
    csv.linhas = lista.map((i) => [i.nome, i.cat, String(i.valor).replace(".", ","), i.un, i.vezes, (i.valor / dias).toFixed(2).replace(".", ","), (i.custo * i.valor).toFixed(2).replace(".", ",")]);
  }

  if (aba === "estoque") {
    const lista = produtosFiltrados(unidadeId);
    const valor = lista.reduce((s, p) => s + Number(p.estoque || 0) * Number(p.custo || 0), 0);
    html = `<p class="muted">Valor estimado em estoque (pelo último custo): <b>${moeda(valor)}</b></p>` + tabela(["Produto", "Categoria", "Restaurante", "Estoque", "Mínimo", "Custo", "Valor"],
      lista.map((p) => [esc(p.nome), esc(p.categoria || "—"), esc(estado.nomeUnidade(p.unidadeId)), `${num(p.estoque)} ${esc(p.unidadeMedida)}`, num(p.estoqueMinimo), p.custo ? moeda(p.custo) : "—", p.custo ? moeda(p.custo * p.estoque) : "—"]), [3, 4, 5, 6]);
    csv.cab = ["Produto", "Categoria", "Restaurante", "Estoque", "Medida", "Mínimo", "Custo", "Valor"];
    csv.linhas = lista.map((p) => [p.nome, p.categoria, estado.nomeUnidade(p.unidadeId), String(p.estoque).replace(".", ","), p.unidadeMedida, p.estoqueMinimo, p.custo || "", ((p.custo || 0) * p.estoque).toFixed(2).replace(".", ",")]);
  }

  if (aba === "compras") {
    const ent = movs(unidadeId, "entrada");
    const porForn = {};
    ent.forEach((m) => { const k = m.fornecedorNome || "Sem fornecedor"; porForn[k] = (porForn[k] || 0) + Number(m.custoTotal || 0); });
    const total = ent.reduce((s, m) => s + Number(m.custoTotal || 0), 0);
    html = `<div class="grade grade-2"><div class="card"><h3 style="margin-bottom:14px">Gasto por fornecedor — ${moeda(total)}</h3>
      ${ranking(Object.entries(porForn).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor), (v) => moeda(v))}</div>
      <div>${tabela(["Produto", "Quantidade", "Total", "Fornecedor"], ent.sort((a, b) => b.dataMs - a.dataMs).map((m) => [esc(m.produtoNome), `${num(m.quantidade)} ${esc(m.unidadeMedida)}`, moeda(m.custoTotal), esc(m.fornecedorNome || "—")]), [1, 2])}</div></div>`;
    csv.cab = ["Produto", "Quantidade", "Medida", "Custo unitário", "Total", "Fornecedor"];
    csv.linhas = ent.map((m) => [m.produtoNome, String(m.quantidade).replace(".", ","), m.unidadeMedida, m.custoUnitario, m.custoTotal, m.fornecedorNome]);
  }

  if (aba === "reposicao") {
    const prevs = previsoesDaUnidade(sync.lista("produtos"), sync.lista("consumoDiario"), estado.config(), unidadeId)
      .filter((p) => !["normal", "semdados"].includes(p.status));
    html = tabela(["Produto", "Estoque", "Consumo/dia", "Dias restantes", "Sugerido", "Situação"],
      prevs.map((p) => [esc(p.produto.nome), `${num(p.estoque)} ${esc(p.produto.unidadeMedida)}`, p.media !== null ? num(p.media, 1) : "—", linhaDias(p.diasRestantes), p.sugerida ? num(p.sugerida) : "—", selo(p.status)]), [1, 2, 3, 4]);
    csv.cab = ["Produto", "Estoque", "Consumo/dia", "Dias restantes", "Sugerido", "Situação"];
    csv.linhas = prevs.map((p) => [p.produto.nome, p.estoque, p.media?.toFixed(2) || "", p.diasRestantes !== null ? Math.floor(p.diasRestantes) : "", p.sugerida || "", p.info.rotulo]);
  }

  if (aba === "funcionarios") {
    const por = {};
    movs(unidadeId, "saida").forEach((m) => {
      const k = m.funcionarioId || m.usuarioUid;
      const s = por[k] = por[k] || { nome: m.funcionarioNome || m.usuarioNome, valor: 0, produtos: {} };
      s.valor++; s.produtos[m.produtoNome] = (s.produtos[m.produtoNome] || 0) + 1;
    });
    const lista = Object.values(por).sort((a, b) => b.valor - a.valor);
    const top = (s) => Object.entries(s.produtos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n).join(", ");
    html = `<div class="grade grade-2"><div class="card"><h3 style="margin-bottom:14px">Retiradas por funcionário</h3>${ranking(lista, (v) => `${v} retiradas`)}</div>
      <div>${tabela(["Funcionário", "Retiradas", "Produtos mais retirados"], lista.map((s) => [esc(s.nome), s.valor, esc(top(s))]), [1])}</div></div>`;
    csv.cab = ["Funcionário", "Retiradas", "Produtos mais retirados"];
    csv.linhas = lista.map((s) => [s.nome, s.valor, top(s)]);
  }

  if (aba === "historico") {
    const todas = movs(unidadeId);
    const c = { entrada: 0, saida: 0, ajuste: 0 };
    todas.forEach((m) => { c[m.tipo] = (c[m.tipo] || 0) + 1; });
    html = `<div class="grade grade-kpi">
      <div class="card kpi"><span class="rotulo">📥 Entradas</span><span class="valor">${c.entrada}</span></div>
      <div class="card kpi"><span class="rotulo">📤 Saídas</span><span class="valor">${c.saida}</span></div>
      <div class="card kpi"><span class="rotulo">⚖️ Ajustes</span><span class="valor">${c.ajuste}</span></div></div>
      <p><a class="btn btn-sec" href="#/admin/movimentacoes">Ver todas as movimentações →</a></p>`;
    csv.cab = ["Tipo", "Quantidade de registros"];
    csv.linhas = Object.entries(c);
  }
  return { html, csv };
}

function render(el, { unidadeId }) {
  const { html, csv } = montar(unidadeId);
  el.innerHTML = `
  <div class="pilha">
    <div class="chips">${Object.entries(ABAS).map(([k, t]) => `<button class="chip ${k === aba ? "ativo" : ""}" data-aba="${k}">${t}</button>`).join("")}</div>
    <div class="filtros">${aba === "estoque" || aba === "reposicao" ? '<span class="muted">Situação atual</span>' : camposPeriodo(periodo)}
      <button class="btn btn-sec" data-csv>⬇ Exportar CSV</button></div>
    <div>${html}</div>
  </div>`;
  el.querySelectorAll("[data-aba]").forEach((b) => b.onclick = () => { aba = b.dataset.aba; render(el, { unidadeId }); });
  el.querySelectorAll("[data-de],[data-ate]").forEach((i) => i.onchange = async () => {
    lerPeriodo(el, periodo);
    try { const n = await garantirHistorico(periodo.de); if (n) toast(`${n} registros antigos carregados`); } catch (e) { console.warn(e); }
    render(el, { unidadeId });
  });
  el.querySelector("[data-csv]").onclick = () => exportarCSV(`relatorio-${aba}.csv`, csv.cab, csv.linhas);
}

export default { render };
