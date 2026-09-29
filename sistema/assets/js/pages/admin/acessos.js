// =====================================================================
// ACESSOS E PERMISSÕES — logins do sistema (criar, editar, desativar)
//   Administrador: acesso total
//   Gerente: estoque, compras, relatórios, funcionários e fornecedores
//   Tablet / Operação: SOMENTE a tela de retirada (tela cheia)
// Lista carregada só ao abrir esta tela (poucas leituras).
// =====================================================================
import { estado } from "../../core/estado.js";
import { PAPEIS, criarAcesso, recuperarSenha } from "../../core/auth.js";
import { listarAcessos, atualizarAcesso } from "../../core/db.js";
import { $, $$, esc, modal, toast, confirmar, dataHora } from "../../core/util.js";
import { vazio } from "./componentes.js";

const DESCRICAO = {
  admin: "Acesso total, inclusive unidades, acessos e configurações.",
  gerente: "Estoque, compras, listas, relatórios, funcionários e fornecedores.",
  funcionario: "Somente a tela de RETIRADA DE ESTOQUE, em tela cheia. Use no tablet.",
};

let cache = null;

function render(el) {
  if (cache) desenhar(el, cache);
  else el.innerHTML = `<div class="card"><div class="giro"></div></div>`;
  listarAcessos().then((lista) => { cache = lista; desenhar(el, lista); }).catch((e) => {
    el.innerHTML = `<div class="card">${vazio("⚠️", "Não foi possível carregar os acessos. " + esc(e.message))}</div>`;
  });
}

function desenhar(el, lista) {
  lista.sort((a, b) => (a.papel === "admin" ? -1 : 0) - (b.papel === "admin" ? -1 : 0) || (a.nome || "").localeCompare(b.nome || ""));
  el.innerHTML = `
    <div class="grade grade-kpi" style="margin-bottom:16px">${Object.entries(PAPEIS).map(([k, t]) => `
      <div class="card"><b>${t}</b><p class="muted pequeno" style="margin:6px 0 0">${DESCRICAO[k]}</p></div>`).join("")}</div>
    <div class="filtros"><p class="muted cresce" style="margin:0">Toque em um acesso para editar.</p><button class="btn btn-pri" data-novo>+ Novo acesso</button></div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>E-mail (login)</th><th>Permissão</th><th>Unidades</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map((u) => `<tr class="clicavel" data-id="${u.id}">
        <td><b>${esc(u.nome)}</b>${u.id === estado.usuario.uid ? ' <span class="selo selo-azul">Você</span>' : ""}</td>
        <td>${esc(u.email)}</td><td>${PAPEIS[u.papel] || esc(u.papel)}</td>
        <td>${u.unidades?.length ? u.unidades.map((x) => esc(estado.nomeUnidade(x))).join(", ") : "Todas"}</td>
        <td>${u.ativo === false ? '<span class="selo selo-cinza">Desativado</span>' : '<span class="selo selo-verde">Ativo</span>'}</td>
        <td class="num"><button class="btn btn-pequeno btn-sec" data-editar="${u.id}">✏️ Editar</button></td></tr>`).join("")
        || `<tr><td colspan="6">${vazio("🔐", "Nenhum acesso.")}</td></tr>`}</tbody>
    </table></div>
    <p class="nota-estimativa">E-mail e senha de login são guardados pelo Firebase: por segurança, só dá para trocar a senha pelo link "Redefinir senha", que chega no e-mail do acesso.</p>`;

  const recarregar = () => { cache = null; render(el); };
  $("[data-novo]", el).onclick = () => form(null, recarregar);
  el.onclick = (e) => {
    const alvo = e.target.closest("[data-editar]") || e.target.closest("tr[data-id]");
    if (!alvo) return;
    const id = alvo.dataset.editar || alvo.dataset.id;
    const u = lista.find((x) => x.id === id);
    if (u) form(u, recarregar);
  };
}

function form(u, depois) {
  const novo = !u;
  const eu = !novo && u.id === estado.usuario.uid;
  u = u || { papel: "funcionario", ativo: true, unidades: [] };
  const unidades = estado.unidadesPermitidas();

  modal({
    titulo: novo ? "Novo acesso" : `Editar acesso — ${u.nome}`,
    corpo: `<form class="form-grade" onsubmit="return false">
      <label class="campo campo-total"><span>Nome</span><input name="nome" required value="${esc(u.nome || "")}" placeholder="Ex.: Tablet cozinha — Unidade 01"></label>
      ${novo ? `<label class="campo"><span>E-mail (login)</span><input name="email" type="email" required autocomplete="off"></label>
        <label class="campo"><span>Senha inicial</span><input name="senha" type="text" minlength="6" required autocomplete="off"><small>Mínimo 6 caracteres</small></label>` :
        `<div class="campo campo-total"><span>E-mail (login)</span><input disabled value="${esc(u.email)}"></div>`}
      <label class="campo campo-total"><span>Permissão</span><select name="papel" ${eu ? "disabled" : ""}>${Object.entries(PAPEIS).map(([k, t]) => `<option value="${k}" ${k === u.papel ? "selected" : ""}>${t}</option>`).join("")}</select>
        <small data-desc>${DESCRICAO[u.papel] || ""}</small>${eu ? "<small>Você não pode alterar a própria permissão.</small>" : ""}</label>
      <div class="campo campo-total"><span data-rot-unid>Unidades que pode acessar</span>
        <div class="chips">${unidades.map((x) => `<label class="chip"><input type="checkbox" name="u_${x.id}" ${u.unidades?.includes(x.id) ? "checked" : ""} style="width:16px;height:16px;vertical-align:middle"> ${esc(x.nome)}</label>`).join("")}</div>
        <small data-dica-unid></small></div>
      ${novo ? "" : `<label class="check campo-total"><input type="checkbox" name="ativo" ${u.ativo !== false ? "checked" : ""} ${eu ? "disabled" : ""}> Acesso ativo ${eu ? "(você não pode desativar a si mesmo)" : "— desmarque para bloquear o login"}</label>`}
      ${novo ? "" : `<div class="campo-total linha"><button type="button" class="btn btn-sec btn-pequeno" data-reset>✉️ Enviar link para redefinir senha</button>
        <span class="muted pequeno">${u.criadoEm?.toMillis ? "Criado em " + dataHora(u.criadoEm.toMillis()) : ""}</span></div>`}
    </form>`,
    aoAbrir: (m) => {
      const sel = $("[name=papel]", m);
      const atualizar = () => {
        $("[data-desc]", m).textContent = DESCRICAO[sel.value] || "";
        const tablet = sel.value === "funcionario";
        $("[data-rot-unid]", m).textContent = tablet ? "Unidade deste tablet" : "Unidades que pode acessar";
        $("[data-dica-unid]", m).textContent = tablet
          ? "Marque UMA unidade: o tablet já abre nela, sem perguntar."
          : "Nenhuma marcada = todas as unidades.";
      };
      sel.onchange = atualizar; atualizar();
      const reset = $("[data-reset]", m);
      if (reset) reset.onclick = async () => {
        try { await recuperarSenha(u.email); toast(`Link enviado para ${u.email}`); }
        catch (e) { toast(e.message, "erro"); }
      };
    },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: novo ? "Criar acesso" : "Salvar alterações", classe: "btn-pri", onClick: async (m) => {
        const f = $("form", m);
        const sel = $$("input[name^=u_]", f).filter((i) => i.checked).map((i) => i.name.slice(2));
        const nome = f.nome.value.trim();
        if (!nome) throw new Error("Informe o nome");
        const papel = eu ? u.papel : f.papel.value;
        if (papel === "funcionario" && sel.length > 1 && !(await confirmar("Mais de uma unidade", "Um tablet normalmente fica em uma unidade só. Salvar mesmo assim? (o tablet vai perguntar a unidade ao abrir)", "Salvar"))) return false;
        if (novo) {
          await criarAcesso({ empresaId: estado.perfil.empresaId, nome, email: f.email.value.trim(), senha: f.senha.value, papel, unidades: sel });
          toast("Acesso criado");
        } else {
          const dados = { nome, unidades: sel };
          if (!eu) { dados.papel = papel; dados.ativo = f.ativo.checked; }
          else { dados.papel = "admin"; dados.ativo = true; }
          await atualizarAcesso(u.id, dados);
          toast("Acesso atualizado");
        }
        depois();
      } },
    ],
  });
}

export default { render, semAutoRefresh: true };
