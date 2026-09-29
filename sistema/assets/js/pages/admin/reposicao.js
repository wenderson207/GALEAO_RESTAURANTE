// =====================================================================
// CENTRAL DE REPOSIÇÃO — comprar agora / próximos 3 dias / próximos 7 dias
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { previsoesDaUnidade, explicar, calcularPrevisao, diasParaComprar } from "../../core/previsao.js";
import { $, $$, esc, num, moeda, modal, data } from "../../core/util.js";
import { selo, fotoMini, vazio, exportarCSV } from "./componentes.js";
import { adicionarAListas, itemDoProduto } from "./listas.js";

const DIA = 86400000;
let visao = "lista";
let mesRef = null; // 1º dia do mês exibido no calendário

function hoje0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
// Dia (ms, meia-noite) em que o produto deve ser comprado — null se não há previsão
export function diaDeCompra(prev) {
  if (prev.status === "sem" || prev.status === "comprar") return hoje0();
  const d = diasParaComprar(prev);
  if (d === null || !prev.media) return (prev.status === "baixo") ? hoje0() : null;
  const r = new Date(hoje0() + d * DIA); r.setHours(0, 0, 0, 0); return r.getTime();
}

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
    acoes: [
      { texto: "Fechar", classe: "btn-sec" },
      { texto: "🛒 Pôr na lista", classe: "btn-sec", onClick: () => adicionarAListas([itemDoProduto(p, prev.sugerida || p.compraMinima || 1)], "Compras " + data(Date.now())) },
      { texto: "Registrar compra", classe: "btn-pri", onClick: () => { location.hash = `#/admin/entradas?p=${p.id}`; } },
    ],
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

function renderLista(el, { unidadeId }) {
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
        <button class="btn btn-pri btn-pequeno" data-para-lista ${agora.length + tres.length ? "" : "disabled"}>🛒 Criar lista de compras</button>
        <button class="btn btn-sec btn-pequeno" data-csv>⬇ CSV</button>
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
  $("[data-para-lista]", el).onclick = () => adicionarAListas(
    [...agora, ...tres].map((p) => itemDoProduto(p.produto, p.sugerida || p.produto.compraMinima || 1)), "Reposição " + data(Date.now()));
  $("[data-csv]", el).onclick = () => {
    const lista = [...agora, ...tres, ...sete];
    exportarCSV("lista-de-compras.csv",
      ["Produto", "Unidade", "Estoque", "Consumo/dia", "Dias restantes", "Prazo fornecedor", "Quantidade sugerida", "Custo estimado", "Situação"],
      lista.map((p) => [p.produto.nome, estado.nomeUnidade(p.produto.unidadeId), p.estoque, p.media !== null ? p.media.toFixed(2).replace(".", ",") : "",
        p.diasRestantes !== null ? Math.floor(p.diasRestantes) : "", p.prazo, p.sugerida || "", p.sugerida && p.produto.custo ? (p.sugerida * p.produto.custo).toFixed(2).replace(".", ",") : "", p.info.rotulo]));
  };
}

// ---------------------------------------------------------------- calendário
function renderCalendario(el, { unidadeId }) {
  const prevs = previsoesDaUnidade(sync.lista("produtos"), sync.lista("consumoDiario"), estado.config(), unidadeId);
  const porDia = {};
  prevs.forEach((p) => { const d = diaDeCompra(p); if (d !== null) (porDia[d] = porDia[d] || []).push(p); });
  const semPrevisao = prevs.filter((p) => diaDeCompra(p) === null);

  if (!mesRef) { const d = new Date(); mesRef = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
  const m = new Date(mesRef);
  const inicio = new Date(m); inicio.setDate(1 - m.getDay()); // começa no domingo
  const h = hoje0();
  const dias = [];
  for (let i = 0; i < 42; i++) { const d = new Date(inicio); d.setDate(inicio.getDate() + i); d.setHours(0, 0, 0, 0); dias.push(d); }
  const ultimaSemanaVazia = dias.slice(35).every((d) => d.getMonth() !== m.getMonth());
  const visiveis = ultimaSemanaVazia ? dias.slice(0, 35) : dias;
  const cor = (p) => (p.status === "sem" ? "vermelho" : p.status === "comprar" ? "laranja" : p.status === "breve7" ? "azul" : "amarelo");

  el.innerHTML = `
    <div class="card">
      <div class="cal-topo">
        <button class="btn btn-sec btn-pequeno" data-mes="-1" aria-label="Mês anterior">‹</button>
        <h3>${(() => { const t = m.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); })()}</h3>
        <button class="btn btn-sec btn-pequeno" data-hoje>Hoje</button>
        <button class="btn btn-sec btn-pequeno" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal">
        ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<div class="sem">${d}</div>`).join("")}
        ${visiveis.map((d) => {
          const t = d.getTime(), itens = porDia[t] || [];
          const fora = d.getMonth() !== m.getMonth();
          const urg = itens.some((p) => p.status === "sem" || p.status === "comprar");
          return `<button class="dia ${fora ? "fora" : ""} ${t === h ? "hoje" : ""} ${t < h ? "passado" : ""}" data-dia="${t}" ${itens.length ? "" : "tabindex='-1'"}>
            <span class="n">${d.getDate()}</span>
            ${itens.slice(0, 3).map((p) => `<span class="item ${cor(p)}">${esc(p.produto.nome)}</span>`).join("")}
            ${itens.length > 3 ? `<span class="mais">+${itens.length - 3} produto(s)</span>` : ""}
            ${itens.length ? `<span class="bolinha ${urg ? "vermelho" : ""}">${itens.length}</span>` : ""}
          </button>`;
        }).join("")}
      </div>
      <p class="nota-estimativa">Cada produto aparece no dia estimado para fazer o pedido (considerando consumo médio, estoque de segurança e prazo do fornecedor). Itens atrasados ficam no dia de hoje. Toque em um dia para ver a lista.</p>
    </div>
    ${semPrevisao.length ? `<div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">⚪ Sem previsão ainda (${semPrevisao.length})</h3>
      <p class="muted pequeno" style="margin:0">${semPrevisao.map((p) => esc(p.produto.nome)).join(", ")} — precisam de alguns dias de retiradas para o sistema estimar.</p></div>` : ""}`;

  $$("[data-mes]", el).forEach((b) => b.onclick = () => { const d = new Date(mesRef); d.setMonth(d.getMonth() + Number(b.dataset.mes)); mesRef = d.getTime(); renderCalendario(el, { unidadeId }); });
  $("[data-hoje]", el).onclick = () => { mesRef = null; renderCalendario(el, { unidadeId }); };
  $$("[data-dia]", el).forEach((b) => b.onclick = () => {
    const t = Number(b.dataset.dia), itens = porDia[t] || [];
    if (itens.length) abrirDia(t, itens);
  });
}

function abrirDia(t, itens) {
  const grupos = {};
  itens.forEach((p) => { const k = p.produto.fornecedorId || ""; (grupos[k] = grupos[k] || []).push(p); });
  const titulo = new Date(t).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  modal({
    titulo: `Comprar em ${titulo}`, largo: true,
    corpo: Object.entries(grupos).map(([k, ps]) => `
      <h4 style="margin:4px 0 8px">${k ? "🚚 " + esc(sync.get("fornecedores", k)?.nome || "") : "Sem fornecedor"}</h4>
      <div class="tabela-wrap compacta" style="margin-bottom:14px"><table><tbody>${ps.map((p) => `
        <tr><td><label class="check"><input type="checkbox" data-p="${p.produto.id}" checked> ${esc(p.produto.nome)}</label></td>
        <td class="num">${num(p.estoque)} ${esc(p.produto.unidadeMedida || "un")}</td>
        <td class="num"><b>${p.sugerida ? "comprar ~" + num(p.sugerida) : "—"}</b></td><td>${selo(p.status)}</td></tr>`).join("")}</tbody></table></div>`).join(""),
    acoes: [
      { texto: "Fechar", classe: "btn-sec" },
      { texto: "🛒 Adicionar marcados à lista", classe: "btn-pri", onClick: (m) => {
        const ids = new Set($$("[data-p]:checked", m).map((i) => i.dataset.p));
        const sel = itens.filter((p) => ids.has(p.produto.id));
        if (!sel.length) throw new Error("Marque ao menos um produto");
        adicionarAListas(sel.map((p) => itemDoProduto(p.produto, p.sugerida || p.produto.compraMinima || 1)), "Compras " + new Date(t).toLocaleDateString("pt-BR"));
      } },
    ],
  });
}

function render(el, ctx) {
  el.innerHTML = `
    <div class="abas">
      <button class="aba ${visao === "lista" ? "ativo" : ""}" data-visao="lista">📋 O que comprar</button>
      <button class="aba ${visao === "calendario" ? "ativo" : ""}" data-visao="calendario">📅 Calendário de compras</button>
    </div><div data-v></div>`;
  $$("[data-visao]", el).forEach((b) => b.onclick = () => { visao = b.dataset.visao; render(el, ctx); });
  const alvo = $("[data-v]", el);
  if (visao === "calendario") renderCalendario(alvo, ctx); else renderLista(alvo, ctx);
}

export default { render };
