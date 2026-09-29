// =====================================================================
// Inicialização e rotas do sistema
//   #/login              -> entrar
//   #/primeiro-acesso    -> criar empresa + administrador
//   #/operacao           -> tela do tablet (retirada)
//   #/admin/<pagina>     -> área administrativa
// =====================================================================
import { configurado } from "./core/firebase.js";
import { observarSessao } from "./core/auth.js";
import { sync } from "./core/sync.js";
import { estado } from "./core/estado.js";
import { $ } from "./core/util.js";
import { telaLogin, telaPrimeiroAcesso, telaSemPerfil, telaNaoConfigurado } from "./pages/login.js";
import { telaOperacao } from "./pages/operacao.js";
import { telaAdmin } from "./pages/admin/layout.js";

const app = $("#app");
let limpar = null;
let empresaSincronizada = null;


function montar(fn, ...args) {
  try { limpar?.(); } catch {}
  limpar = null;
  app.innerHTML = "";
  limpar = fn(app, ...args) || null;
}

function rota() { return (location.hash || "#/").slice(1); }

function renderizar() {
  const r = rota();
  if (!estado.usuario) {
    if (r === "/primeiro-acesso") return montar(telaPrimeiroAcesso);
    return montar(telaLogin);
  }
  if (!estado.perfil) {
    if (estado.criandoEmpresa) return;
    return montar(telaSemPerfil);
  }
  if (estado.perfil.ativo === false) return montar(telaSemPerfil, "Seu acesso está desativado. Fale com o administrador.");

  if (r.startsWith("/operacao")) return montar(telaOperacao);
  if (r.startsWith("/admin/") && estado.gestor) return montar(telaAdmin, (r.split("/")[2] || "dashboard").split("?")[0]);

  // rota padrão conforme o papel
  location.hash = estado.gestor ? "#/admin/dashboard" : "#/operacao";
}

window.addEventListener("hashchange", renderizar);

if (!configurado) {
  montar(telaNaoConfigurado);
} else {
  let ultimaSessao = "";
  observarSessao(async (user, perfil) => {
    // o perfil chega 2x (cache e servidor): só redesenha se algo mudou
    const assinatura = (user?.uid || "") + "|" + JSON.stringify(perfil || null);
    if (assinatura === ultimaSessao) return;
    ultimaSessao = assinatura;
    estado.usuario = user;
    estado.perfil = perfil;
    if (!user) {
      sync.parar(); empresaSincronizada = null;
    } else if (perfil?.empresaId && perfil.ativo !== false) {
      estado.criandoEmpresa = false;
      const chave = `${perfil.empresaId}|${perfil.papel}`;
      if (empresaSincronizada !== chave) {
        sync.parar();
        empresaSincronizada = chave;
        await sync.iniciar(perfil);
      }
    }
    const r = rota();
    if (user && (r === "/login" || r === "/primeiro-acesso" || r === "/")) {
      if (perfil) { location.hash = estado.gestor ? "#/admin/dashboard" : "#/operacao"; return; }
    }
    renderizar();
  });
}

// Service worker: o sistema abre mesmo sem internet
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
