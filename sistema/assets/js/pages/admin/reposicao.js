// =====================================================================
// CENTRAL DE REPOSIÇÃO — comprar agora / próximos 3 dias / próximos 7 dias
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { previsoesDaUnidade, explicar, calcularPrevisao } from "../../core/previsao.js";
import { $, esc, num, moeda, modal } from "../../core/util.js";
import { selo, fotoMini, vazio, exportarCSV } from "./componentes.js";

export function linhaDias(v) {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  const d = Math.floor(v);
  return d <= 0 ? "menos de 1 dia" : `${d} dia${d > 1 ? "s" : ""}`;
}

export function abrirExplicacao(produtoOuPrev) {
  const prev = produtoOuPrev.produto ? produtoOuPrev
    : calcularPrevisao(produtoOuPrev, sync.lista("consumoDiario"), estado.config());
  const p = prev.produto;
  const un = p.unidadeMedida || "un";
  const forn = p.fornecedorId ? sync.get("fornecedores", p.fornecedorId)?.nome : "";
  modal({
    titulo: p.nome,
    corpo: `
      <div class="linha" style="margin-bottom:14px">${fotoMini(p)}<div class="cresce"><b>${esc(p.nome)}</b><div class="muted pequeno">${esc(estado.nomeUnidade(p.unidadeId))}${forn ? " · " + esc(forn) : ""}</div></div>${selo(prev.status)}</div>
      <div class="grade grade-kpi" style="margin-bottom:16px">
        <div class="kpi"><span class="rotulo">Estoque atual</span><span class="valor">${num(prev.estoque)}</span><span class="detalhe">${esc(un)}</span></div>
        <div class="kpi"><span class="rotulo">Consumo médio</span><span class="valor">${prev.media !== null ? num(prev.media, 1) : "—"}</span><span class="detalhe">${esc(un)}/dia</span></div>
        <div class="kpi"><span class="rotulo">Estoque estimado para</span><span class="valor" style="font-size:22px">${linhaDias(prev.diasRestantes)}</span></div>
        <div class="kpi"><span class="rotulo">Quantidade sugerida</span><span class="valor">${prev.sugerida ? num(prev.sugerida) : "—"}</span><span class="detalhe">${prev.sugerida && p.custo ? "≈ " + moeda(prev.sugerida * p.custo) : esc(un)}</span></div>
      </div>
      <div class="explicacao">${explicar(prev, un).map((f) => `<p>${esc(f)}</p>`).join("")}</div>
      ${prev.acimaDaMedia ? `<p class="aviso aviso-info" style="margin-top:12px">🔵 ${esc(p.nome)} está sendo consumido ${prev.acimaDaMedia}% acima da média nos últimos 7 dias.</p>` : ""}
      <p class="nota-estimativa">Previsão de reposição é uma estimativa baseada no consumo médio — não é garantia.</p>`,
    acoes: [{ texto: "Fechar", classe: "btn-sec" }, { texto: "Registrar compra", classe: "btn-pri", onClick: () => { location.hash = `#/admin/entradas?p=${p.id}`; } }],
  });
}

function card(prev) {
  const p = prev.produto;
  const un = p.unidadeMedida || "un";
  return `
  <div class="card rep-card ${prev.info.cor}" data-p="${p.id}">
    <div class="linha">${fotoMini(p)}<div class="cresce"><b>${esc(p.nome)}</b><div class="muted pequeno">${esc(estado.nomeUnidade(p.unidadeId))}</div></div>${selo(prev.status)}</div>
    <div class="nums">
      <div>Estoque<b>${num(prev.estoque)} ${esc(un)}</b></div>
      <div>Consumo/dia<b>${prev.media !== null ? num(prev.media, 1) : "—"}</b></div>
      <div>Dias restantes<b>${linhaDias(prev.diasRestantes)}</b></div>
      <div>Prazo do fornecedor<b>${prev.prazo ? prev.prazo + " dia(s)" : "—"}</b></div>
    </div>
    ${prev.sugerida ? `<div class="sugestao">🛒 Comprar aproximadamente ${num(prev.sugerida)} ${esc(un)}</div>`
      : !prev.temDados ? `<div class="nota-estimativa">Dados insuficientes para uma previsão precisa.</div>` : ""}
  </div>`;
}

function render(el, { unidadeId }) {
  const prevs = previsoesDaUnidade(sync.lista("produtos"), sync.lista("consumoDiario"), estado.config(), unidadeId);
  const agora = prevs.filter((p) => p.status === "sem" || p.status === "comprar");
  const tres = prevs.filter((p) => p.status === "breve3" || (p.status === "baixo"));
  const sete = prevs.filter((p) => p.status === "breve7");
  const total = [...agora, ...tres].reduce((s, p) => s + (p.sugerida || 0) * Number(p.produto.custo || 0), 0);

  const grupo = (titulo, lista, vazioTxt) => `
    <section class="rep-grupo">
      <h2>${titulo} <span class="cont">${lista.length}</span></h2>
      ${lista.length ? `<div class="rep-cards">${lista.map(card).join("")}</div>` : `<div class="card">${vazio("✅", vazioTxt)}</div>`}
    </section>`;

  el.innerHTML = `
    <div class="linha entre">
      <p class="muted" style="margin:0">Toque em um produto para ver por que o sistema recomenda a compra.</p>
      <div class="linha">
        ${total > 0 ? `<span class="selo selo-azul">Compra estimada: ${moeda(total)}</span>` : ""}
        <button class="btn btn-sec btn-pequeno" data-csv>⬇ Lista de compras (CSV)</button>
      </div>
    </div>
    ${grupo("🔴 Comprar agora", agora, "Nenhum produto precisa de compra imediata.")}
    ${grupo("🟡 Próximos 3 dias", tres, "Nada previsto para os próximos 3 dias.")}
    ${grupo("🔵 Próximos 7 dias", sete, "Nada previsto para os próximos 7 dias.")}
    <section class="rep-grupo">
      <h2>📋 Todos os produtos</h2>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Produto</th><th class="num">Estoque</th><th class="num">Consumo/dia</th><th class="num">Dias restantes</th><th class="num">Prazo do fornecedor</th><th class="num">Sugerido</th><th>Ação</th></tr></thead>
        <tbody>${prevs.map((p) => `
          <tr class="clicavel" data-p="${p.produto.id}">
            <td><div class="linha">${fotoMini(p.produto)}${esc(p.produto.nome)}</div></td>
            <td class="num">${num(p.estoque)} ${esc(p.produto.unidadeMedida || "un")}</td>
            <td class="num">${p.media !== null ? num(p.media, 1) : "—"}</td>
            <td class="num">${linhaDias(p.diasRestantes)}</td>
            <td class="num">${p.prazo ? p.prazo + " d" : "—"}</td>
            <td class="num">${p.sugerida ? num(p.sugerida) : "—"}</td>
            <td>${selo(p.status)}</td>
          </tr>`).join("") || `<tr><td colspan="7">${vazio("📦", "Nenhum produto cadastrado.")}</td></tr>`}
        </tbody>
      </table></div>
      <p class="nota-estimativa">Consumo médio calculado com os últimos ${estado.config().periodoCalculo} dias (altere em Configurações). Previsões são estimativas.</p>
    </section>`;

  el.onclick = (e) => {
    const alvo = e.target.closest("[data-p]");
    if (alvo) { const prev = prevs.find((p) => p.produto.id === alvo.dataset.p); if (prev) abrirExplicacao(prev); }
  };
  $("[data-csv]", el).onclick = () => {
    const lista = [...agora, ...tres, ...sete];
    exportarCSV("lista-de-compras.csv",
      ["Produto", "Unidade", "Estoque", "Consumo/dia", "Dias restantes", "Prazo fornecedor", "Quantidade sugerida", "Custo estimado", "Situação"],
      lista.map((p) => [p.produto.nome, estado.nomeUnidade(p.produto.unidadeId), p.estoque, p.media !== null ? p.media.toFixed(2).replace(".", ",") : "",
        p.diasRestantes !== null ? Math.floor(p.diasRestantes) : "", p.prazo, p.sugerida || "", p.sugerida && p.produto.custo ? (p.sugerida * p.produto.custo).toFixed(2).replace(".", ",") : "", p.info.rotulo]));
  };
}

export default { render };
