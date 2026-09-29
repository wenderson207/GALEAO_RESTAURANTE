// =====================================================================
// ACESSOS E PERMISSÕES — logins do sistema
//   Administrador: acesso total
//   Gerente: estoque, compras, relatórios e funcionários
//   Tablet / Operação: somente retirada (um login por tablet ou por unidade)
// Lista carregada só ao abrir esta tela (poucas leituras).
// =====================================================================
import { estado } from "../../core/estado.js";
import { PAPEIS, criarAcesso } from "../../core/auth.js";
import { listarAcessos, atualizarAcesso } from "../../core/db.js";
import { $, $$, esc, modal, toast } from "../../core/util.js";
import { vazio } from "./componentes.js";

const DESCRICAO = {
  admin: "Acesso total, inclusive unidades, acessos e configurações.",
  gerente: "Estoque, compras, relatórios, funcionários e fornecedores.",
  funcionario: "Somente a tela de retirada (use no tablet da cozinha).",
};

function render(el) {
  el.innerHTML = `<div class="card"><div class="giro"></div></div>`;
  listarAcessos().then((lista) => desenhar(el, lista)).catch((e) => {
    el.innerHTML = `<div class="card">${vazio("⚠️", "Não foi possível carregar os acessos. " + esc(e.message))}</div>`;
  });
}

function desenhar(el, lista) {
  lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  el.innerHTML = `
    <div class="grade grade-kpi" style="margin-bottom:16px">${Object.entries(PAPEIS).map(([k, t]) => `
      <div class="card"><b>${t}</b><p class="muted pequeno" style="margin:6px 0 0">${DESCRICAO[k]}</p></div>`).join("")}</div>
    <div class="filtros"><span class="cresce"></span><button class="btn btn-pri" data-novo>+ Novo acesso</button></div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>E-mail (login)</th><th>Permissão</th><th>Unidades</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map((u) => `<tr>
        <td><b>${esc(u.nome)}</b>${u.id === estado.usuario.uid ? ' <span class="selo selo-azul">Você</span>' : ""}</td>
        <td>${esc(u.email)}</td><td>${PAPEIS[u.papel] || u.papel}</td>
        <td>${u.unidades?.length ? u.unidades.map((x) => esc(estado.nomeUnidade(x))).join(", ") : "Todas"}</td>
        <td>${u.ativo === false ? '<span class="selo selo-cinza">Desativado</span>' : '<span class="selo selo-verde">Ativo</span>'}</td>
        <td class="num">${u.id === estado.usuario.uid ? "" : `<button class="btn btn-pequeno btn-sec" data-id="${u.id}">Editar</button>`}</td></tr>`).join("")
        || `<tr><td colspan="6">${vazio("🔐", "Nenhum acesso.")}</td></tr>`}</tbody>
    </table></div>
    <p class="nota-estimativa">Para trocar a senha de alguém, use "Esqueci a senha" na tela de login com o e-mail da pessoa.</p>`;

  $("[data-novo]", el).onclick = () => form(null, () => render(el));
  el.onclick = (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    form(lista.find((u) => u.id === b.dataset.id), () => render(el));
  };
}

function form(u, depois) {
  const novo = !u;
  u = u || { papel: "funcionario", ativo: true, unidades: [] };
  const unidades = estado.unidadesPermitidas();
  modal({
    titulo: novo ? "Novo acesso" : `Editar — ${u.nome}`,
    corpo: `<form class="form-grade" onsubmit="return false">
      <label class="campo"><span>Nome</span><input name="nome" required value="${esc(u.nome || "")}" placeholder="Ex.: Tablet cozinha — Unidade 01"></label>
      ${novo ? `<label class="campo"><span>E-mail (login)</span><input name="email" type="email" required></label>
        <label class="campo"><span>Senha inicial</span><input name="senha" type="text" minlength="6" required><small>Mínimo 6 caracteres</small></label>` :
        `<div class="campo"><span>E-mail (login)</span><input disabled value="${esc(u.email)}"></div>`}
      <label class="campo"><span>Permissão</span><select name="papel">${Object.entries(PAPEIS).map(([k, t]) => `<option value="${k}" ${k === u.papel ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <div class="campo" style="grid-column:1/-1"><span>Unidades que pode acessar</span>
        <div class="chips">${unidades.map((x) => `<label class="chip"><input type="checkbox" name="u_${x.id}" ${u.unidades?.includes(x.id) ? "checked" : ""} style="width:16px;height:16px;vertical-align:middle"> ${esc(x.nome)}</label>`).join("")}</div>
        <small>Nenhuma marcada = todas as unidades.</small></div>
      ${novo ? "" : `<label class="check"><input type="checkbox" name="ativo" ${u.ativo !== false ? "checked" : ""}> Acesso ativo</label>`}
    </form>`,
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: novo ? "Criar acesso" : "Salvar", classe: "btn-pri", onClick: async (m) => {
        const f = $("form", m);
        const sel = $$("input[name^=u_]", f).filter((i) => i.checked).map((i) => i.name.slice(2));
        if (!f.nome.value.trim()) throw new Error("Informe o nome");
        if (novo) {
          await criarAcesso({ empresaId: estado.perfil.empresaId, nome: f.nome.value.trim(), email: f.email.value.trim(), senha: f.senha.value, papel: f.papel.value, unidades: sel });
          toast("Acesso criado");
        } else {
          await atualizarAcesso(u.id, { nome: f.nome.value.trim(), papel: f.papel.value, unidades: sel, ativo: f.ativo.checked });
          toast("Acesso atualizado");
        }
        depois();
      } },
    ],
  });
}

export default { render, semAutoRefresh: true };
