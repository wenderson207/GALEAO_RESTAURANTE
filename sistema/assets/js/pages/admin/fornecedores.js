// FORNECEDORES — nome, contato e prazo de entrega
import { sync } from "../../core/sync.js";
import { salvarFornecedor } from "../../core/db.js";
import { $, esc, modal, toast, lerForm } from "../../core/util.js";
import { vazio } from "./componentes.js";

function render(el) {
  const lista = sync.lista("fornecedores").sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const qtdProdutos = {};
  sync.lista("produtos").forEach((p) => { if (p.fornecedorId) qtdProdutos[p.fornecedorId] = (qtdProdutos[p.fornecedorId] || 0) + 1; });

  el.innerHTML = `
    <div class="filtros"><span class="cresce"></span><button class="btn btn-pri" data-novo>+ Novo fornecedor</button></div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Fornecedor</th><th>Contato</th><th>Telefone / WhatsApp</th><th class="num">Prazo de entrega</th><th class="num">Produtos</th><th></th></tr></thead>
      <tbody>${lista.map((f) => `<tr class="clicavel" data-id="${f.id}">
        <td><b>${esc(f.nome)}</b> ${f.ativo === false ? '<span class="selo selo-cinza">Inativo</span>' : ""}</td>
        <td>${esc(f.contato || "—")}</td><td>${esc(f.telefone || "—")}</td>
        <td class="num">${f.prazoDias ? f.prazoDias + " dia(s)" : "—"}</td><td class="num">${qtdProdutos[f.id] || 0}</td>
        <td class="num"><button class="btn btn-pequeno btn-sec">Editar</button></td></tr>`).join("")
        || `<tr><td colspan="6">${vazio("🚚", "Nenhum fornecedor cadastrado.")}</td></tr>`}</tbody>
    </table></div>`;

  $("[data-novo]", el).onclick = () => form(null);
  el.onclick = (e) => { const tr = e.target.closest("[data-id]"); if (tr) form(sync.get("fornecedores", tr.dataset.id)); };
}

function form(f) {
  const novo = !f;
  f = f || { ativo: true };
  modal({
    titulo: novo ? "Novo fornecedor" : `Editar — ${f.nome}`,
    corpo: `<form class="form-grade" onsubmit="return false">
      <label class="campo" style="grid-column:1/-1"><span>Nome</span><input name="nome" required value="${esc(f.nome || "")}"></label>
      <label class="campo"><span>Contato</span><input name="contato" value="${esc(f.contato || "")}"></label>
      <label class="campo"><span>Telefone / WhatsApp</span><input name="telefone" inputmode="tel" value="${esc(f.telefone || "")}"></label>
      <label class="campo"><span>Prazo de entrega (dias)</span><input name="prazoDias" data-tipo="numero" inputmode="numeric" value="${esc(f.prazoDias ?? "")}"><small>Sugestão para os produtos deste fornecedor</small></label>
      <label class="campo" style="grid-column:1/-1"><span>Observações</span><input name="obs" value="${esc(f.obs || "")}"></label>
      <label class="check"><input type="checkbox" name="ativo" ${f.ativo !== false ? "checked" : ""}> Ativo</label>
    </form>`,
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: (m) => {
        const d = lerForm($("form", m));
        if (!d.nome) throw new Error("Informe o nome");
        salvarFornecedor(d, novo ? null : f.id);
        toast("Fornecedor salvo");
      } },
    ],
  });
}

export default { render };
