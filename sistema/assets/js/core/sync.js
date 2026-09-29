// =====================================================================
// SINCRONIZAÇÃO INCREMENTAL — o coração da economia de leituras
//
// Como funciona:
// 1. Ao abrir, carrega tudo do cache local (IndexedDB) -> 0 leituras.
// 2. Abre um "ouvinte" no Firebase pedindo SOMENTE documentos com
//    atualizadoEm > última sincronização. Se nada mudou, custa 1 leitura.
// 3. Quando alguém altera algo (outro tablet, o gestor), só aquele
//    documento é enviado -> 1 leitura por alteração, em tempo real.
// 4. Tudo que chega é gravado de volta no cache local.
//
// Nada é apagado no banco (regras proíbem); itens desativados usam ativo:false.
// =====================================================================
import {
  db, collection, doc, query, where, onSnapshot, Timestamp,
} from "./firebase.js";
import { cache } from "./cache.js";

const DIA = 86400000;

// Coleções por perfil. "janelaDias" limita o PRIMEIRO download de um aparelho novo
// (histórico antigo é buscado só quando um relatório pedir).
const COLECOES = {
  unidades:      { papeis: ["admin", "gerente", "funcionario"] },
  funcionarios:  { papeis: ["admin", "gerente", "funcionario"] },
  produtos:      { papeis: ["admin", "gerente", "funcionario"] },
  fornecedores:  { papeis: ["admin", "gerente"] },
  movimentacoes: { papeis: ["admin", "gerente"], janelaDias: 90 },
  consumoDiario: { papeis: ["admin", "gerente"], janelaDias: 120 },
};

const dados = {};          // { colecao: { id: doc } }
const ultimaSync = {};     // { colecao: {s, n} }
let empresa = null;
let empresaId = null;
let ouvintes = [];
let salvarTimers = {};
let ocultoDesde = 0;
const eventos = new EventTarget();
export const status = { online: navigator.onLine, pendentes: 0, carregado: false };

function normalizar(obj) {
  const r = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v.toMillis === "function") r[k] = v.toMillis();
    else r[k] = v;
  }
  return r;
}

function chave(col) { return `${empresaId}|${col}`; }

function agendarSalvar(col) {
  clearTimeout(salvarTimers[col]);
  salvarTimers[col] = setTimeout(() => {
    cache.salvarColecao(chave(col), dados[col] || {});
    if (ultimaSync[col]) cache.salvarMeta(chave(col) + "|sync", ultimaSync[col]);
  }, 400);
}

function emitir(col) { eventos.dispatchEvent(new CustomEvent("mudou", { detail: col })); }

function maior(a, b) {
  if (!a) return b; if (!b) return a;
  return (b.s > a.s || (b.s === a.s && b.n > a.n)) ? b : a;
}

function ouvirColecao(col, cfg) {
  let desde = ultimaSync[col];
  if (!desde && cfg.janelaDias) {
    desde = { s: Math.floor((Date.now() - cfg.janelaDias * DIA) / 1000), n: 0 };
  }
  const ref = collection(db, "empresas", empresaId, col);
  const q = desde
    ? query(ref, where("atualizadoEm", ">", new Timestamp(desde.s, desde.n)))
    : query(ref, where("atualizadoEm", ">", new Timestamp(0, 0)));

  const parar = onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
    if (!dados[col]) dados[col] = {};
    let mudou = false;
    snap.docChanges().forEach((ch) => {
      const bruto = ch.doc.data({ serverTimestamps: "estimate" });
      dados[col][ch.doc.id] = { id: ch.doc.id, ...normalizar(bruto) };
      mudou = true;
      // só avança o marcador com horário confirmado pelo servidor
      if (!ch.doc.metadata.hasPendingWrites && bruto.atualizadoEm?.seconds !== undefined) {
        ultimaSync[col] = maior(ultimaSync[col], { s: bruto.atualizadoEm.seconds, n: bruto.atualizadoEm.nanoseconds });
      }
    });
    if (mudou) { agendarSalvar(col); emitir(col); }
  }, (erro) => console.warn(`[sync] ${col}:`, erro.code || erro));
  ouvintes.push(parar);
}

function ouvirEmpresa() {
  const parar = onSnapshot(doc(db, "empresas", empresaId), (snap) => {
    if (!snap.exists()) return;
    empresa = { id: snap.id, ...normalizar(snap.data({ serverTimestamps: "estimate" })) };
    cache.salvarMeta(`${empresaId}|empresa`, empresa);
    emitir("empresa");
  }, (e) => console.warn("[sync] empresa:", e.code || e));
  ouvintes.push(parar);
}

function abrirOuvintes(papel) {
  ouvirEmpresa();
  for (const [col, cfg] of Object.entries(COLECOES)) {
    if (cfg.papeis.includes(papel)) ouvirColecao(col, cfg);
  }
}

function fecharOuvintes() { ouvintes.forEach((p) => p()); ouvintes = []; }

let papelAtual = null;

export const sync = {
  async iniciar(perfil) {
    empresaId = perfil.empresaId;
    papelAtual = perfil.papel;
    // 1) cache local primeiro (0 leituras)
    empresa = (await cache.lerMeta(`${empresaId}|empresa`)) || null;
    for (const [col, cfg] of Object.entries(COLECOES)) {
      if (!cfg.papeis.includes(papelAtual)) continue;
      dados[col] = await cache.lerColecao(chave(col));
      ultimaSync[col] = await cache.lerMeta(chave(col) + "|sync");
    }
    status.carregado = true;
    emitir("*");
    // 2) só o que mudou vem do servidor
    abrirOuvintes(papelAtual);
  },

  parar() { fecharOuvintes(); },

  // Reabre os ouvintes com o marcador atualizado (evita rebaixar tudo após longos períodos offline)
  reiniciar() {
    if (!empresaId) return;
    fecharOuvintes();
    abrirOuvintes(papelAtual);
  },

  empresa() { return empresa; },
  lista(col) { return Object.values(dados[col] || {}); },
  get(col, id) { return (dados[col] || {})[id]; },

  // Atualização otimista: a tela muda na hora, antes do servidor confirmar
  aplicarLocal(col, id, parcial) {
    if (!dados[col]) dados[col] = {};
    dados[col][id] = { ...(dados[col][id] || { id }), ...parcial, id, atualizadoEm: Date.now() };
    agendarSalvar(col);
    emitir(col);
  },
  aplicarEmpresaLocal(parcial) {
    empresa = { ...(empresa || {}), ...parcial };
    cache.salvarMeta(`${empresaId}|empresa`, empresa);
    emitir("empresa");
  },

  on(fn) {
    const h = (e) => fn(e.detail);
    eventos.addEventListener("mudou", h);
    return () => eventos.removeEventListener("mudou", h);
  },

  // Guarda documentos buscados sob demanda (ex.: relatório de um período antigo)
  mesclar(col, docs) {
    if (!dados[col]) dados[col] = {};
    docs.forEach((d) => { dados[col][d.id] = d; });
    agendarSalvar(col);
    emitir(col);
  },

  normalizar,
  async limparCache() { await cache.limparTudo(); },
};

// Volta do segundo plano depois de muito tempo: reabre com o marcador novo
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { ocultoDesde = Date.now(); return; }
  if (ocultoDesde && Date.now() - ocultoDesde > 20 * 60000) sync.reiniciar();
  ocultoDesde = 0;
});
window.addEventListener("online", () => { status.online = true; emitir("status"); });
window.addEventListener("offline", () => { status.online = false; emitir("status"); });
