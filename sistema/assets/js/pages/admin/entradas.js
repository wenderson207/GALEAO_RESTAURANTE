// =====================================================================
// ENTRADAS (compras) — aumenta o estoque e registra custo, fornecedor e data
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { registrarEntrada } from "../../core/db.js";
import { $, esc, num, moeda, data, toast, paraNumero, inputData } from "../../core/util.js";
import { vazio, opcoesFornecedor, produtosFiltrados, periodoPadrao, camposPeriodo, lerPeriodo, exportarCSV } from "./componentes.js";

const periodo = periodoPadrao(30);

function render(el, { unidadeId }) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const preSel = params.get("p") || "";
  const produtos = produtosFiltrados(unidadeId);

  const entradas = sync.lista("movimentacoes")
    .filter((m) => m.tipo === "entrada" && (!unidadeId || m.unidadeId === unidadeId)
      && (m.dataMs || 0) >= periodo.de && (m.dataMs || 0) <= periodo.ate)
    .sort((a, b) => (b.dataMs || 0) - (a.dataMs || 0));
  const total = entradas.reduce((s, m) => s + Number(m.custoTotal || 0), 0);

  el.innerHTML = `
  <div class="pilha">
    <div class="card">
      <div class="card-topo"><h2>📥 Nova entrada</h2></div>
      ${produtos.length ? `
      <form class="form-grade" data-form>
        <label class="campo" style="grid-column:span 2"><span>Produto</span><select name="produto" required>
          <option value="">Escolha o produto…</option>
          ${produtos.map((p) => `<option value="${p.id}" ${p.id === preSel ? "selected" : ""}>${esc(p.nome)}${unidadeId ? "" : " — " + esc(estado.nomeUnidade(p.unidadeId))} (estoque: ${num(p.estoque)} ${esc(p.unidadeMedida || "un")})</option>`).join("")}
        </select></label>
        <label class="campo"><span>Quantidade <b data-un></b></span><input name="quantidade" inputmode="decimal" required></label>
        <label class="campo"><span>Custo unitário (R$)</span><input name="custo" inputmode="decimal" placeholder="0,00"></label>
        <label class="campo"><span>Fornecedor</span><select name="fornecedor">${opcoesFornecedor("")}</select></label>
        <label class="campo"><span>Data da compra</span><input name="data" type="date" value="${inputData()}" max="${inputData()}"></label>
        <label class="campo" style="grid-column:span 2"><span>Observação (opcional)</span><input name="obs" placeholder="Nota fiscal, lote…"></label>
        <div class="campo" style="justify-content:flex-end"><span data-total class="muted"></span></div>
        <div style="grid-column:1/-1" class="linha"><button class="btn btn-pri">Salvar entrada</button><span class="muted pequeno">Ao salvar: estoque aumenta, custo e fornecedor ficam registrados e a previsão é atualizada.</span></div>
      </form>` : vazio("📦", 'Cadastre produtos primeiro em <a href="#/admin/produtos">Produtos</a>.')}
    </div>

    <div class="card">
      <div class="card-topo"><h2>Entradas realizadas</h2>
        <div class="filtros" style="margin:0">${camposPeriodo(periodo)}<button class="btn btn-sec btn-pequeno" data-csv>⬇ CSV</button></div>
      </div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>Produto</th>${unidadeId ? "" : "<th>Unidade</th>"}<th class="num">Quantidade</th><th class="num">Custo unit.</th><th class="num">Total</th><th>Fornecedor</th><th>Registrado por</th></tr></thead>
        <tbody>${entradas.map((m) => `<tr>
          <td>${data(m.dataMs)}</td><td><b>${esc(m.produtoNome)}</b>${m.observacao ? `<div class="muted pequeno">${esc(m.observacao)}</div>` : ""}</td>
          ${unidadeId ? "" : `<td>${esc(estado.nomeUnidade(m.unidadeId))}</td>`}
          <td class="num">${num(m.quantidade)} ${esc(m.unidadeMedida)}</td><td class="num">${m.custoUnitario ? moeda(m.custoUnitario) : "—"}</td>
          <td class="num">${m.custoTotal ? moeda(m.custoTotal) : "—"}</td><td>${esc(m.fornecedorNome || "—")}</td><td class="muted">${esc(m.usuarioNome)}</td></tr>`).join("")
          || `<tr><td colspan="8">${vazio("📭", "Nenhuma entrada no período.")}</td></tr>`}</tbody>
      </table></div>
      <p class="muted" style="margin:10px 0 0"><b>${entradas.length}</b> entrada(s) · Total: <b>${moeda(total)}</b></p>
    </div>
  </div>`;

  const form = $("[data-form]", el);
  if (form) {
    const atualizar = () => {
      const p = sync.get("produtos", form.produto.value);
      $("[data-un]", form).textContent = p ? `(${p.unidadeMedida || "un"})` : "";
      if (p && !form.custo.value && p.custo) form.custo.value = num(p.custo, 2).replace(/\./g, "");
      if (p && p.fornecedorId && !form.fornecedor.value) form.fornecedor.value = p.fornecedorId;
      const t = paraNumero(form.quantidade.value) * paraNumero(form.custo.value);
      $("[data-total]", form).textContent = t ? `Total: ${moeda(t)}` : "";
    };
    form.addEventListener("input", atualizar);
    form.produto.addEventListener("change", () => { form.custo.value = ""; form.fornecedor.value = ""; atualizar(); });
    atualizar();
    form.onsubmit = (e) => {
      e.preventDefault();
      const p = sync.get("produtos", form.produto.value);
      if (!p) return toast("Escolha o produto", "erro");
      try {
        const dataMs = form.data.value ? new Date(form.data.value + "T12:00:00").getTime() : Date.now();
        registrarEntrada({
          produto: p, quantidade: paraNumero(form.quantidade.value), custoUnitario: paraNumero(form.custo.value),
          fornecedorId: form.fornecedor.value, dataMs: form.data.value === inputData() ? Date.now() : dataMs, observacao: form.obs.value.trim(),
        });
        toast(`Entrada registrada: +${num(paraNumero(form.quantidade.value))} ${p.unidadeMedida || "un"} de ${p.nome}`);
        if (preSel) history.replaceState(null, "", "#/admin/entradas");
        render(el, { unidadeId });
      } catch (err) { toast(err.message, "erro"); }
    };
  }

  el.querySelectorAll("[data-de],[data-ate]").forEach((i) => i.onchange = () => { lerPeriodo(el, periodo); render(el, { unidadeId }); });
  $("[data-csv]", el).onclick = () => exportarCSV("entradas.csv",
    ["Data", "Produto", "Unidade", "Quantidade", "Medida", "Custo unitário", "Total", "Fornecedor", "Registrado por"],
    entradas.map((m) => [data(m.dataMs), m.produtoNome, estado.nomeUnidade(m.unidadeId), String(m.quantidade).replace(".", ","), m.unidadeMedida,
      String(m.custoUnitario || "").replace(".", ","), String(m.custoTotal || "").replace(".", ","), m.fornecedorNome, m.usuarioNome]));
}

// o formulário não deve ser apagado enquanto a pessoa digita
export default { render, semAutoRefresh: true };
