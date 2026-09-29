// =====================================================================
// LISTAS DE COMPRAS — no estilo "Lembretes" do iPhone
// Várias listas com nome e cor; itens com quantidade (+/−), fornecedor, preço,
// marcar como comprado, imprimir, excluir e dar entrada no estoque.
// Cada lista é 1 documento (itens dentro) -> abrir/editar custa pouquíssimo.
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { salvarLista, excluirLista, registrarEntrada } from "../../core/db.js";
import { previsoesDaUnidade } from "../../core/previsao.js";
import { $, $$, esc, num, moeda, modal, toast, confirmar, idNovo, paraNumero, imprimir, dataHora, data } from "../../core/util.js";
import { vazio, opcoesUnidade, opcoesFornecedor } from "./componentes.js";

export const CORES = ["#0F766E", "#2563EB", "#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#7C3AED", "#DB2777", "#475569"];
const ICONES = ["🛒", "🥩", "🥬", "🍚", "🧴", "🥤", "📦", "🧀", "🍞"];

let listaAtual = null;      // id da lista aberta
let mostrarComprados = true;
let agrupar = false;
let abertaNoCelular = false;

export function listasAtivas() {
  return sync.lista("listasCompras").filter((l) => !l.excluida)
    .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
}

// Item de lista a partir de um produto (usa quantidade sugerida quando existir)
export function itemDoProduto(p, qtd) {
  return {
    id: idNovo(), nome: p.nome, produtoId: p.id, qtd: Number(qtd || 1), un: p.unidadeMedida || "un",
    fornecedorId: p.fornecedorId || "", preco: Number(p.custo || 0), obs: "", feito: false,
  };
}

function juntarItens(itens, novos) {
  const r = itens.map((i) => ({ ...i }));
  for (const n of novos) {
    const ex = n.produtoId && r.find((i) => i.produtoId === n.produtoId && !i.feito);
    if (ex) ex.qtd = Number(ex.qtd || 0) + Number(n.qtd || 0); else r.push(n);
  }
  return r;
}

// Modal reaproveitado pela Central de reposição: escolher lista (ou criar) e adicionar itens
export function adicionarAListas(novosItens, nomeSugerido = "") {
  const listas = listasAtivas();
  modal({
    titulo: `Adicionar ${novosItens.length} item(ns) à lista`,
    corpo: `<div class="pilha">
      ${listas.length ? `<label class="campo"><span>Lista existente</span><select data-lista><option value="">— Criar lista nova —</option>
        ${listas.map((l) => `<option value="${l.id}">${esc(l.nome)} (${(l.itens || []).filter((i) => !i.feito).length} pendentes)</option>`).join("")}</select></label>` : ""}
      <label class="campo" data-bloco-nome><span>Nome da nova lista</span><input data-nome value="${esc(nomeSugerido)}"></label>
      <div class="tabela-wrap compacta"><table><tbody>${novosItens.map((i) => `<tr><td>${esc(i.nome)}</td><td class="num">${num(i.qtd)} ${esc(i.un)}</td></tr>`).join("")}</tbody></table></div>
    </div>`,
    aoAbrir: (m) => {
      const sel = $("[data-lista]", m);
      if (sel) sel.onchange = () => { $("[data-bloco-nome]", m).style.display = sel.value ? "none" : ""; };
    },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Adicionar", classe: "btn-pri", onClick: async (m) => {
        const id = $("[data-lista]", m)?.value;
        if (id) {
          const l = sync.get("listasCompras", id);
          await salvarLista({ itens: juntarItens(l.itens || [], novosItens) }, id);
          listaAtual = id;
        } else {
          const nome = $("[data-nome]", m).value.trim() || "Compras " + data(Date.now());
          listaAtual = await salvarLista(novaLista(nome, novosItens));
        }
        toast("Itens adicionados à lista");
        location.hash = "#/admin/listas";
      } },
    ],
  });
}

function novaLista(nome, itens = [], cor = CORES[0], icone = "🛒") {
  return { nome, cor, icone, unidadeId: estado.unidadeId || "", itens, criadoPor: estado.perfil.nome || "", excluida: false };
}

// ---------------------------------------------------------------- tela
function render(el) {
  const listas = listasAtivas();
  if (listaAtual && !listas.some((l) => l.id === listaAtual)) listaAtual = null;
  if (!listaAtual && listas.length) listaAtual = listas[0].id;
  const l = listaAtual ? sync.get("listasCompras", listaAtual) : null;

  el.innerHTML = `
  <div class="listas ${abertaNoCelular && l ? "abrir" : ""}">
    <aside class="listas-lado">
      <div class="linha entre"><h3>Minhas listas</h3><span class="muted pequeno">${listas.length}</span></div>
      ${listas.map((x) => {
        const pend = (x.itens || []).filter((i) => !i.feito).length;
        return `<button class="lista-card ${x.id === listaAtual ? "ativo" : ""}" data-abrir="${x.id}">
          <span class="ico" style="background:${esc(x.cor || CORES[0])}">${esc(x.icone || "🛒")}</span>
          <span class="nome">${esc(x.nome)}<small class="muted" style="display:block;font-weight:500;font-size:12px">${x.unidadeId ? esc(estado.nomeUnidade(x.unidadeId)) : "Todas as unidades"}</small></span>
          <span class="cont">${pend}</span></button>`;
      }).join("") || `<div class="card">${vazio("📝", "Nenhuma lista ainda.")}</div>`}
      <button class="btn btn-pri" data-nova>+ Nova lista</button>
      <button class="btn btn-sec" data-gerar>⚡ Gerar lista da reposição</button>
    </aside>
    <section class="lista-principal" style="--cor-lista:${esc(l?.cor || CORES[0])}">
      ${l ? corpoLista(l) : vazio("📝", "Crie uma lista para começar.")}
    </section>
  </div>`;

  $$("[data-abrir]", el).forEach((b) => b.onclick = () => { listaAtual = b.dataset.abrir; abertaNoCelular = true; render(el); });
  $("[data-nova]", el).onclick = () => formLista(null, (id) => { listaAtual = id; abertaNoCelular = true; render(el); });
  $("[data-gerar]", el).onclick = () => gerarDaReposicao(el);
  if (l) ligarLista(el, l);
}

function textoItem(i) {
  const forn = i.fornecedorId ? sync.get("fornecedores", i.fornecedorId)?.nome : "";
  const partes = [];
  if (forn) partes.push("🚚 " + forn);
  if (i.preco) partes.push(`${moeda(i.preco)}/${i.un} · ${moeda(i.preco * i.qtd)}`);
  if (i.produtoId) {
    const p = sync.get("produtos", i.produtoId);
    if (p) partes.push(`estoque: ${num(p.estoque)} ${p.unidadeMedida || ""}`);
  }
  if (i.obs) partes.push("📝 " + i.obs);
  if (i.entradaFeita) partes.push("✓ entrada no estoque");
  return partes.join(" · ");
}

function linhaItem(i) {
  return `<li class="lista-item ${i.feito ? "feito" : ""}" data-item="${i.id}">
    <button class="circulo" data-marcar="${i.id}" aria-label="${i.feito ? "Desmarcar" : "Marcar como comprado"}">${i.feito ? "✓" : ""}</button>
    <div class="info" data-editar="${i.id}"><b>${esc(i.nome)}</b><small>${esc(textoItem(i)) || "&nbsp;"}</small></div>
    <div class="qtd-ctrl">
      <button data-menos="${i.id}" aria-label="Diminuir">−</button>
      <span>${num(i.qtd, 3)} ${esc(i.un || "un")}</span>
      <button data-mais="${i.id}" aria-label="Aumentar">+</button>
    </div>
  </li>`;
}

function corpoLista(l) {
  const itens = l.itens || [];
  const pend = itens.filter((i) => !i.feito);
  const feitos = itens.filter((i) => i.feito);
  const total = itens.reduce((s, i) => s + Number(i.preco || 0) * Number(i.qtd || 0), 0);
  const visiveis = mostrarComprados ? itens : pend;

  let listaHtml;
  if (agrupar) {
    const grupos = {};
    visiveis.forEach((i) => { const k = i.fornecedorId || ""; (grupos[k] = grupos[k] || []).push(i); });
    listaHtml = Object.entries(grupos).sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1)).map(([k, its]) => `
      <h4 style="margin:18px 0 4px;color:var(--cor-lista)">${k ? "🚚 " + esc(sync.get("fornecedores", k)?.nome || "Fornecedor") : "Sem fornecedor"}</h4>
      <ul class="lista-itens">${its.map(linhaItem).join("")}</ul>`).join("");
  } else {
    listaHtml = `<ul class="lista-itens">${[...pend, ...(mostrarComprados ? feitos : [])].map(linhaItem).join("")}</ul>`;
  }

  const nomesProdutos = sync.lista("produtos").filter((p) => p.ativo !== false).map((p) => p.nome);
  return `
    <button class="btn btn-texto btn-voltar-lista" data-voltar>‹ Listas</button>
    <div class="lista-titulo">
      <h2 style="color:${esc(l.cor || CORES[0])}">${esc(l.icone || "🛒")} ${esc(l.nome)}</h2>
      <button class="btn btn-sec btn-pequeno" data-editar-lista>✏️ Editar</button>
    </div>
    <div class="lista-sub">${pend.length} pendente(s) · ${feitos.length} comprado(s)${l.unidadeId ? " · " + esc(estado.nomeUnidade(l.unidadeId)) : ""}${l.criadoPor ? " · criada por " + esc(l.criadoPor) : ""}</div>
    <div class="linha" style="margin-bottom:6px">
      <label class="check pequeno"><input type="checkbox" data-mostrar ${mostrarComprados ? "checked" : ""}> Mostrar comprados</label>
      <label class="check pequeno"><input type="checkbox" data-agrupar ${agrupar ? "checked" : ""}> Agrupar por fornecedor</label>
    </div>
    ${itens.length ? listaHtml : `<p class="muted">Lista vazia. Adicione itens abaixo.</p>`}
    <form class="lista-add" data-add>
      <input data-novo-item list="lista-prod" placeholder="+ Novo item (digite o nome)" autocomplete="off" enterkeyhint="done">
      <datalist id="lista-prod">${nomesProdutos.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <button class="btn btn-pri">Adicionar</button>
    </form>
    <div class="lista-rodape">
      <button class="btn btn-sec" data-imprimir>🖨️ Imprimir lista</button>
      <button class="btn btn-sec" data-entrada ${feitos.some((i) => i.produtoId && !i.entradaFeita) ? "" : "disabled"}>📥 Dar entrada no estoque</button>
      <button class="btn btn-sec" data-limpar ${feitos.length ? "" : "disabled"}>🧹 Remover comprados</button>
      <button class="btn btn-perigo" data-excluir>🗑️ Excluir lista</button>
      ${total ? `<span class="lista-total">Total estimado: ${moeda(total)}</span>` : ""}
    </div>`;
}

function ligarLista(el, l) {
  const salvar = (itens) => { salvarLista({ itens }, l.id); render(el); };
  const acharItem = (id) => (l.itens || []).find((i) => i.id === id);
  const passo = (i) => (i.un && /kg|g|l|ml/i.test(i.un) && Number(i.qtd) % 1 !== 0 ? 0.5 : 1);

  $("[data-voltar]", el).onclick = () => { abertaNoCelular = false; render(el); };
  $("[data-mostrar]", el).onchange = (e) => { mostrarComprados = e.target.checked; render(el); };
  $("[data-agrupar]", el).onchange = (e) => { agrupar = e.target.checked; render(el); };
  $("[data-editar-lista]", el).onclick = () => formLista(l, () => render(el));

  $(".lista-principal", el).addEventListener("click", (e) => {
    const t = e.target.closest("[data-marcar],[data-menos],[data-mais],[data-editar]");
    if (!t) return;
    const itens = (l.itens || []).map((i) => ({ ...i }));
    if (t.dataset.marcar) { const i = itens.find((x) => x.id === t.dataset.marcar); i.feito = !i.feito; return salvar(itens); }
    if (t.dataset.menos) {
      const i = itens.find((x) => x.id === t.dataset.menos);
      const p = passo(i);
      if (Number(i.qtd) - p <= 0) {
        confirmar("Remover item", `Remover "${i.nome}" da lista?`, "Remover").then((ok) => { if (ok) salvar(itens.filter((x) => x.id !== i.id)); });
        return;
      }
      i.qtd = Math.round((Number(i.qtd) - p) * 1000) / 1000; return salvar(itens);
    }
    if (t.dataset.mais) { const i = itens.find((x) => x.id === t.dataset.mais); i.qtd = Math.round((Number(i.qtd) + passo(i)) * 1000) / 1000; return salvar(itens); }
    if (t.dataset.editar) formItem(l, acharItem(t.dataset.editar), () => render(el));
  });

  $("[data-add]", el).onsubmit = (e) => {
    e.preventDefault();
    const nome = $("[data-novo-item]", el).value.trim();
    if (!nome) return;
    const prod = sync.lista("produtos").find((p) => p.ativo !== false && (p.nome || "").toLowerCase() === nome.toLowerCase()
      && (!l.unidadeId || p.unidadeId === l.unidadeId));
    const item = prod ? itemDoProduto(prod, 1)
      : { id: idNovo(), nome, produtoId: "", qtd: 1, un: "un", fornecedorId: "", preco: 0, obs: "", feito: false };
    salvarLista({ itens: juntarItens(l.itens || [], [item]) }, l.id);
    render(el);
    setTimeout(() => $("[data-novo-item]", el)?.focus(), 30);
  };

  $("[data-imprimir]", el).onclick = () => imprimirLista(l);
  $("[data-limpar]", el).onclick = async () => {
    if (await confirmar("Remover comprados", "Tirar da lista todos os itens marcados como comprados?", "Remover")) salvar((l.itens || []).filter((i) => !i.feito));
  };
  $("[data-excluir]", el).onclick = async () => {
    if (!(await confirmar("Excluir lista", `Excluir a lista "${l.nome}"? Esta ação não pode ser desfeita pela tela.`, "Excluir"))) return;
    excluirLista(l.id); listaAtual = null; abertaNoCelular = false; toast("Lista excluída"); render(el);
  };
  $("[data-entrada]", el).onclick = () => darEntrada(l, () => render(el));
}

// ---------------------------------------------------------------- criar / editar lista
function formLista(l, depois) {
  const novo = !l;
  l = l || novaLista("");
  modal({
    titulo: novo ? "Nova lista" : "Editar lista",
    corpo: `<form class="pilha" onsubmit="return false">
      <label class="campo"><span>Nome da lista</span><input name="nome" required value="${esc(l.nome)}" placeholder="Ex.: Feira de sábado"></label>
      <div class="campo"><span>Cor</span><div class="cores">${CORES.map((c) => `<label style="background:${c}"><input type="radio" name="cor" value="${c}" ${c === l.cor ? "checked" : ""}><i></i></label>`).join("")}</div></div>
      <div class="campo"><span>Ícone</span><div class="chips">${ICONES.map((i) => `<label class="chip"><input type="radio" name="icone" value="${i}" ${i === l.icone ? "checked" : ""} style="width:14px;height:14px"> ${i}</label>`).join("")}</div></div>
      <label class="campo"><span>Restaurante / unidade</span><select name="unidadeId">${opcoesUnidade(l.unidadeId, true)}</select></label>
    </form>`,
    aoAbrir: (m) => $("[name=nome]", m).focus(),
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: novo ? "Criar lista" : "Salvar", classe: "btn-pri", onClick: async (m) => {
        const f = $("form", m);
        const nome = f.nome.value.trim();
        if (!nome) throw new Error("Dê um nome para a lista");
        const dados = { nome, cor: f.cor.value || CORES[0], icone: f.icone.value || "🛒", unidadeId: f.unidadeId.value };
        const id = novo ? await salvarLista({ ...l, ...dados }) : (await salvarLista(dados, l.id), l.id);
        depois(id);
      } },
    ],
  });
}

// ---------------------------------------------------------------- editar item
function formItem(l, item, depois) {
  const produtos = sync.lista("produtos").filter((p) => p.ativo !== false).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  modal({
    titulo: "Item da lista",
    corpo: `<form class="form-grade" onsubmit="return false">
      <label class="campo campo-total"><span>Nome</span><input name="nome" value="${esc(item.nome)}"></label>
      <label class="campo campo-total"><span>Produto do estoque (opcional)</span><select name="produtoId"><option value="">— Item avulso —</option>
        ${produtos.map((p) => `<option value="${p.id}" ${p.id === item.produtoId ? "selected" : ""}>${esc(p.nome)} · ${esc(estado.nomeUnidade(p.unidadeId))}</option>`).join("")}</select>
        <small>Ligado a um produto, dá para dar entrada no estoque direto da lista.</small></label>
      <label class="campo"><span>Quantidade</span><input name="qtd" inputmode="decimal" value="${num(item.qtd, 3).replace(/\./g, "")}"></label>
      <label class="campo"><span>Unidade</span><input name="un" value="${esc(item.un || "un")}"></label>
      <label class="campo"><span>Preço unitário (R$)</span><input name="preco" inputmode="decimal" value="${item.preco ? num(item.preco, 2).replace(/\./g, "") : ""}"></label>
      <label class="campo"><span>Fornecedor</span><select name="fornecedorId">${opcoesFornecedor(item.fornecedorId)}</select></label>
      <label class="campo campo-total"><span>Observação</span><input name="obs" value="${esc(item.obs || "")}" placeholder="Marca, tamanho, detalhe…"></label>
      <label class="check campo-total"><input type="checkbox" name="feito" ${item.feito ? "checked" : ""}> Comprado</label>
    </form>`,
    aoAbrir: (m) => {
      const sel = $("[name=produtoId]", m);
      sel.onchange = () => {
        const p = sync.get("produtos", sel.value); if (!p) return;
        const f = $("form", m);
        f.nome.value = p.nome; f.un.value = p.unidadeMedida || "un";
        if (p.custo && !f.preco.value) f.preco.value = num(p.custo, 2).replace(/\./g, "");
        if (p.fornecedorId) f.fornecedorId.value = p.fornecedorId;
      };
    },
    acoes: [
      { texto: "🗑️ Remover", classe: "btn-perigo", onClick: () => {
        salvarLista({ itens: (l.itens || []).filter((i) => i.id !== item.id) }, l.id); depois();
      } },
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: (m) => {
        const f = $("form", m);
        const novo = {
          ...item, nome: f.nome.value.trim() || item.nome, produtoId: f.produtoId.value, qtd: paraNumero(f.qtd.value) || 1,
          un: f.un.value.trim() || "un", preco: paraNumero(f.preco.value), fornecedorId: f.fornecedorId.value,
          obs: f.obs.value.trim(), feito: f.feito.checked,
        };
        salvarLista({ itens: (l.itens || []).map((i) => (i.id === item.id ? novo : i)) }, l.id); depois();
      } },
    ],
  });
}

// ---------------------------------------------------------------- entrada no estoque
function darEntrada(l, depois) {
  const itens = (l.itens || []).filter((i) => i.feito && i.produtoId && !i.entradaFeita && sync.get("produtos", i.produtoId));
  modal({
    titulo: "Dar entrada no estoque", largo: true,
    corpo: `<p class="muted" style="margin-top:0">Confira as quantidades e preços que chegaram. Itens desmarcados não entram.</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th></th><th>Produto</th><th class="num">Quantidade</th><th class="num">Custo unit. (R$)</th></tr></thead>
        <tbody>${itens.map((i) => `<tr data-i="${i.id}">
          <td><input type="checkbox" checked></td><td>${esc(i.nome)}<div class="muted pequeno">${esc(estado.nomeUnidade(sync.get("produtos", i.produtoId).unidadeId))}</div></td>
          <td class="num"><input data-q inputmode="decimal" value="${num(i.qtd, 3).replace(/\./g, "")}" style="width:100px"> ${esc(i.un)}</td>
          <td class="num"><input data-c inputmode="decimal" value="${i.preco ? num(i.preco, 2).replace(/\./g, "") : ""}" style="width:110px"></td></tr>`).join("")}</tbody>
      </table></div>`,
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Registrar entradas", classe: "btn-pri", onClick: (m) => {
        const feitos = new Set();
        $$("tr[data-i]", m).forEach((tr) => {
          if (!$("input[type=checkbox]", tr).checked) return;
          const i = itens.find((x) => x.id === tr.dataset.i);
          const q = paraNumero($("[data-q]", tr).value);
          if (!(q > 0)) return;
          registrarEntrada({
            produto: sync.get("produtos", i.produtoId), quantidade: q, custoUnitario: paraNumero($("[data-c]", tr).value),
            fornecedorId: i.fornecedorId, dataMs: Date.now(), observacao: `Lista: ${l.nome}`,
          });
          feitos.add(i.id);
        });
        if (!feitos.size) throw new Error("Nenhum item selecionado");
        salvarLista({ itens: (l.itens || []).map((i) => (feitos.has(i.id) ? { ...i, entradaFeita: true } : i)) }, l.id);
        toast(`${feitos.size} entrada(s) registrada(s) no estoque`);
        depois();
      } },
    ],
  });
}

// ---------------------------------------------------------------- gerar da reposição
function gerarDaReposicao(el) {
  const prevs = previsoesDaUnidade(sync.lista("produtos"), sync.lista("consumoDiario"), estado.config(), estado.unidadeId)
    .filter((p) => ["sem", "comprar", "baixo", "breve3"].includes(p.status));
  if (!prevs.length) return toast("Nada precisa de compra agora 🎉");
  const itens = prevs.map((p) => itemDoProduto(p.produto, p.sugerida || p.produto.compraMinima || 1));
  adicionarAListas(itens, "Reposição " + data(Date.now()));
}

// ---------------------------------------------------------------- impressão
function imprimirLista(l) {
  const itens = l.itens || [];
  const grupos = {};
  itens.forEach((i) => { const k = i.fornecedorId || ""; (grupos[k] = grupos[k] || []).push(i); });
  const total = itens.reduce((s, i) => s + Number(i.preco || 0) * Number(i.qtd || 0), 0);
  const emp = sync.empresa() || {};
  const html = `
    <h1>${esc(l.nome)}</h1>
    <div class="sub">${esc(emp.nome || "")}${l.unidadeId ? " · " + esc(estado.nomeUnidade(l.unidadeId)) : ""} · Impresso em ${esc(dataHora(Date.now()))} · ${itens.length} item(ns)</div>
    ${Object.entries(grupos).map(([k, its]) => `
      <h3 style="margin:14pt 0 4pt">${k ? "Fornecedor: " + esc(sync.get("fornecedores", k)?.nome || "") + (sync.get("fornecedores", k)?.telefone ? " — " + esc(sync.get("fornecedores", k).telefone) : "") : "Sem fornecedor"}</h3>
      <table><thead><tr><th style="width:18pt"></th><th>Item</th><th class="num">Qtd</th><th>Obs.</th><th class="num">Preço un.</th><th class="num">Subtotal</th></tr></thead>
      <tbody>${its.map((i) => `<tr class="${i.feito ? "feito" : ""}"><td><span class="caixa"></span></td><td>${esc(i.nome)}</td>
        <td class="num">${num(i.qtd, 3)} ${esc(i.un)}</td><td>${esc(i.obs || "")}</td>
        <td class="num">${i.preco ? moeda(i.preco) : ""}</td><td class="num">${i.preco ? moeda(i.preco * i.qtd) : ""}</td></tr>`).join("")}</tbody></table>`).join("")}
    ${total ? `<p style="text-align:right;font-weight:bold;margin-top:12pt">Total estimado: ${moeda(total)}</p>` : ""}`;
  imprimir(html, l.nome);
}

export default { render, semAutoRefresh: true, aoMudar: ["listasCompras"] };
