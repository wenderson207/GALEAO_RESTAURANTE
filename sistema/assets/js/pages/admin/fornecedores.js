// =====================================================================
// FORNECEDORES — cadastro completo (CNPJ, contato, endereço pelo CEP,
// entrega e pagamento) + aba "O que cada um entrega"
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { salvarFornecedor, vincularProdutosFornecedor } from "../../core/db.js";
import {
  $, $$, esc, num, moeda, modal, toast, lerForm, soDigitos,
  ligarMascaras, ligarCep, ligarCnpj, camposEndereco, enderecoTexto,
} from "../../core/util.js";
import { vazio, selo, fotoMini } from "./componentes.js";
import { calcularPrevisao } from "../../core/previsao.js";

const DIAS = [["seg", "Seg"], ["ter", "Ter"], ["qua", "Qua"], ["qui", "Qui"], ["sex", "Sex"], ["sab", "Sáb"], ["dom", "Dom"]];
let aba = "cadastro";
let busca = "";

function linkWhats(tel) {
  const d = soDigitos(tel);
  if (d.length < 10) return "";
  return `https://wa.me/${d.startsWith("55") ? d : "55" + d}`;
}

function render(el, { unidadeId }) {
  el.innerHTML = `
    <div class="abas">
      <button class="aba ${aba === "cadastro" ? "ativo" : ""}" data-aba="cadastro">🚚 Fornecedores</button>
      <button class="aba ${aba === "entrega" ? "ativo" : ""}" data-aba="entrega">📋 O que cada um entrega</button>
    </div>
    <div data-corpo></div>`;
  $$("[data-aba]", el).forEach((b) => b.onclick = () => { aba = b.dataset.aba; render(el, { unidadeId }); });
  const corpo = $("[data-corpo]", el);
  if (aba === "cadastro") abaCadastro(corpo, el, unidadeId); else abaEntrega(corpo, unidadeId);
}

// ---------------------------------------------------------------- lista de fornecedores
function abaCadastro(corpo, el, unidadeId) {
  const termo = busca.toLowerCase();
  const lista = sync.lista("fornecedores")
    .filter((f) => !termo || [f.nome, f.razaoSocial, f.cnpj, f.contato].some((x) => (x || "").toLowerCase().includes(termo)))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const qtd = {};
  sync.lista("produtos").forEach((p) => { if (p.fornecedorId && p.ativo !== false) qtd[p.fornecedorId] = (qtd[p.fornecedorId] || 0) + 1; });

  corpo.innerHTML = `
    <div class="filtros">
      <label class="campo cresce"><span>Buscar</span><input type="search" data-busca value="${esc(busca)}" placeholder="Nome, razão social, CNPJ ou contato"></label>
      <button class="btn btn-pri" data-novo>+ Novo fornecedor</button>
    </div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Fornecedor</th><th>CNPJ</th><th>Contato</th><th>Telefone</th><th>Cidade</th><th class="num">Prazo</th><th>Entrega em</th><th class="num">Produtos</th><th></th></tr></thead>
      <tbody>${lista.map((f) => {
        const w = linkWhats(f.whatsapp || f.telefone);
        return `<tr class="clicavel" data-id="${f.id}">
          <td><b>${esc(f.nome)}</b> ${f.ativo === false ? '<span class="selo selo-cinza">Inativo</span>' : ""}${f.razaoSocial ? `<div class="muted pequeno">${esc(f.razaoSocial)}</div>` : ""}</td>
          <td>${esc(f.cnpj || "—")}</td>
          <td>${esc(f.contato || "—")}</td>
          <td>${esc(f.telefone || f.whatsapp || "—")} ${w ? `<a href="${w}" target="_blank" rel="noopener" class="btn btn-pequeno btn-sec" data-link title="WhatsApp">💬</a>` : ""}</td>
          <td>${esc([f.cidade, f.uf].filter(Boolean).join("/") || "—")}</td>
          <td class="num">${f.prazoDias ? f.prazoDias + " dia(s)" : "—"}</td>
          <td>${(f.diasEntrega || []).map((d) => DIAS.find((x) => x[0] === d)?.[1]).filter(Boolean).join(", ") || "—"}</td>
          <td class="num">${qtd[f.id] || 0}</td>
          <td class="num"><button class="btn btn-pequeno btn-sec">Editar</button></td></tr>`;
      }).join("") || `<tr><td colspan="9">${vazio("🚚", "Nenhum fornecedor cadastrado.")}</td></tr>`}</tbody>
    </table></div>`;

  const b = $("[data-busca]", corpo);
  b.oninput = () => { busca = b.value; render(el, { unidadeId }); const n = $("[data-busca]", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $("[data-novo]", corpo).onclick = () => form(null);
  corpo.onclick = (e) => {
    if (e.target.closest("[data-link]")) return;
    const tr = e.target.closest("[data-id]"); if (tr) form(sync.get("fornecedores", tr.dataset.id));
  };
}

// ---------------------------------------------------------------- o que cada um entrega
function abaEntrega(corpo, unidadeId) {
  const cfg = estado.config(), cd = sync.lista("consumoDiario");
  const produtos = sync.lista("produtos").filter((p) => p.ativo !== false && (!unidadeId || p.unidadeId === unidadeId));
  const fornecedores = sync.lista("fornecedores").filter((f) => f.ativo !== false).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const semForn = produtos.filter((p) => !p.fornecedorId || !sync.get("fornecedores", p.fornecedorId));

  const bloco = (f, itens) => {
    const w = f ? linkWhats(f.whatsapp || f.telefone) : "";
    return `
    <div class="card">
      <div class="card-topo">
        <div><h3>${f ? "🚚 " + esc(f.nome) : "❔ Sem fornecedor definido"}</h3>
          ${f ? `<div class="muted pequeno">${[f.prazoDias ? `Entrega em ${f.prazoDias} dia(s)` : "", (f.diasEntrega || []).length ? "Dias: " + f.diasEntrega.map((d) => DIAS.find((x) => x[0] === d)?.[1]).join(", ") : "", f.pedidoMinimo ? "Pedido mínimo " + moeda(f.pedidoMinimo) : ""].filter(Boolean).join(" · ") || "&nbsp;"}</div>` : ""}</div>
        ${f ? `<div class="linha">${w ? `<a class="btn btn-sec btn-pequeno" href="${w}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}<button class="btn btn-sec btn-pequeno" data-itens="${f.id}">✏️ Editar itens</button></div>` : ""}
      </div>
      ${itens.length ? `<div class="tabela-wrap compacta"><table><tbody>${itens.map((p) => {
        const pr = calcularPrevisao(p, cd, cfg);
        return `<tr><td><div class="linha">${fotoMini(p)}<div><b>${esc(p.nome)}</b><div class="muted pequeno">${esc(estado.nomeUnidade(p.unidadeId))}</div></div></div></td>
          <td class="num">${num(p.estoque)} ${esc(p.unidadeMedida || "un")}</td><td class="num">${selo(pr.status)}</td></tr>`;
      }).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">Nenhum produto cadastrado vinculado.</p>`}
      ${f?.itensExtras ? `<div style="margin-top:10px"><span class="muted pequeno"><b>Outros itens que entrega:</b></span><div class="chips" style="margin-top:6px">${f.itensExtras.split("\n").filter((x) => x.trim()).map((x) => `<span class="chip">${esc(x.trim())}</span>`).join("")}</div></div>` : ""}
    </div>`;
  };

  corpo.innerHTML = `
    <p class="muted" style="margin-top:0">Cada produto tem um fornecedor principal. Use <b>Editar itens</b> para marcar o que cada fornecedor entrega.</p>
    <div class="grade grade-2">
      ${fornecedores.map((f) => bloco(f, produtos.filter((p) => p.fornecedorId === f.id))).join("") || `<div class="card">${vazio("🚚", "Cadastre fornecedores na aba ao lado.")}</div>`}
      ${semForn.length ? bloco(null, semForn) : ""}
    </div>`;
  corpo.onclick = (e) => { const b = e.target.closest("[data-itens]"); if (b) editarItens(sync.get("fornecedores", b.dataset.itens)); };
}

function editarItens(f) {
  const produtos = sync.lista("produtos").filter((p) => p.ativo !== false).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  modal({
    titulo: `O que ${f.nome} entrega`, largo: true,
    corpo: `
      <input type="search" data-filtro placeholder="Filtrar produtos" style="margin-bottom:12px">
      <div class="pilha" data-lista style="max-height:50vh;overflow:auto">
        ${produtos.map((p) => {
          const outro = p.fornecedorId && p.fornecedorId !== f.id ? sync.get("fornecedores", p.fornecedorId)?.nome : "";
          return `<label class="check" data-nome="${esc((p.nome || "").toLowerCase())}"><input type="checkbox" value="${p.id}" ${p.fornecedorId === f.id ? "checked" : ""}>
            <span>${esc(p.nome)} <span class="muted pequeno">· ${esc(estado.nomeUnidade(p.unidadeId))}${outro ? ` · hoje: ${esc(outro)}` : ""}</span></span></label>`;
        }).join("") || vazio("📦", "Nenhum produto cadastrado.")}
      </div>
      <label class="campo" style="margin-top:14px"><span>Outros itens que entrega (fora do estoque) — um por linha</span>
        <textarea data-extras rows="3" placeholder="Ex.: Gelo&#10;Carvão">${esc(f.itensExtras || "")}</textarea></label>
      <p class="muted pequeno">Marcar um produto que já é de outro fornecedor passa ele para ${esc(f.nome)}.</p>`,
    aoAbrir: (m) => {
      const filtro = $("[data-filtro]", m);
      filtro.oninput = () => $$("[data-nome]", m).forEach((l) => { l.style.display = l.dataset.nome.includes(filtro.value.toLowerCase()) ? "" : "none"; });
    },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: async (m) => {
        const ids = $$("[data-lista] input:checked", m).map((i) => i.value);
        const n = await vincularProdutosFornecedor(f.id, ids);
        const extras = $("[data-extras]", m).value.trim();
        if (extras !== (f.itensExtras || "")) salvarFornecedor({ itensExtras: extras }, f.id);
        toast(n ? `${n} produto(s) atualizado(s)` : "Salvo");
      } },
    ],
  });
}

// ---------------------------------------------------------------- formulário
function form(f) {
  const novo = !f;
  f = f || { ativo: true, diasEntrega: [] };
  const v = (k) => esc(f[k] ?? "");
  modal({
    titulo: novo ? "Novo fornecedor" : `Editar — ${f.nome}`, largo: true,
    corpo: `<form class="form-grade" onsubmit="return false">
      <div class="form-secao">Identificação</div>
      <label class="campo campo-largo"><span>Nome (como vocês chamam) *</span><input name="nome" required value="${v("nome")}" placeholder="Ex.: Atacadão"></label>
      <label class="campo campo-largo"><span>CNPJ</span><input name="cnpj" data-mascara="cnpj" value="${v("cnpj")}" placeholder="00.000.000/0000-00"></label>
      <label class="campo campo-largo"><span>Razão social</span><input name="razaoSocial" value="${v("razaoSocial")}"></label>
      <label class="campo"><span>Nome fantasia</span><input name="nomeFantasia" value="${v("nomeFantasia")}"></label>
      <label class="campo"><span>Inscrição estadual</span><input name="ie" value="${v("ie")}"></label>

      <div class="form-secao">Contato</div>
      <label class="campo"><span>Vendedor / contato</span><input name="contato" value="${v("contato")}"></label>
      <label class="campo"><span>Telefone</span><input name="telefone" data-mascara="telefone" value="${v("telefone")}" placeholder="(11) 0000-0000"></label>
      <label class="campo"><span>WhatsApp</span><input name="whatsapp" data-mascara="telefone" value="${v("whatsapp")}" placeholder="(11) 90000-0000"></label>
      <label class="campo"><span>E-mail</span><input name="email" type="email" value="${v("email")}"></label>
      <label class="campo"><span>Site / catálogo</span><input name="site" value="${v("site")}"></label>

      ${camposEndereco(f)}

      <div class="form-secao">Entrega e pagamento</div>
      <label class="campo"><span>Prazo de entrega (dias)</span><input name="prazoDias" data-tipo="numero" inputmode="numeric" value="${v("prazoDias")}"><small>Sugestão para os produtos deste fornecedor</small></label>
      <label class="campo"><span>Pedido mínimo (R$)</span><input name="pedidoMinimo" data-tipo="numero" inputmode="decimal" value="${f.pedidoMinimo ? num(f.pedidoMinimo, 2).replace(/\./g, "") : ""}"></label>
      <label class="campo"><span>Forma de pagamento</span><input name="pagamento" list="lista-pag" value="${v("pagamento")}"><datalist id="lista-pag"><option value="Pix"><option value="Boleto 28 dias"><option value="Dinheiro"><option value="Cartão"><option value="Faturado"></datalist></label>
      <div class="campo campo-total"><span>Dias em que entrega</span>
        <div class="chips">${DIAS.map(([k, t]) => `<label class="chip"><input type="checkbox" name="d_${k}" ${(f.diasEntrega || []).includes(k) ? "checked" : ""} style="width:16px;height:16px;vertical-align:middle"> ${t}</label>`).join("")}</div></div>
      <label class="campo campo-total"><span>Observações</span><textarea name="obs" rows="2">${v("obs")}</textarea></label>
      <label class="check campo-total"><input type="checkbox" name="ativo" ${f.ativo !== false ? "checked" : ""}> Ativo</label>
    </form>`,
    aoAbrir: (m) => { const fm = $("form", m); ligarMascaras(fm); ligarCep(fm); ligarCnpj(fm); },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: (m) => {
        const d = lerForm($("form", m));
        if (!d.nome) d.nome = d.nomeFantasia || d.razaoSocial;
        if (!d.nome) throw new Error("Informe o nome do fornecedor");
        d.uf = (d.uf || "").toUpperCase();
        d.diasEntrega = DIAS.map(([k]) => k).filter((k) => d["d_" + k]);
        DIAS.forEach(([k]) => delete d["d_" + k]);
        d.enderecoCompleto = enderecoTexto(d);
        salvarFornecedor(d, novo ? null : f.id);
        toast("Fornecedor salvo");
      } },
    ],
  });
}

export default { render };
