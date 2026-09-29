// =====================================================================
// CONSUMO — histórico de retiradas com filtros e gráfico de 30 dias
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { garantirHistorico } from "../../core/db.js";
import { esc, num, data, hora, toast } from "../../core/util.js";
import { vazio, categorias, periodoPadrao, camposPeriodo, lerPeriodo, graficoBarras, ranking, serieConsumo, exportarCSV, produtosFiltrados } from "./componentes.js";

const periodo = periodoPadrao(7);
const filtro = { produto: "", cat: "", func: "" };

function render(el, { unidadeId }) {
  const saidas = sync.lista("movimentacoes").filter((m) => m.tipo === "saida"
    && (!unidadeId || m.unidadeId === unidadeId)
    && (m.dataMs || 0) >= periodo.de && (m.dataMs || 0) <= periodo.ate
    && (!filtro.produto || m.produtoId === filtro.produto)
    && (!filtro.cat || m.categoria === filtro.cat)
    && (!filtro.func || m.funcionarioId === filtro.func))
    .sort((a, b) => (b.dataMs || 0) - (a.dataMs || 0));

  const ids = filtro.produto ? new Set([filtro.produto])
    : (filtro.cat ? new Set(sync.lista("produtos").filter((p) => p.categoria === filtro.cat).map((p) => p.id)) : null);
  const serie = serieConsumo(unidadeId, 30, ids);
  const unGrafico = filtro.produto ? " " + (sync.get("produtos", filtro.produto)?.unidadeMedida || "") : "";

  const soma = {};
  saidas.forEach((m) => { const k = m.produtoId; soma[k] = soma[k] || { nome: m.produtoNome, valor: 0, un: m.unidadeMedida }; soma[k].valor += Number(m.quantidade || 0); });
  const top = Object.values(soma).sort((a, b) => b.valor - a.valor).slice(0, 8);
  const funcionarios = sync.lista("funcionarios").sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  el.innerHTML = `
  <div class="pilha">
    <div class="filtros">
      ${camposPeriodo(periodo)}
      <label class="campo"><span>Produto</span><select data-f="produto"><option value="">Todos</option>${produtosFiltrados(unidadeId, true).map((p) => `<option value="${p.id}" ${p.id === filtro.produto ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></label>
      <label class="campo"><span>Categoria</span><select data-f="cat"><option value="">Todas</option>${categorias().map((c) => `<option ${c === filtro.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="campo"><span>Funcionário</span><select data-f="func"><option value="">Todos</option>${funcionarios.map((f) => `<option value="${f.id}" ${f.id === filtro.func ? "selected" : ""}>${esc(f.nome)}</option>`).join("")}</select></label>
      <button class="btn btn-sec" data-csv>⬇ CSV</button>
    </div>
    <div class="grade grade-2">
      <div class="card"><div class="card-topo"><h3>Consumo nos últimos 30 dias${filtro.produto ? " — " + esc(sync.get("produtos", filtro.produto)?.nome || "") : ""}</h3></div>
        ${graficoBarras(serie, unGrafico)}
        ${!filtro.produto ? `<p class="nota-estimativa">Soma das quantidades de todos os produtos. Escolha um produto para ver o consumo dele.</p>` : ""}</div>
      <div class="card"><div class="card-topo"><h3>Maior consumo no período</h3></div>${ranking(top, (v, i) => `${num(v)} ${esc(i.un || "")}`)}</div>
    </div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Data</th><th>Horário</th><th>Produto</th><th class="num">Quantidade</th><th>Funcionário</th>${unidadeId ? "" : "<th>Restaurante</th>"}</tr></thead>
      <tbody>${saidas.slice(0, 500).map((m) => `<tr>
        <td>${data(m.dataMs)}</td><td>${hora(m.dataMs)}</td><td><b>${esc(m.produtoNome)}</b></td>
        <td class="num">${num(m.quantidade, 3)} ${esc(m.unidadeMedida)}</td><td>${esc(m.funcionarioNome || m.usuarioNome)}</td>
        ${unidadeId ? "" : `<td>${esc(estado.nomeUnidade(m.unidadeId))}</td>`}</tr>`).join("")
        || `<tr><td colspan="6">${vazio("📭", "Nenhuma retirada com esses filtros.")}</td></tr>`}</tbody>
    </table></div>
    <p class="muted pequeno">${saidas.length} retirada(s)${saidas.length > 500 ? " — mostrando as 500 mais recentes (exporte o CSV para ver todas)" : ""}.</p>
  </div>`;

  el.querySelectorAll("[data-f]").forEach((s) => s.onchange = () => { filtro[s.dataset.f] = s.value; render(el, { unidadeId }); });
  el.querySelectorAll("[data-de],[data-ate]").forEach((i) => i.onchange = async () => {
    lerPeriodo(el, periodo);
    try { const n = await garantirHistorico(periodo.de); if (n) toast(`${n} registros antigos carregados`); }
    catch (e) { console.warn(e); }
    render(el, { unidadeId });
  });
  el.querySelector("[data-csv]").onclick = () => exportarCSV("consumo.csv",
    ["Data", "Horário", "Produto", "Categoria", "Quantidade", "Medida", "Funcionário", "Restaurante"],
    saidas.map((m) => [data(m.dataMs), hora(m.dataMs), m.produtoNome, m.categoria, String(m.quantidade).replace(".", ","), m.unidadeMedida, m.funcionarioNome, estado.nomeUnidade(m.unidadeId)]));
}

export default { render };
