// =====================================================================
// Cache local em IndexedDB (fica salvo no aparelho mesmo fechando o navegador)
//
// Guarda uma cópia de cada coleção + a data da última sincronização.
// Ao abrir o sistema, a tela aparece NA HORA com os dados do cache e
// o Firebase só envia o que mudou desde a última vez.
// =====================================================================
const NOME_BANCO = "estoque-cache";
const VERSAO = 1;
let conexao = null;

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_BANCO, VERSAO);
    req.onupgradeneeded = () => {
      const b = req.result;
      if (!b.objectStoreNames.contains("docs")) b.createObjectStore("docs"); // chave: "empresa|colecao"
      if (!b.objectStoreNames.contains("meta")) b.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexao;
}

async function operar(store, modo, fn) {
  const b = await abrir();
  return new Promise((resolve, reject) => {
    const tx = b.transaction(store, modo);
    const r = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export const cache = {
  async lerColecao(chave) {
    try { return (await operar("docs", "readonly", (s) => s.get(chave))) || {}; }
    catch { return {}; }
  },
  async salvarColecao(chave, mapa) {
    try { await operar("docs", "readwrite", (s) => s.put(mapa, chave)); } catch (e) { console.warn("cache", e); }
  },
  async lerMeta(chave) {
    try { return await operar("meta", "readonly", (s) => s.get(chave)); } catch { return undefined; }
  },
  async salvarMeta(chave, valor) {
    try { await operar("meta", "readwrite", (s) => s.put(valor, chave)); } catch {}
  },
  async limparTudo() {
    try {
      await operar("docs", "readwrite", (s) => s.clear());
      await operar("meta", "readwrite", (s) => s.clear());
    } catch {}
  },
};
