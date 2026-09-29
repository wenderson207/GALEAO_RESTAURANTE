// =====================================================================
// PAINEL — O que temos? O que está acabando? O que consumimos? Quando comprar?
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { previsoesDaUnidade, diasParaComprar } from "../../core/previsao.js";
import { esc, num, moeda, hora, data } from "../../core/util.js";
import { selo, fotoMini, vazio, graficoBarras, ranking, produtosFiltrados } from "./componentes.js";
import { abrirExplicacao, linhaDias } from "./reposicao.js";

const DIA = 86400000;
let periodoConsumo = 7;

function render(el, { unidadeId }) {
  const produtos = produtosFiltrados(unidadeId);
  const prevs = previsoesDaUnidade(sync.lista("produtos"), sync.lista("consumoDiario"), estado.config(), unidadeId);

  const disponiveis = produtos.filter((p) => Number(p.estoque || 0) > 0).length;
  const baixos = prevs.filter((p) => p.status === "baixo" || p.estoque <= p.minimo).filter((p) => p.status !== "sem").length;
  const semEstoque = prevs.filter((p) => p.status === "sem").length;
  const proximos = prevs.filter((p) => p.status === "breve3" || p.status === "breve7").length;
  const comprar = prevs.filter((p) => ["sem", "comprar", "baixo", "breve3"].includes(p.status));
  const valorPrevisto = comprar.reduce((s, p) => s + (p.sugerida || 0) * Number(p.produto.custo || 0), 0);

  const desde = Date.now() - periodoConsumo * DIA;
  const saidas = sync.lista("movimentacoes").filter((m) => m.tipo === "saida" && (m.dataMs || m.criadoEm) >= desde
    && (!unidadeId || m.unidadeId === unidadeId));

  // gráfico: número de retiradas por dia (30 dias)
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const porDia = {};
  sync.lista("movimentacoes").forEach((m) => {
    if (m.tipo !== "saida" || (unidadeId && m.unidadeId !== unidadeId)) return;
    const d = new Date(m.dataMs || m.criadoEm); d.setHours(0, 0, 0, 0);
    porDia[d.getTime()] = (porDia[d.getTime()] || 0) + 1;
  });
  const serie = [];
  for (let i = 29; i >= 0; i--) {
    const t = hoje0.getTime() - i * DIA;
    serie.push({ rotulo: new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), valor: porDia[t] || 0 });
  }

  // mais consumidos no período
  const soma = {};
  saidas.forEach((m) => { soma[m.produtoId] = soma[m.produtoId] || { nome: m.produtoNome, valor: 0, un: m.unidadeMedida }; soma[m.produtoId].valor += Number(m.quantidade || 0); });
  const top = Object.values(soma).sort((a, b) => b.valor - a.valor).slice(0, 6);

  const destaque = prevs.filter((p) => ["sem", "comprar", "breve3", "baixo"].includes(p.status)).slice(0, 4);
  const alertasAcima = prevs.filter((p) => p.acimaDaMedia);
  const ultimas = saidas.sort((a, b) => (b.dataMs || 0) - (a.dataMs || 0)).slice(0, 8);

  el.innerHTML = `
  <div class="pilha">
    <div class="grade grade-kpi">
      <div class="card kpi"><span class="rotulo">📦 Estoque atual</span><span class="valor">${disponiveis}</span><span class="detalhe">de ${produtos.length} produtos com estoque</span></div>
      <div class="card kpi ${baixos ? "atencao" : ""}"><span class="rotulo">🟡 Estoque baixo</span><span class="valor">${baixos}</span><span class="detalhe">abaixo do mínimo${semEstoque ? ` · ${semEstoque} sem estoque` : ""}</span></div>
      <div class="card kpi"><span class="rotulo">⏳ Próximos da reposição</span><span class="valor">${proximos}</span><span class="detalhe">nos próximos 7 dias</span></div>
      <div class="card kpi ${comprar.length ? "alerta" : ""}"><span class="rotulo">🛒 Compras previstas</span><span class="valor">${comprar.length}</span><span class="detalhe">${valorPrevisto ? "≈ " + moeda(valorPrevisto) + " (estimativa)" : "produtos para repor"}</span></div>
      <div class="card kpi"><span class="rotulo">📉 Consumo do período</span><span class="valor">${saidas.length}</span>
        <span class="detalhe">retiradas em <select data-periodo style="min-height:0;padding:2px 6px;width:auto;font-size:12px">
          ${[1, 7, 15, 30].map((d) => `<option value="${d}" ${d === periodoConsumo ? "selected" : ""}>${d === 1 ? "24 horas" : d + " dias"}</option>`).join("")}</select></span></div>
    </div>

    <div class="card">
      <div class="card-topo"><h2>🚨 Reposição</h2><a class="btn btn-sec btn-pequeno" href="#/admin/reposicao">Ver central de reposição →</a></div>
      ${destaque.length ? `<div class="rep-cards">${destaque.map((p) => {
        const un = p.produto.unidadeMedida || "un";
        return `<div class="card rep-card ${p.info.cor}" data-p="${p.produto.id}">
          <div class="linha">${fotoMini(p.produto)}<b class="cresce">${esc(p.produto.nome)}</b>${selo(p.status)}</div>
          <div class="nums">
            <div>Estoque atual<b>${num(p.estoque)} ${esc(un)}</b></div>
            <div>Consumo médio<b>${p.media !== null ? num(p.media, 1) + " " + esc(un) + "/dia" : "—"}</b></div>
            <div>Estoque estimado para<b>${linhaDias(p.diasRestantes)}</b></div>
            <div>Previsão de compra<b>${p.status === "sem" || p.status === "comprar" ? "agora" : p.diasAteComprar !== null ? "em ~" + linhaDias(diasParaComprar(p) || 0.5) : "—"}</b></div>
          </div></div>`;
      }).join("")}</div>` : vazio("🟢", "Tudo em ordem. Nenhum produto precisa de reposição agora.")}
    </div>

    <div class="grade grade-2">
      <div class="card"><div class="card-topo"><h3>Retiradas nos últimos 30 dias</h3></div>${graficoBarras(serie, " retiradas")}</div>
      <div class="card"><div class="card-topo"><h3>Mais consumidos (${periodoConsumo === 1 ? "24h" : periodoConsumo + " dias"})</h3></div>
        ${ranking(top, (v, i) => `${num(v)} ${esc(i.un || "")}`)}</div>
    </div>

    <div class="grade grade-2">
      <div class="card"><div class="card-topo"><h3>🔔 Alertas</h3></div>
        ${[...prevs.filter((p) => ["sem", "comprar", "baixo"].includes(p.status)).map((p) =>
          `<div class="linha" style="padding:8px 0;border-bottom:1px solid var(--borda)" data-p="${p.produto.id}">${selo(p.status)}<span class="cresce">${esc(p.produto.nome)}</span><span class="muted pequeno">${num(p.estoque)} ${esc(p.produto.unidadeMedida || "un")}</span></div>`),
          ...alertasAcima.map((p) => `<div class="linha" style="padding:8px 0;border-bottom:1px solid var(--borda)" data-p="${p.produto.id}"><span class="selo selo-azul">Consumo acima da média</span><span class="cresce">${esc(p.produto.nome)} está sendo consumido ${p.acimaDaMedia}% acima da média.</span></div>`),
        ].join("") || vazio("🟢", "Nenhum alerta. Estoque normal.")}
      </div>
      <div class="card"><div class="card-topo"><h3>Últimas retiradas</h3><a class="btn btn-texto btn-pequeno" href="#/admin/consumo">Ver tudo</a></div>
        ${ultimas.length ? `<div class="tabela-wrap" style="border:0"><table><tbody>${ultimas.map((m) => `
          <tr><td><b>${esc(m.produtoNome)}</b><div class="muted pequeno">${esc(m.funcionarioNome || m.usuarioNome)}</div></td>
          <td class="num">${num(m.quantidade)} ${esc(m.unidadeMedida)}</td><td class="num muted pequeno">${data(m.dataMs)}<br>${hora(m.dataMs)}</td></tr>`).join("")}</tbody></table></div>`
          : vazio("📭", "Nenhuma retirada no período.")}
      </div>
    </div>
  </div>`;

  el.querySelector("[data-periodo]").onchange = (e) => { periodoConsumo = Number(e.target.value); render(el, { unidadeId }); };
  el.onclick = (e) => {
    const alvo = e.target.closest("[data-p]");
    if (alvo) { const prev = prevs.find((p) => p.produto.id === alvo.dataset.p); if (prev) abrirExplicacao(prev); }
  };
}

export default { render };
