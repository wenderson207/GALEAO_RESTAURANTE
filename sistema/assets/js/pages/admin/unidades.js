// RESTAURANTES / UNIDADES — dimensão global do sistema (não cria páginas separadas)
import { sync } from "../../core/sync.js";
import { salvarUnidade } from "../../core/db.js";
import { $, esc, num, modal, toast, lerForm } from "../../core/util.js";
import { vazio } from "./componentes.js";

function render(el) {
  const lista = sync.lista("unidades").sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const produtos = sync.lista("produtos").filter((p) => p.ativo !== false);

  el.innerHTML = `
    <div class="filtros"><p class="muted cresce" style="margin:0">Cada produto, retirada e compra fica vinculado a uma unidade. Use o seletor "Restaurante" no topo para filtrar.</p>
      <button class="btn btn-pri" data-novo>+ Nova unidade</button></div>
    ${lista.length ? `<div class="grade grade-2">${lista.map((u) => {
      const ps = produtos.filter((p) => p.unidadeId === u.id);
      const baixos = ps.filter((p) => Number(p.estoque || 0) <= Number(p.estoqueMinimo || 0)).length;
      return `<div class="card" style="cursor:pointer" data-id="${u.id}">
        <div class="linha entre"><h3>🏪 ${esc(u.nome)}</h3>${u.ativo === false ? '<span class="selo selo-cinza">Inativa</span>' : '<span class="selo selo-verde">Ativa</span>'}</div>
        <p class="muted pequeno" style="margin:6px 0 12px">${esc(u.endereco || "Sem endereço")}</p>
        <div class="linha"><span><b>${num(ps.length)}</b> produtos</span><span class="${baixos ? "" : "muted"}"><b>${baixos}</b> com estoque baixo</span></div>
      </div>`;
    }).join("")}</div>` : `<div class="card">${vazio("🏪", "Nenhuma unidade cadastrada.")}</div>`}`;

  $("[data-novo]", el).onclick = () => form(null);
  el.onclick = (e) => { const c = e.target.closest("[data-id]"); if (c) form(sync.get("unidades", c.dataset.id)); };
}

function form(u) {
  const novo = !u;
  u = u || { ativo: true };
  modal({
    titulo: novo ? "Nova unidade" : `Editar — ${u.nome}`,
    corpo: `<form class="form-grade" onsubmit="return false">
      <label class="campo" style="grid-column:1/-1"><span>Nome</span><input name="nome" required value="${esc(u.nome || "")}" placeholder="Ex.: Unidade 02 — Centro"></label>
      <label class="campo" style="grid-column:1/-1"><span>Endereço</span><input name="endereco" value="${esc(u.endereco || "")}"></label>
      <label class="check"><input type="checkbox" name="ativo" ${u.ativo !== false ? "checked" : ""}> Ativa</label>
    </form>`,
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: (m) => {
        const d = lerForm($("form", m));
        if (!d.nome) throw new Error("Informe o nome");
        salvarUnidade(d, novo ? null : u.id);
        toast("Unidade salva");
      } },
    ],
  });
}

export default { render };
