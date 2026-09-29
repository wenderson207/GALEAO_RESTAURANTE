// =====================================================================
// Estrutura da área administrativa: menu + barra do topo + filtro global de unidade
// =====================================================================
import { sync, status } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { sair, PAPEIS } from "../../core/auth.js";
import { $, $$, esc } from "../../core/util.js";
import { previsoesDaUnidade } from "../../core/previsao.js";

import dashboard from "./dashboard.js";
import reposicao from "./reposicao.js";
import produtos from "./produtos.js";
import entradas from "./entradas.js";
import listas from "./listas.js";
import consumo from "./consumo.js";
import movimentacoes from "./movimentacoes.js";
import relatorios from "./relatorios.js";
import funcionarios from "./funcionarios.js";
import fornecedores from "./fornecedores.js";
import unidades from "./unidades.js";
import acessos from "./acessos.js";
import configuracoes from "./configuracoes.js";

// papeis: quem vê cada página (preparado para novas permissões no futuro)
const PAGINAS = [
  { grupo: "Visão geral" },
  { id: "dashboard", titulo: "Painel", ic: "📊", mod: dashboard, papeis: ["admin", "gerente"] },
  { id: "reposicao", titulo: "Central de reposição", ic: "🚨", mod: reposicao, papeis: ["admin", "gerente"], badge: true },
  { grupo: "Estoque" },
  { id: "produtos", titulo: "Produtos e estoque", ic: "📦", mod: produtos, papeis: ["admin", "gerente"] },
  { id: "listas", titulo: "Listas de compras", ic: "📝", mod: listas, papeis: ["admin", "gerente"] },
  { id: "entradas", titulo: "Entradas (compras)", ic: "📥", mod: entradas, papeis: ["admin", "gerente"] },
  { id: "consumo", titulo: "Consumo", ic: "📉", mod: consumo, papeis: ["admin", "gerente"] },
  { id: "movimentacoes", titulo: "Movimentações", ic: "🔄", mod: movimentacoes, papeis: ["admin", "gerente"] },
  { id: "relatorios", titulo: "Relatórios", ic: "📑", mod: relatorios, papeis: ["admin", "gerente"] },
  { grupo: "Cadastros" },
  { id: "funcionarios", titulo: "Funcionários", ic: "👥", mod: funcionarios, papeis: ["admin", "gerente"] },
  { id: "fornecedores", titulo: "Fornecedores", ic: "🚚", mod: fornecedores, papeis: ["admin", "gerente"] },
  { id: "unidades", titulo: "Restaurantes / unidades", ic: "🏪", mod: unidades, papeis: ["admin"] },
  { id: "acessos", titulo: "Acessos e permissões", ic: "🔐", mod: acessos, papeis: ["admin"] },
  { id: "configuracoes", titulo: "Configurações", ic: "⚙️", mod: configuracoes, papeis: ["admin"] },
];

export function telaAdmin(el, paginaId) {
  const visiveis = PAGINAS.filter((p) => p.grupo || p.papeis.includes(estado.papel));
  const pagina = visiveis.find((p) => p.id === paginaId) || visiveis.find((p) => p.id);

  el.innerHTML = `
  <div class="admin">
    <aside class="menu">
      <div class="logo"><span data-logo>📦</span><div>Estoque Inteligente<small data-empresa></small></div></div>
      ${visiveis.map((p) => p.grupo
        ? `<div class="grupo">${p.grupo}</div>`
        : `<a href="#/admin/${p.id}" class="${p.id === pagina.id ? "ativo" : ""}"><span class="ic">${p.ic}</span>${p.titulo}${p.badge ? `<span class="badge oculto" data-badge></span>` : ""}</a>`).join("")}
      <div class="grupo">Operação</div>
      <a href="#/operacao"><span class="ic">📱</span>Abrir tela do tablet</a>
      <div class="rodape">
        <div class="quem"><b>${esc(estado.perfil.nome || estado.usuario.email)}</b>${PAPEIS[estado.papel]}</div>
        <a href="#" data-sair><span class="ic">🚪</span>Sair</a>
      </div>
    </aside>
    <div class="menu-fundo" data-fundo></div>
    <div class="principal">
      <header class="topo">
        <button class="btn-icone btn-menu" data-abrir-menu aria-label="Menu">☰</button>
        <h1>${pagina.ic} ${pagina.titulo}</h1>
        <span class="sync" data-sync></span>
        <label class="filtro-unidade"><span>Restaurante:</span><select data-unidade></select></label>
      </header>
      <main class="conteudo" data-conteudo></main>
    </div>
  </div>`;

  const raiz = $(".admin", el);
  const conteudo = $("[data-conteudo]", el);
  const selUnidade = $("[data-unidade]", el);

  $("[data-abrir-menu]", el).onclick = () => raiz.classList.toggle("menu-aberto");
  $("[data-fundo]", el).onclick = () => raiz.classList.remove("menu-aberto");
  $$(".menu a", el).forEach((a) => a.addEventListener("click", () => raiz.classList.remove("menu-aberto")));
  $("[data-sair]", el).onclick = (e) => { e.preventDefault(); sair(); };

  function desenharTopo() {
    const unidadesLista = estado.unidadesPermitidas();
    const atual = estado.unidadeId;
    const podeTodas = !(estado.perfil.unidades?.length === 1);
    selUnidade.innerHTML = (podeTodas ? `<option value="">Todas as unidades</option>` : "")
      + unidadesLista.map((u) => `<option value="${u.id}" ${u.id === atual ? "selected" : ""}>${esc(u.nome)}</option>`).join("");
    $("[data-empresa]", el).textContent = sync.empresa()?.nome || "";
    const lg = sync.empresa()?.logo;
    $("[data-logo]", el).innerHTML = lg ? `<img src="${esc(lg)}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:contain;background:#fff">` : "📦";
    const s = $("[data-sync]", el);
    s.textContent = status.online ? "Sincronizado" : "Offline — salvando no aparelho";
    s.classList.toggle("off", !status.online);
    const badge = $("[data-badge]", el);
    if (badge) {
      const n = previsoesDaUnidade(sync.lista("produtos"), sync.lista("consumoDiario"), estado.config(), atual)
        .filter((p) => p.status === "sem" || p.status === "comprar").length;
      badge.textContent = n; badge.classList.toggle("oculto", !n);
    }
  }

  selUnidade.onchange = () => { estado.unidadeId = selUnidade.value; desenharTopo(); desenharPagina(); };

  let limparPagina = null;
  function desenharPagina() {
    try { limparPagina?.(); } catch {}
    limparPagina = pagina.mod.render(conteudo, { unidadeId: estado.unidadeId }) || null;
    requestAnimationFrame(dicasDeslizar);
  }
  // No celular, avisa quando uma tabela é mais larga que a tela (dá para deslizar para o lado)
  function dicasDeslizar() {
    $$(".tabela-wrap", conteudo).forEach((t) => {
      const temDica = t.nextElementSibling?.classList.contains("dica-deslizar");
      if (t.scrollWidth > t.clientWidth + 4 && !temDica) t.insertAdjacentHTML("afterend", `<p class="dica-deslizar">↔ Deslize a tabela para o lado para ver mais</p>`);
    });
  }

  // Redesenha quando chegam dados novos (agrupado para não piscar)
  let t = null;
  const pararSync = sync.on((col) => {
    clearTimeout(t);
    t = setTimeout(() => {
      desenharTopo();
      if (col === "status") return;
      if (!pagina.mod.semAutoRefresh) return desenharPagina();
      // páginas com formulário só redesenham se ninguém estiver digitando/com janela aberta
      const ocupado = document.querySelector(".modal-fundo") || conteudo.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((pagina.mod.aoMudar || []).includes(col) && !ocupado) desenharPagina();
    }, 200);
  });

  desenharTopo();
  desenharPagina();
  return () => { pararSync(); clearTimeout(t); try { limparPagina?.(); } catch {} };
}
