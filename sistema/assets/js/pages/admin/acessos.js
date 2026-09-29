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
import { $, $$, esc, modal, toast, confirmar, dataHora, data } from "../../core/util.js";
import { criarConvite, listarConvites, cancelarConvite, linkConvite, situacaoConvite } from "../../core/convites.js";
import { vazio } from "./componentes.js";

const DESCRICAO = {
  admin: "Acesso total, inclusive unidades, acessos e configurações.",
  gerente: "Estoque, compras, listas, relatórios, funcionários e fornecedores.",
  funcionario: "Somente a tela de RETIRADA DE ESTOQUE, em tela cheia. Use no tablet.",
};

let cache = null;
let cacheConvites = [];

function render(el) {
  if (cache) desenhar(el, cache);
  else el.innerHTML = `<div class="card"><div class="giro"></div></div>`;
  Promise.all([listarAcessos(), listarConvites().catch(() => [])]).then(([lista, convites]) => {
    cache = lista; cacheConvites = convites; desenhar(el, lista);
  }).catch((e) => {
    el.innerHTML = `<div class="card">${vazio("⚠️", "Não foi possível carregar os acessos. " + esc(e.message))}</div>`;
  });
}

function blocoConvites() {
  const ms = (t) => (t?.toMillis ? t.toMillis() : t);
  const pend = cacheConvites.filter((c) => !situacaoConvite(c)).sort((a, b) => (ms(b.criadoEm) || 0) - (ms(a.criadoEm) || 0));
  if (!pend.length) return "";
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-topo"><h3>✉️ Convites aguardando (${pend.length})</h3><span class="muted pequeno">Vencem em 7 dias</span></div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Unidade</th><th>Vence</th><th></th></tr></thead>
        <tbody>${pend.map((c) => `<tr>
          <td><b>${esc(c.nome)}</b></td><td>${esc(c.email)}</td><td>${PAPEIS[c.papel] || esc(c.papel)}</td>
          <td>${esc((c.unidadesNomes || []).join(", ") || "Todas")}</td><td>${data(ms(c.expiraEm))}</td>
          <td class="num" style="white-space:nowrap"><button class="btn btn-pequeno btn-sec" data-link-convite="${c.id}">🔗 Enviar link</button>
            <button class="btn btn-pequeno btn-texto" data-cancelar-convite="${c.id}">Cancelar</button></td></tr>`).join("")}</tbody>
      </table></div>
    </div>`;
}

export function mostrarLinkConvite(c) {
  const link = linkConvite(c.id);
  const texto = `Olá, ${c.nome.split(" ")[0]}! Você foi convidado(a) para o sistema de estoque ${c.empresaNome ? "da " + c.empresaNome : ""}. Crie sua senha por este link: ${link}`;
  modal({
    titulo: "Convite criado ✉️",
    corpo: `<div class="pilha">
      <p style="margin:0">Envie este link para <b>${esc(c.nome)}</b>. Ao abrir, a pessoa só cria a senha e já entra como <b>${PAPEIS[c.papel]}</b>${c.unidadesNomes?.length ? ` em <b>${esc(c.unidadesNomes.join(", "))}</b>` : ""}.</p>
      <input readonly value="${esc(link)}" data-link style="font-size:13px">
      <div class="linha">
        <button class="btn btn-pri" data-copiar>📋 Copiar link</button>
        <a class="btn btn-sec" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">💬 WhatsApp</a>
        <a class="btn btn-sec" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Convite — sistema de estoque")}&body=${encodeURIComponent(texto)}">✉️ E-mail</a>
      </div>
      <p class="muted pequeno" style="margin:0">Sem o link, a pessoa também pode entrar em <b>Primeiro acesso → Fui convidado</b> usando o e-mail <b>${esc(c.email)}</b> (vai precisar confirmar o e-mail). O convite vale 7 dias.</p>
    </div>`,
    aoAbrir: (m) => {
      $("[data-copiar]", m).onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast("Link copiado"); }
        catch { const i = $("[data-link]", m); i.select(); document.execCommand("copy"); toast("Link copiado"); }
      };
    },
    acoes: [{ texto: "Fechar", classe: "btn-sec" }],
  });
}

function desenhar(el, lista) {
  lista.sort((a, b) => (a.papel === "admin" ? -1 : 0) - (b.papel === "admin" ? -1 : 0) || (a.nome || "").localeCompare(b.nome || ""));
  el.innerHTML = `
    <div class="grade grade-kpi" style="margin-bottom:16px">${Object.entries(PAPEIS).map(([k, t]) => `
      <div class="card"><b>${t}</b><p class="muted pequeno" style="margin:6px 0 0">${DESCRICAO[k]}</p></div>`).join("")}</div>
    <div class="filtros"><p class="muted cresce" style="margin:0">Toque em um acesso para editar.</p>
      <button class="btn btn-pri" data-convidar>✉️ Convidar pessoa</button>
      <button class="btn btn-sec" data-novo>🔑 Criar login direto</button></div>
    ${blocoConvites()}
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
  $("[data-convidar]", el).onclick = () => formConvite(lista, recarregar);
  el.onclick = async (e) => {
    const lk = e.target.closest("[data-link-convite]");
    if (lk) return mostrarLinkConvite(cacheConvites.find((c) => c.id === lk.dataset.linkConvite));
    const cc = e.target.closest("[data-cancelar-convite]");
    if (cc) {
      if (!(await confirmar("Cancelar convite", "O link deixará de funcionar. Continuar?", "Cancelar convite"))) return;
      try { await cancelarConvite(cc.dataset.cancelarConvite); toast("Convite cancelado"); recarregar(); } catch (err) { toast(err.message, "erro"); }
      return;
    }
    const alvo = e.target.closest("[data-editar]") || e.target.closest("tr[data-id]");
    if (!alvo) return;
    const id = alvo.dataset.editar || alvo.dataset.id;
    const u = lista.find((x) => x.id === id);
    if (u) form(u, recarregar);
  };
}

// Pré-cadastro: o admin define nome, e-mail, permissão e unidade; a pessoa só cria a senha
function formConvite(acessos, depois) {
  const unidades = estado.unidadesPermitidas();
  modal({
    titulo: "Convidar pessoa",
    corpo: `<form class="form-grade" onsubmit="return false">
      <p class="muted campo-total" style="margin:0">A pessoa recebe um link, cria a própria senha e já entra na unidade e com a permissão que você escolher.</p>
      <label class="campo campo-total"><span>Nome</span><input name="nome" required placeholder="Ex.: Maria Souza"></label>
      <label class="campo campo-total"><span>E-mail da pessoa</span><input name="email" type="email" required autocomplete="off" placeholder="maria@gmail.com"><small>Será o login dela.</small></label>
      <label class="campo campo-total"><span>Permissão</span><select name="papel">
        <option value="gerente">${PAPEIS.gerente}</option><option value="funcionario">${PAPEIS.funcionario}</option><option value="admin">${PAPEIS.admin}</option></select>
        <small data-desc>${DESCRICAO.gerente}</small></label>
      <div class="campo campo-total"><span>Unidade(s)</span>
        <div class="chips">${unidades.map((x, i) => `<label class="chip"><input type="checkbox" name="u_${x.id}" ${unidades.length === 1 || (estado.unidadeId === x.id) ? "checked" : ""} style="width:16px;height:16px;vertical-align:middle"> ${esc(x.nome)}</label>`).join("")}</div>
        <small>Nenhuma marcada = todas as unidades.</small></div>
    </form>`,
    aoAbrir: (m) => { const s = $("[name=papel]", m); s.onchange = () => { $("[data-desc]", m).textContent = DESCRICAO[s.value]; }; },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Criar convite", classe: "btn-pri", onClick: async (m) => {
        const f = $("form", m);
        const nome = f.nome.value.trim(), email = f.email.value.trim().toLowerCase();
        if (!nome) throw new Error("Informe o nome");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido");
        if (acessos.some((a) => (a.email || "").toLowerCase() === email)) throw new Error("Este e-mail já tem acesso nesta empresa");
        if (cacheConvites.some((c) => c.email === email && !situacaoConvite(c))) throw new Error("Já existe um convite aguardando para este e-mail");
        const c = await criarConvite({ nome, email, papel: f.papel.value, unidades: $$("input[name^=u_]", f).filter((i) => i.checked).map((i) => i.name.slice(2)) });
        mostrarLinkConvite(c);
        depois();
      } },
    ],
  });
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
