// =====================================================================
// Autenticação e perfil de acesso
// Papéis: admin (tudo) | gerente (estoque, compras, relatórios, funcionários)
//         | funcionario (acesso do TABLET — só retirada)
// =====================================================================
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  auth, db, doc, onSnapshot, writeBatch, setDoc, serverTimestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail,
} from "./firebase.js";
import { firebaseConfig } from "../config/firebase-config.js";
import { cache } from "./cache.js";
import { idNovo } from "./util.js";

export const PAPEIS = {
  admin: "Administrador",
  gerente: "Gerente",
  funcionario: "Tablet / Operação",
};

const traduzErro = (e) => ({
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/email-already-in-use": "Este e-mail já está cadastrado.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
  "auth/network-request-failed": "Sem internet. Verifique a conexão.",
  "permission-denied": "Sem permissão para esta ação.",
}[e?.code] || e?.message || "Erro inesperado.");
export { traduzErro };

export async function entrar(email, senha) {
  try { await signInWithEmailAndPassword(auth, email, senha); }
  catch (e) { throw new Error(traduzErro(e)); }
}

export async function sair() {
  await signOut(auth);
}

export async function recuperarSenha(email) {
  try { await sendPasswordResetEmail(auth, email); }
  catch (e) { throw new Error(traduzErro(e)); }
}

// Observa login + perfil. O perfil sai do cache na hora e é confirmado pelo servidor (1 leitura).
export function observarSessao(callback) {
  let pararPerfil = null;
  return onAuthStateChanged(auth, async (user) => {
    pararPerfil?.(); pararPerfil = null;
    if (!user) return callback(null, null);
    const emCache = await cache.lerMeta(`perfil|${user.uid}`);
    if (emCache) callback(user, emCache);
    pararPerfil = onSnapshot(doc(db, "usuarios", user.uid), (snap) => {
      const p = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      if (p) { delete p.criadoEm; delete p.atualizadoEm; cache.salvarMeta(`perfil|${user.uid}`, p); }
      else cache.salvarMeta(`perfil|${user.uid}`, null);
      callback(user, p);
    }, (e) => {
      console.warn("perfil:", e.code);
      if (!emCache) callback(user, null);
    });
  });
}

// Primeiro acesso: cria login + empresa + perfil de administrador + primeira unidade
export async function criarEmpresa({ nomeEmpresa, nome, email, senha, nomeUnidade }) {
  let cred;
  try { cred = await createUserWithEmailAndPassword(auth, email, senha); }
  catch (e) { throw new Error(traduzErro(e)); }
  const uid = cred.user.uid;
  const empresaId = idNovo();
  const agora = serverTimestamp();

  const lote = writeBatch(db);
  lote.set(doc(db, "empresas", empresaId), {
    nome: nomeEmpresa, donoUid: uid, criadoEm: agora, atualizadoEm: agora,
    config: { periodoCalculo: 30, coberturaPadrao: 15, voltarAposSegundos: 4 },
    categorias: ["Grãos", "Massas", "Carnes", "Bebidas", "Hortifruti", "Limpeza", "Outros"],
  });
  lote.set(doc(db, "usuarios", uid), {
    empresaId, papel: "admin", nome, email, ativo: true, unidades: [], criadoEm: agora,
  });
  try { await lote.commit(); } catch (e) { throw new Error("Não foi possível criar a empresa: " + traduzErro(e)); }

  // a unidade depende do perfil já existir (regra de administrador)
  const unidadeId = idNovo();
  await setDoc(doc(db, "empresas", empresaId, "unidades", unidadeId), {
    nome: nomeUnidade || "Unidade 01", ativo: true, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
  });
}

// Admin cria outro acesso (gerente ou tablet) sem perder a própria sessão:
// usa uma instância secundária do Firebase só para registrar o novo login.
export async function criarAcesso({ empresaId, nome, email, senha, papel, unidades }) {
  const sec = initializeApp(firebaseConfig, "secundario-" + Date.now());
  try {
    const authSec = getAuth(sec);
    let cred;
    try { cred = await createUserWithEmailAndPassword(authSec, email, senha); }
    catch (e) { throw new Error(traduzErro(e)); }
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      empresaId, papel, nome, email, ativo: true, unidades: unidades || [], criadoEm: serverTimestamp(),
    });
    await authSec.signOut();
  } finally {
    deleteApp(sec).catch(() => {});
  }
}
