// =====================================================================
// CONVITES — pré-cadastro de acessos
//
// O administrador cria o convite (nome, e-mail, permissão e unidade).
// A pessoa entra de 2 jeitos, e cai DIRETO na empresa/unidade escolhida:
//   1) Pelo LINK do convite (…/sistema/#/convite/CODIGO): só cria a senha.
//   2) Pelo "Primeiro acesso → Fui convidado": cria a conta com o e-mail
//      pré-cadastrado, confirma o e-mail e o sistema encontra o convite.
// Convite vale 7 dias e só pode ser usado uma vez.
// =====================================================================
import {
  auth, db, doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, writeBatch,
  serverTimestamp, Timestamp, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, reload,
} from "./firebase.js";
import { traduzErro } from "./auth.js";
import { estado } from "./estado.js";
import { sync } from "./sync.js";

const DIAS_VALIDADE = 7;

export function gerarCodigo() {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return [...a].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
}

export function linkConvite(codigo) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  return `${base}#/convite/${codigo}`;
}

// ---------------------------------------------------------------- admin
export async function criarConvite({ nome, email, papel, unidades }) {
  const codigo = gerarCodigo();
  const dados = {
    empresaId: estado.perfil.empresaId,
    empresaNome: sync.empresa()?.nome || "",
    nome, email: email.trim().toLowerCase(), papel, unidades: unidades || [],
    unidadesNomes: (unidades || []).map((u) => estado.nomeUnidade(u)),
    status: "pendente",
    criadoPor: estado.usuario.uid, criadoPorNome: estado.perfil.nome || "",
    criadoEm: serverTimestamp(),
    expiraEm: Timestamp.fromMillis(Date.now() + DIAS_VALIDADE * 86400000),
  };
  try { await setDoc(doc(db, "convites", codigo), dados); }
  catch (e) { throw new Error("Não foi possível criar o convite: " + traduzErro(e)); }
  return { id: codigo, ...dados, expiraEm: dados.expiraEm.toMillis() };
}

export async function listarConvites() {
  const snap = await getDocs(query(collection(db, "convites"), where("empresaId", "==", estado.perfil.empresaId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function cancelarConvite(codigo) {
  return updateDoc(doc(db, "convites", codigo), { status: "cancelado", canceladoEm: serverTimestamp() });
}

// ---------------------------------------------------------------- pessoa convidada
export function situacaoConvite(c) {
  if (!c) return "Convite não encontrado. Confira o link com quem te convidou.";
  if (c.status === "usado") return "Este convite já foi usado. Faça login normalmente.";
  if (c.status === "cancelado") return "Este convite foi cancelado pelo administrador.";
  const exp = c.expiraEm?.toMillis ? c.expiraEm.toMillis() : c.expiraEm;
  if (exp && exp < Date.now()) return "Este convite expirou. Peça um novo ao administrador.";
  return "";
}

export async function buscarConvite(codigo) {
  const snap = await getDoc(doc(db, "convites", codigo));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Grava o perfil a partir do convite e marca o convite como usado (tudo junto)
async function aceitar(convite, uid) {
  const lote = writeBatch(db);
  lote.set(doc(db, "usuarios", uid), {
    empresaId: convite.empresaId, papel: convite.papel, nome: convite.nome, email: convite.email,
    ativo: true, unidades: convite.unidades || [], conviteId: convite.id, criadoEm: serverTimestamp(),
  });
  lote.update(doc(db, "convites", convite.id), { status: "usado", usadoPor: uid, usadoEm: serverTimestamp() });
  try { await lote.commit(); }
  catch (e) { throw new Error("Não foi possível aceitar o convite: " + traduzErro(e)); }
}

// Pelo LINK: cria a senha (ou entra, se o e-mail já tiver conta) e aceita
export async function aceitarPorLink(convite, senha) {
  estado.criandoEmpresa = true; // evita piscar a tela "acesso não liberado"
  try {
    let cred;
    try { cred = await createUserWithEmailAndPassword(auth, convite.email, senha); }
    catch (e) {
      if (e.code !== "auth/email-already-in-use") throw new Error(traduzErro(e));
      try { cred = await signInWithEmailAndPassword(auth, convite.email, senha); }
      catch { throw new Error("Este e-mail já tem conta. Digite a senha dessa conta (ou use \"Esqueci a senha\" no login)."); }
    }
    await aceitar(convite, cred.user.uid);
  } catch (e) { estado.criandoEmpresa = false; throw e; }
}

// Pelo "Primeiro acesso": cria a conta e manda o e-mail de confirmação
export async function criarContaConvidado(email, senha) {
  estado.criandoEmpresa = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), senha);
    await sendEmailVerification(cred.user).catch(() => {});
  } catch (e) {
    estado.criandoEmpresa = false;
    throw new Error(traduzErro(e));
  }
}

export async function reenviarConfirmacao() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

// Procura convite pendente para o e-mail do usuário logado (exige e-mail confirmado)
export async function procurarMeuConvite() {
  const u = auth.currentUser;
  if (!u) throw new Error("Faça login primeiro");
  await reload(u);
  if (!u.emailVerified) return { naoConfirmado: true };
  await u.getIdToken(true); // atualiza o token com "e-mail confirmado"
  const snap = await getDocs(query(collection(db, "convites"),
    where("email", "==", (u.email || "").toLowerCase()), where("status", "==", "pendente")));
  const validos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !situacaoConvite(c));
  if (!validos.length) return { nenhum: true };
  estado.criandoEmpresa = true;
  try { await aceitar(validos[0], u.uid); }
  catch (e) { estado.criandoEmpresa = false; throw e; }
  return { aceito: validos[0] };
}
