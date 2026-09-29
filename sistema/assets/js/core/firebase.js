// =====================================================================
// Inicialização do Firebase
// - Firestore com CACHE PERSISTENTE (IndexedDB): gravações ficam na fila
//   mesmo offline e sobrevivem a recarregar a página.
// - A economia de leituras de verdade vem do sync.js (sincronização
//   incremental): cada documento só é baixado de novo quando muda.
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../config/firebase-config.js";

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const configurado = !String(firebaseConfig.apiKey || "").includes("COLE_AQUI");

// Reexporta o que o resto do sistema usa, para ter um único ponto de versão do SDK
export {
  collection, doc, query, where, onSnapshot, getDoc, getDocs, getDocsFromServer,
  setDoc, updateDoc, writeBatch, serverTimestamp, increment, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, reload,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
