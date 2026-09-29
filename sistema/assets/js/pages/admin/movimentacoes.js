// =====================================================================
// MOVIMENTAÇÕES — entradas, saídas e ajustes (auditoria completa, nada é apagado)
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { garantirHistorico } from "../../core/db.js";
import { esc, num, data, hora, toast, modal, dataHora } from "../../core/util.js";
import { vazio, periodoPadrao, camposPeriodo, lerPeriodo, exportarCSV, produtosFiltrados } from "./componentes.js";

const periodo = periodoPadrao(30);
const filtro = { tipo: "", produto: "" };
const TIPOS = { entrada: ["📥 Entrada", "verde"], saida: ["📤 Saída", "azul"], ajuste: ["⚖️ Ajuste", "amarelo"] };

function render(el, { unidadeId }) {
  const lista = sync.lista("movimentacoes").filter((m) =>
    (!unidadeId || m.unidadeId === unidadeId)
    && (m.dataMs || 0) >= periodo.de && (m.dataMs || 0) <= periodo.ate
    && (!filtro.tipo || m.tipo === filtro.tipo)
    && (!filtro.produto || m.produtoId === filtro.produto))
    .sort((a, b) => (b.dataMs || 0) - (a.dataMs || 0));

  el.innerHTML = `
  <div class="pilha">
    <div class="filtros">
      ${camposPeriodo(periodo)}
      <label class="campo"><span>Tipo</span><select data-f="tipo"><option value="">Todos</option>
        ${Object.entries(TIPOS).map(([k, [t]]) => `<option value="${k}" ${k === filtro.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="campo"><span>Produto</span><select data-f="produto"><option value="">Todos</option>
        ${produtosFiltrados(unidadeId, true).map((p) => `<option value="${p.id}" ${p.id === filtro.produto ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></label>
      <button class="btn btn-sec" data-csv>⬇ CSV</button>
    </div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Data</th><th>Hora</th><th>Tipo</th><th>Produto</th><th class="num">Quantidade</th><th class="num">Antes → Depois</th><th>Funcionário / usuário</th>${unidadeId ? "" : "<th>Restaurante</th>"}</tr></thead>
      <tbody>${lista.slice(0, 500).map((m) => {
        const [t, cor] = TIPOS[m.tipo] || [m.tipo, "cinza"];
        const sinal = m.tipo === "saida" ? "−" : (m.quantidade > 0 ? "+" : "");
        return `<tr class="clicavel" data-id="${m.id}">
          <td>${data(m.dataMs)}</td><td>${hora(m.dataMs)}</td><td><span class="selo selo-${cor}">${t}</span></td>
          <td><b>${esc(m.produtoNome)}</b>${m.motivo ? `<div class="muted pequeno">${esc(m.motivo)}</div>` : ""}</td>
          <td class="num">${sinal}${num(Math.abs(m.quantidade), 3)} ${esc(m.unidadeMedida)}</td>
          <td class="num muted">${num(m.estoqueAnterior)} → <b>${num(m.estoquePosterior)}</b></td>
          <td>${esc(m.funcionarioNome || m.usuarioNome)}${m.funcionarioNome ? `<div class="muted pequeno">login: ${esc(m.usuarioNome)}</div>` : ""}</td>
          ${unidadeId ? "" : `<td>${esc(estado.nomeUnidade(m.unidadeId))}</td>`}</tr>`;
      }).join("") || `<tr><td colspan="8">${vazio("📭", "Nenhuma movimentação com esses filtros.")}</td></tr>`}</tbody>
    </table></div>
    <p class="muted pequeno">${lista.length} movimentação(ões)${lista.length > 500 ? " — mostrando as 500 mais recentes" : ""}. Registros nunca são alterados ou apagados.</p>
  </div>`;

  el.querySelectorAll("[data-f]").forEach((s) => s.onchange = () => { filtro[s.dataset.f] = s.value; render(el, { unidadeId }); });
  el.querySelectorAll("[data-de],[data-ate]").forEach((i) => i.onchange = async () => {
    lerPeriodo(el, periodo);
    try { const n = await garantirHistorico(periodo.de); if (n) toast(`${n} registros antigos carregados`); } catch (e) { console.warn(e); }
    render(el, { unidadeId });
  });
  el.onclick = (e) => {
    const tr = e.target.closest("[data-id]"); if (!tr) return;
    const m = sync.get("movimentacoes", tr.dataset.id); if (!m) return;
    modal({
      titulo: "Detalhes da movimentação",
      corpo: `<div class="tabela-wrap"><table><tbody>
        ${[["Tipo", (TIPOS[m.tipo] || [m.tipo])[0]], ["Produto", m.produtoNome], ["Quantidade", `${num(m.quantidade, 3)} ${m.unidadeMedida}`],
          ["Estoque anterior", num(m.estoqueAnterior)], ["Estoque posterior", num(m.estoquePosterior)],
          ["Funcionário", m.funcionarioNome || "—"], ["Usuário (login)", m.usuarioNome], ["Restaurante", estado.nomeUnidade(m.unidadeId)],
          ["Data da operação", dataHora(m.dataMs)], ["Registrado no servidor", dataHora(m.criadoEm)],
          ["Fornecedor", m.fornecedorNome || "—"], ["Custo unitário", m.custoUnitario ? num(m.custoUnitario, 2) : "—"],
          ["Motivo", m.motivo || "—"], ["Observação", m.observacao || "—"]]
          .map(([k, v]) => `<tr><th style="width:40%">${k}</th><td>${esc(v)}</td></tr>`).join("")}
      </tbody></table></div>`,
      acoes: [{ texto: "Fechar", classe: "btn-sec" }],
    });
  };
  el.querySelector("[data-csv]").onclick = () => exportarCSV("movimentacoes.csv",
    ["Data", "Hora", "Tipo", "Produto", "Quantidade", "Medida", "Estoque anterior", "Estoque posterior", "Funcionário", "Usuário", "Restaurante", "Motivo", "Fornecedor", "Custo unitário"],
    lista.map((m) => [data(m.dataMs), hora(m.dataMs), m.tipo, m.produtoNome, String(m.quantidade).replace(".", ","), m.unidadeMedida,
      m.estoqueAnterior, m.estoquePosterior, m.funcionarioNome || "", m.usuarioNome, estado.nomeUnidade(m.unidadeId), m.motivo || "", m.fornecedorNome || "", m.custoUnitario || ""]));
}

export default { render };
