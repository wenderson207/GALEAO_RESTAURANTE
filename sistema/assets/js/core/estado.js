// Estado global da sessão: quem está logado e qual unidade está selecionada.
import { sync } from "./sync.js";

const CHAVE_UNIDADE = "estoque.unidadeSelecionada";
const CHAVE_TABLET = "estoque.unidadeDoTablet";

export const estado = {
  usuario: null,   // Firebase Auth user
  perfil: null,    // usuarios/{uid}
  criandoEmpresa: false,

  get papel() { return this.perfil?.papel; },
  get gestor() { return ["admin", "gerente"].includes(this.perfil?.papel); },
  get admin() { return this.perfil?.papel === "admin"; },

  config() {
    const c = sync.empresa()?.config || {};
    return { periodoCalculo: 30, coberturaPadrao: 15, voltarAposSegundos: 4, ...c };
  },

  // Unidades que este usuário pode ver
  unidadesPermitidas() {
    const todas = sync.lista("unidades").filter((u) => u.ativo !== false)
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    const lim = this.perfil?.unidades;
    return Array.isArray(lim) && lim.length ? todas.filter((u) => lim.includes(u.id)) : todas;
  },

  // Filtro global do painel ("" = todas as unidades)
  get unidadeId() {
    let v = "";
    try { v = localStorage.getItem(CHAVE_UNIDADE) || ""; } catch {}
    const perm = this.unidadesPermitidas();
    if (v && !perm.some((u) => u.id === v)) v = "";
    if (!v && this.perfil?.unidades?.length === 1) v = this.perfil.unidades[0];
    return v;
  },
  set unidadeId(v) { try { localStorage.setItem(CHAVE_UNIDADE, v || ""); } catch {} },

  // Unidade fixa do tablet (operação)
  get unidadeTablet() {
    const perm = this.unidadesPermitidas();
    let v = "";
    try { v = localStorage.getItem(CHAVE_TABLET) || ""; } catch {}
    if (v && perm.some((u) => u.id === v)) return v;
    if (perm.length === 1) return perm[0].id;
    return "";
  },
  set unidadeTablet(v) { try { localStorage.setItem(CHAVE_TABLET, v || ""); } catch {} },

  nomeUnidade(id) { return sync.get("unidades", id)?.nome || "—"; },
};
