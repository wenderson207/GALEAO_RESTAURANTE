// RESTAURANTES / UNIDADES — dados completos (CNPJ, endereço pelo CEP, contato, responsável)
import { sync } from "../../core/sync.js";
import { salvarUnidade } from "../../core/db.js";
import {
  $, esc, num, modal, toast, lerForm, ligarMascaras, ligarCep, ligarCnpj, camposEndereco, enderecoTexto,
} from "../../core/util.js";
import { vazio } from "./componentes.js";

function render(el) {
  const lista = sync.lista("unidades").sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const produtos = sync.lista("produtos").filter((p) => p.ativo !== false);
  const funcionarios = sync.lista("funcionarios").filter((f) => f.ativo !== false);

  el.innerHTML = `
    <div class="filtros"><p class="muted cresce" style="margin:0">Cada produto, retirada e compra fica vinculado a uma unidade. Use o seletor "Restaurante" no topo para filtrar.</p>
      <button class="btn btn-pri" data-novo>+ Nova unidade</button></div>
    ${lista.length ? `<div class="grade grade-2">${lista.map((u) => {
      const ps = produtos.filter((p) => p.unidadeId === u.id);
      const baixos = ps.filter((p) => Number(p.estoque || 0) <= Number(p.estoqueMinimo || 0)).length;
      const fs = funcionarios.filter((f) => !f.unidades?.length || f.unidades.includes(u.id)).length;
      return `<div class="card" style="cursor:pointer" data-id="${u.id}">
        <div class="linha entre"><h3>🏪 ${esc(u.nome)}</h3>${u.ativo === false ? '<span class="selo selo-cinza">Inativa</span>' : '<span class="selo selo-verde">Ativa</span>'}</div>
        ${u.cnpj ? `<div class="muted pequeno" style="margin-top:4px">CNPJ ${esc(u.cnpj)}${u.razaoSocial ? " · " + esc(u.razaoSocial) : ""}</div>` : ""}
        <p class="muted pequeno" style="margin:6px 0">📍 ${esc(enderecoTexto(u) || "Sem endereço")}</p>
        <p class="pequeno" style="margin:0 0 10px">${u.responsavel ? `👤 <b>${esc(u.responsavel)}</b>` : "👤 Sem responsável"}${u.telefone ? ` · 📞 ${esc(u.telefone)}` : ""}</p>
        <div class="linha pequeno"><span><b>${num(ps.length)}</b> produtos</span><span><b>${fs}</b> funcionários</span><span class="${baixos ? "" : "muted"}"><b>${baixos}</b> com estoque baixo</span></div>
      </div>`;
    }).join("")}</div>` : `<div class="card">${vazio("🏪", "Nenhuma unidade cadastrada.")}</div>`}`;

  $("[data-novo]", el).onclick = () => form(null);
  el.onclick = (e) => { const c = e.target.closest("[data-id]"); if (c) form(sync.get("unidades", c.dataset.id)); };
}

function form(u) {
  const novo = !u;
  u = u || { ativo: true };
  const v = (k) => esc(u[k] ?? "");
  modal({
    titulo: novo ? "Nova unidade" : `Editar — ${u.nome}`, largo: true,
    corpo: `<form class="form-grade" onsubmit="return false">
      <div class="form-secao">Identificação</div>
      <label class="campo campo-largo"><span>Nome da unidade *</span><input name="nome" required value="${v("nome")}" placeholder="Ex.: Unidade 02 — Centro"></label>
      <label class="campo campo-largo"><span>CNPJ</span><input name="cnpj" data-mascara="cnpj" value="${v("cnpj")}" placeholder="00.000.000/0000-00"></label>
      <label class="campo campo-largo"><span>Razão social</span><input name="razaoSocial" value="${v("razaoSocial")}"></label>
      <label class="campo"><span>Nome fantasia</span><input name="nomeFantasia" value="${v("nomeFantasia")}"></label>
      <label class="campo"><span>Inscrição estadual</span><input name="ie" value="${v("ie")}"></label>

      <div class="form-secao">Contato</div>
      <label class="campo"><span>Telefone</span><input name="telefone" data-mascara="telefone" value="${v("telefone")}"></label>
      <label class="campo"><span>WhatsApp</span><input name="whatsapp" data-mascara="telefone" value="${v("whatsapp")}"></label>
      <label class="campo"><span>E-mail</span><input name="email" type="email" value="${v("email")}"></label>

      <div class="form-secao">Responsável</div>
      <label class="campo"><span>Nome do responsável</span><input name="responsavel" value="${v("responsavel")}"></label>
      <label class="campo"><span>Cargo</span><input name="responsavelCargo" value="${v("responsavelCargo")}" placeholder="Ex.: Gerente"></label>
      <label class="campo"><span>Telefone do responsável</span><input name="responsavelTelefone" data-mascara="telefone" value="${v("responsavelTelefone")}"></label>

      ${camposEndereco(u)}

      <div class="form-secao">Funcionamento</div>
      <label class="campo campo-largo"><span>Horário de funcionamento</span><input name="horario" value="${v("horario")}" placeholder="Ex.: Seg a Sáb, 11h às 23h"></label>
      <label class="campo campo-total"><span>Observações</span><textarea name="obs" rows="2">${v("obs")}</textarea></label>
      <label class="check campo-total"><input type="checkbox" name="ativo" ${u.ativo !== false ? "checked" : ""}> Unidade ativa</label>
    </form>`,
    aoAbrir: (m) => { const f = $("form", m); ligarMascaras(f); ligarCep(f); ligarCnpj(f); },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: (m) => {
        const d = lerForm($("form", m));
        if (!d.nome) throw new Error("Informe o nome da unidade");
        d.uf = (d.uf || "").toUpperCase();
        salvarUnidade(d, novo ? null : u.id);
        toast("Unidade salva");
      } },
    ],
  });
}

export default { render };
