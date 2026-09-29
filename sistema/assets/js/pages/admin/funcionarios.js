// =====================================================================
// FUNCIONÁRIOS — quem aparece no tablet (foto, nome, PIN, cargo, unidade)
// O PIN é guardado só como hash (PBKDF2 + sal), nunca em texto.
// =====================================================================
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { salvarFuncionario } from "../../core/db.js";
import { $, $$, esc, modal, toast, lerForm, comprimirPorTipo, IMAGENS, gerarHashPin, avatar, dataHora } from "../../core/util.js";
import { vazio } from "./componentes.js";

let mostrarInativos = false;

function render(el, { unidadeId }) {
  const lista = sync.lista("funcionarios")
    .filter((f) => (mostrarInativos || f.ativo !== false) && (!unidadeId || !f.unidades?.length || f.unidades.includes(unidadeId)))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  const ultimaRetirada = {};
  sync.lista("movimentacoes").forEach((m) => {
    if (m.tipo === "saida" && m.funcionarioId && (m.dataMs || 0) > (ultimaRetirada[m.funcionarioId] || 0)) ultimaRetirada[m.funcionarioId] = m.dataMs;
  });

  el.innerHTML = `
    <div class="filtros">
      <p class="muted cresce" style="margin:0">Funcionários aparecem no tablet para identificar quem retirou cada produto.</p>
      <label class="check"><input type="checkbox" data-inativos ${mostrarInativos ? "checked" : ""}> Mostrar inativos</label>
      <button class="btn btn-pri" data-novo>+ Novo funcionário</button>
    </div>
    ${lista.length ? `<div class="grade" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${lista.map((f) => `
      <div class="card linha" style="cursor:pointer" data-id="${f.id}">
        ${avatar(f, "")}
        <div class="cresce"><b>${esc(f.nome)}</b> ${f.ativo === false ? '<span class="selo selo-cinza">Inativo</span>' : ""}
          <div class="muted pequeno">${esc(f.cargo || "—")} · ${f.unidades?.length ? f.unidades.map((u) => esc(estado.nomeUnidade(u))).join(", ") : "Todas as unidades"}</div>
          <div class="muted pequeno">${f.pinHash ? "🔒 PIN cadastrado" : "⚠️ Sem PIN"} · Última retirada: ${ultimaRetirada[f.id] ? dataHora(ultimaRetirada[f.id]) : "—"}</div>
        </div>
      </div>`).join("")}</div>` : `<div class="card">${vazio("👥", "Nenhum funcionário cadastrado.")}</div>`}`;

  $("[data-inativos]", el).onchange = (e) => { mostrarInativos = e.target.checked; render(el, { unidadeId }); };
  $("[data-novo]", el).onclick = () => formFuncionario(null, unidadeId);
  el.onclick = (e) => { const c = e.target.closest("[data-id]"); if (c) formFuncionario(sync.get("funcionarios", c.dataset.id)); };
}

function formFuncionario(f, unidadePadrao) {
  const novo = !f;
  f = f || { ativo: true, unidades: unidadePadrao ? [unidadePadrao] : [] };
  let foto = f.foto || "";
  const unidades = estado.unidadesPermitidas();

  modal({
    titulo: novo ? "Novo funcionário" : `Editar — ${f.nome}`,
    corpo: `
    <form class="form-grade" onsubmit="return false">
      <div class="campo" style="grid-column:1/-1"><span>Foto</span>
        <div class="foto-upload"><div class="preview" data-preview style="border-radius:50%">${foto ? `<img src="${esc(foto)}" alt="">` : "🙂"}</div>
        <label class="btn btn-sec">Escolher foto<input type="file" accept="image/*" capture="user" data-foto hidden></label></div>
        <small>${IMAGENS.funcionario.dica}</small></div>
      <label class="campo"><span>Nome</span><input name="nome" required value="${esc(f.nome || "")}"></label>
      <label class="campo"><span>Cargo</span><input name="cargo" value="${esc(f.cargo || "")}" placeholder="Ex.: Cozinheiro"></label>
      <label class="campo"><span>${novo ? "PIN (4 números)" : "Novo PIN (deixe vazio para manter)"}</span>
        <input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" ${novo ? "required" : ""}></label>
      <div class="campo" style="grid-column:1/-1"><span>Pode retirar nas unidades</span>
        <div class="chips">${unidades.map((u) => `<label class="chip"><input type="checkbox" name="u_${u.id}" ${f.unidades?.includes(u.id) ? "checked" : ""} style="width:16px;height:16px;vertical-align:middle"> ${esc(u.nome)}</label>`).join("")}</div>
        <small>Nenhuma marcada = aparece em todas as unidades.</small></div>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" name="ativo" ${f.ativo !== false ? "checked" : ""}> Ativo (aparece no tablet)</label>
    </form>`,
    aoAbrir: (m) => {
      const input = $("[data-foto]", m);
      input.onchange = async () => {
        if (!input.files[0]) return;
        try { foto = await comprimirPorTipo(input.files[0], "funcionario"); $("[data-preview]", m).innerHTML = `<img src="${foto}" alt="">`; }
        catch (e) { toast(e.message, "erro"); }
      };
    },
    acoes: [
      { texto: "Cancelar", classe: "btn-sec" },
      { texto: "Salvar", classe: "btn-pri", onClick: async (m) => {
        const form = $("form", m);
        const d = lerForm(form);
        if (!d.nome) throw new Error("Informe o nome");
        if ((novo || d.pin) && !/^\d{4}$/.test(d.pin)) throw new Error("O PIN precisa ter 4 números");
        const dados = {
          nome: d.nome, cargo: d.cargo, ativo: d.ativo, foto,
          unidades: $$("input[name^=u_]", form).filter((i) => i.checked).map((i) => i.name.slice(2)),
        };
        if (d.pin) Object.assign(dados, await gerarHashPin(d.pin));
        salvarFuncionario(dados, novo ? null : f.id);
        toast(novo ? "Funcionário cadastrado" : "Funcionário atualizado");
      } },
    ],
  });
}

export default { render };
