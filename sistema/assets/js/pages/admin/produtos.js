// =====================================================================
// PRODUTOS E ESTOQUE — cadastro, edição, ajuste de estoque
// O estoque NUNCA é editado direto: muda só por entrada, retirada ou ajuste (auditado).
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { salvarProduto, registrarAjuste } from "../../core/db.js";
import { calcularPrevisao } from "../../core/previsao.js";
import { $, esc, num, moeda, modal, toast, lerForm, comprimirPorTipo, IMAGENS, paraNumero } from "../../core/util.js";
import { selo, fotoMini, vazio, categorias, opcoesUnidade, opcoesFornecedor, produtosFiltrados } from "./componentes.js";
import { abrirExplicacao } from "./reposicao.js";

const UNIDADES_MEDIDA = ["un", "pacote", "kg", "g", "L", "ml", "caixa", "fardo", "lata", "garrafa", "saco", "bandeja", "maço", "dúzia", "pote"];
const filtro = { busca: "", cat: "", situacao: "", inativos: false };

function render(el, { unidadeId }) {
  const cfg = estado.config();
  const cd = sync.lista("consumoDiario");
  const lista = produtosFiltrados(unidadeId, filtro.inativos)
    .map((p) => ({ p, prev: calcularPrevisao(p, cd, cfg) }))
    .filter(({ p, prev }) =>
      (!filtro.busca || (p.nome || "").toLowerCase().includes(filtro.busca.toLowerCase()))
      && (!filtro.cat || p.categoria === filtro.cat)
      && (!filtro.situacao || (filtro.situacao === "alerta" ? ["sem", "comprar", "baixo"].includes(prev.status) : prev.status === filtro.situacao)));

  el.innerHTML = `
    <div class="filtros">
      <label class="campo cresce"><span>Buscar</span><input type="search" data-f="busca" value="${esc(filtro.busca)}" placeholder="Nome do produto"></label>
      <label class="campo"><span>Categoria</span><select data-f="cat"><option value="">Todas</option>${categorias().map((c) => `<option ${c === filtro.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="campo"><span>Situação</span><select data-f="situacao">
        <option value="">Todas</option>
        <option value="alerta" ${filtro.situacao === "alerta" ? "selected" : ""}>Precisa de atenção</option>
        <option value="sem" ${filtro.situacao === "sem" ? "selected" : ""}>Sem estoque</option>
        <option value="baixo" ${filtro.situacao === "baixo" ? "selected" : ""}>Estoque baixo</option>
      </select></label>
      <label class="check" style="min-height:40px"><input type="checkbox" data-f="inativos" ${filtro.inativos ? "checked" : ""}> Mostrar inativos</label>
      <button class="btn btn-pri" data-novo>+ Novo produto</button>
    </div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Produto</th><th>Categoria</th>${unidadeId ? "" : "<th>Unidade</th>"}<th class="num">Estoque</th><th class="num">Mínimo</th><th class="num">Custo</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map(({ p, prev }) => `
        <tr>
          <td><div class="linha">${fotoMini(p)}<div><b>${esc(p.nome)}</b>${p.ativo === false ? ' <span class="selo selo-cinza">Inativo</span>' : ""}${p.quantidadeVariavel ? '<div class="muted pequeno">Quantidade variável</div>' : ""}</div></div></td>
          <td>${esc(p.categoria || "—")}</td>
          ${unidadeId ? "" : `<td>${esc(estado.nomeUnidade(p.unidadeId))}</td>`}
          <td class="num"><b>${num(p.estoque)}</b> ${esc(p.unidadeMedida || "un")}</td>
          <td class="num">${num(p.estoqueMinimo)}</td>
          <td class="num">${p.custo ? moeda(p.custo) : "—"}</td>
          <td>${selo(prev.status)}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn btn-pequeno btn-sec" data-acao="prev" data-id="${p.id}" title="Previsão">📈</button>
            <button class="btn btn-pequeno btn-sec" data-acao="entrada" data-id="${p.id}" title="Registrar compra">📥</button>
            <button class="btn btn-pequeno btn-sec" data-acao="ajuste" data-id="${p.id}" title="Ajustar estoque">⚖️</button>
            <button class="btn btn-pequeno btn-sec" data-acao="editar" data-id="${p.id}">Editar</button>
          </td>
        </tr>`).join("") || `<tr><td colspan="8">${vazio("📦", "Nenhum produto encontrado. Clique em <b>+ Novo produto</b> para começar.")}</td></tr>`}
      </tbody>
    </table></div>
    <p class="nota-estimativa">${lista.length} produto(s). O estoque só muda por entrada, retirada ou ajuste — tudo fica registrado em Movimentações.</p>`;

  el.querySelectorAll("[data-f]").forEach((i) => {
    const ev = i.type === "search" ? "input" : "change";
    i.addEventListener(ev, () => {
      filtro[i.dataset.f] = i.type === "checkbox" ? i.checked : i.value;
      const foco = i.type === "search";
      render(el, { unidadeId });
      if (foco) { const n = $("[data-f=busca]", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });
  });
  $("[data-novo]", el).onclick = () => formProduto(null, unidadeId);
  el.onclick = (e) => {
    const b = e.target.closest("[data-acao]"); if (!b) return;
    const p = sync.get("produtos", b.dataset.id);
    if (b.dataset.acao === "editar") formProduto(p);
    if (b.dataset.acao === "ajuste") formAjuste(p);
    if (b.dataset.acao === "prev") abrirExplicacao(p);
    if (b.dataset.acao === "entrada") location.hash = `#/admin/entradas?p=${p.id}`;
  };
}

export function formProduto(p, unidadePadrao) {
  const novo = !p;
  p = p || { ativo: true, unidadeMedida: "un", quantidadePadrao: 1, coberturaDias: estado.config().coberturaPadrao, unidadeId: unidadePadrao || estado.unidadesPermitidas()[0]?.id };
  let foto = p.foto || "";
  const v = (k, d = "") => esc(p[k] ?? d);
  const numCampo = (nome, rotulo, dica = "") =>
    `<label class="campo"><span>${rotulo}</span><input name="${nome}" data-tipo="numero" inputmode="decimal" value="${p[nome] !== undefined && p[nome] !== "" ? num(p[nome], 3).replace(/\./g, "") : ""}">${dica ? `<small>${dica}</small>` : ""}</label>`;

  const corpo = `
  <form class="form-grade" onsubmit="return false">
    <div class="form-secao">Identificação</div>
    <div class="campo" style="grid-column:1/-1">
      <span>Foto</span>
      <div class="foto-upload"><div class="preview" data-preview>${foto ? `<img src="${esc(foto)}" alt="">` : "📷"}</div>
        <div class="linha"><label class="btn btn-sec">Escolher foto<input type="file" accept="image/*" capture="environment" data-foto hidden></label>
        <button type="button" class="btn btn-texto" data-tirar-foto ${foto ? "" : "hidden"}>Remover</button></div></div>
      <small>${IMAGENS.produto.dica} O sistema recorta o centro em quadrado.</small>
    </div>
    <label class="campo" style="grid-column:1/-1"><span>Nome do produto</span><input name="nome" required value="${v("nome")}" placeholder="Ex.: Arroz"></label>
    <label class="campo"><span>Categoria</span><input name="categoria" list="lista-cat" value="${v("categoria")}" placeholder="Ex.: Grãos"><datalist id="lista-cat">${categorias().map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
    <label class="campo"><span>Unidade de medida</span><input name="unidadeMedida" list="lista-um" value="${v("unidadeMedida", "un")}"><datalist id="lista-um">${UNIDADES_MEDIDA.map((u) => `<option value="${u}">`).join("")}</datalist></label>
    <label class="campo"><span>Restaurante / unidade</span><select name="unidadeId">${opcoesUnidade(p.unidadeId)}</select></label>
    <label class="campo"><span>Fornecedor</span><select name="fornecedorId">${opcoesFornecedor(p.fornecedorId)}</select></label>

    <div class="form-secao">Estoque</div>
    ${novo ? numCampo("estoqueInicial", "Estoque atual", "Quantidade que existe hoje") : `<div class="campo"><span>Estoque atual</span><input disabled value="${num(p.estoque)} ${esc(p.unidadeMedida)}"><small>Para corrigir use ⚖️ Ajustar estoque</small></div>`}
    ${numCampo("estoqueMinimo", "Estoque mínimo", "Abaixo disso: estoque baixo")}
    ${numCampo("estoqueSeguranca", "Estoque de segurança", "Reserva que nunca deve faltar")}

    <div class="form-secao">Reposição</div>
    ${numCampo("prazoFornecedor", "Prazo do fornecedor (dias)", "Quanto tempo leva para entregar")}
    ${numCampo("coberturaDias", "Cobertura desejada (dias)", "Comprar para quantos dias")}
    ${numCampo("compraMinima", "Quantidade mínima de compra", "Ex.: fardo com 6")}
    ${numCampo("custo", "Custo de compra (R$ por unidade)")}

    <div class="form-secao">Retirada no tablet</div>
    ${numCampo("quantidadePadrao", "Quantidade padrão por retirada", "Normalmente 1")}
    <label class="check" style="grid-column:1/-1"><input type="checkbox" name="quantidadeVariavel" ${p.quantidadeVariavel ? "checked" : ""}> Quantidade variável (pede a quantidade no tablet — ex.: carne em kg)</label>
    <label class="check" style="grid-column:1/-1"><input type="checkbox" name="ativo" ${p.ativo !== false ? "checked" : ""}> Produto ativo</label>
  </form>`;

  modal({
    titulo: novo ? "Novo produto" : `Editar — ${p.nome}`, corpo, largo: true,
    aoAbrir: (m) => {
      const input = $("[data-foto]", m);
      const prev = $("[data-preview]", m);
      const remover = $("[data-tirar-foto]", m);
      input.onchange = async () => {
        if (!input.files[0]) return;
        try { foto = await comprimirPorTipo(input.files[0], "produto"); prev.innerHTML = `<img src="${foto}" alt="">`; remover.hidden = false; }
        catch (e) { toast(e.message, "erro"); }
      };
      remover.onclick = () => { foto = ""; prev.textContent = "📷"; remover.hidden = true; };
      // escolheu o fornecedor e o prazo está vazio: usa o prazo do fornecedor
      const selF = $("[name=fornecedorId]", m);
      selF.onchange = () => {
        const f = sync.get("fornecedores", selF.value);
        const pz = $("[name=prazoFornecedor]", m);
        if (f?.prazoDias && !pz.value) pz.value = f.prazoDias;
      };
      $("[name=nome]", m)?.focus();
    },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: (m) => {
        const d = lerForm($("form", m));
        d.foto = foto;
        d.quantidadePadrao = d.quantidadePadrao > 0 ? d.quantidadePadrao : 1;
        if (!d.categoria) d.categoria = "Outros";
        if (!d.unidadeMedida) d.unidadeMedida = "un";
        salvarProduto(d, novo ? null : p.id);
        toast(novo ? "Produto cadastrado" : "Produto atualizado");
      } },
    ],
  });
}

export function formAjuste(p) {
  const un = p.unidadeMedida || "un";
  modal({
    titulo: `Ajustar estoque — ${p.nome}`,
    corpo: `
      <form class="pilha" onsubmit="return false">
        <p class="aviso aviso-info">Use quando a contagem física for diferente do sistema. O histórico não é apagado — o ajuste fica registrado com seu nome, data e motivo.</p>
        <div class="form-grade">
          <div class="campo"><span>Estoque no sistema</span><input disabled value="${num(p.estoque)} ${esc(un)}"></div>
          <label class="campo"><span>Estoque físico (contado)</span><input name="novo" inputmode="decimal" required autofocus></label>
        </div>
        <label class="campo"><span>Motivo</span><select name="motivo">
          <option>Contagem física</option><option>Perda / quebra</option><option>Produto vencido</option><option>Erro de lançamento</option><option>Outro</option>
        </select></label>
        <label class="campo"><span>Observação (opcional)</span><input name="obs"></label>
        <p class="muted pequeno" data-dif></p>
      </form>`,
    aoAbrir: (m) => {
      const i = $("[name=novo]", m);
      i.oninput = () => {
        const d = paraNumero(i.value) - Number(p.estoque || 0);
        $("[data-dif]", m).textContent = i.value ? `Diferença: ${d > 0 ? "+" : ""}${num(d)} ${un}` : "";
      };
      i.focus();
    },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar ajuste", classe: "btn-pri", onClick: (m) => {
        const f = $("form", m);
        if (!f.novo.value.trim()) throw new Error("Informe o estoque contado");
        const motivo = f.motivo.value + (f.obs.value.trim() ? ` — ${f.obs.value.trim()}` : "");
        registrarAjuste({ produto: p, novoEstoque: paraNumero(f.novo.value), motivo });
        toast("Ajuste registrado");
      } },
    ],
  });
}

export default { render };
