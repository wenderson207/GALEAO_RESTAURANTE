// Telas de entrada: login, primeiro acesso e avisos
import { entrar, criarEmpresa, sair, recuperarSenha } from "../core/auth.js";
import { $, esc, toast } from "../core/util.js";
import { estado } from "../core/estado.js";

export function telaLogin(el) {
  el.innerHTML = `
  <div class="tela-login">
    <form class="login-caixa pilha" autocomplete="on">
      <div><div class="marca">📦</div><h1>Estoque Inteligente</h1><p class="muted">Entre para continuar</p></div>
      <label class="campo"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="campo"><span>Senha</span><input name="senha" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-pri btn-grande" style="width:100%">Entrar</button>
      <div class="linha entre pequeno">
        <a href="#" data-esqueci>Esqueci a senha</a>
        <a href="#/primeiro-acesso">Primeiro acesso</a>
      </div>
    </form>
  </div>`;
  const form = $("form", el);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = $("button", form); b.disabled = true; b.textContent = "Entrando…";
    try { await entrar(form.email.value.trim(), form.senha.value); }
    catch (err) { toast(err.message, "erro"); b.disabled = false; b.textContent = "Entrar"; }
  };
  $("[data-esqueci]", el).onclick = async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) return toast("Digite seu e-mail primeiro", "erro");
    try { await recuperarSenha(email); toast("Enviamos um link para seu e-mail"); }
    catch (err) { toast(err.message, "erro"); }
  };
}

export function telaPrimeiroAcesso(el) {
  el.innerHTML = `
  <div class="tela-login">
    <form class="login-caixa pilha">
      <div><div class="marca">🏪</div><h1>Criar minha empresa</h1><p class="muted">Você será o administrador do sistema.</p></div>
      <label class="campo"><span>Nome da empresa</span><input name="nomeEmpresa" required placeholder="Ex.: Galeão Restaurante"></label>
      <label class="campo"><span>Primeiro restaurante / unidade</span><input name="nomeUnidade" required value="Unidade 01"></label>
      <label class="campo"><span>Seu nome</span><input name="nome" required></label>
      <label class="campo"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="campo"><span>Senha</span><input name="senha" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo 6 caracteres</small></label>
      <button class="btn btn-pri btn-grande" style="width:100%">Criar e entrar</button>
      <a href="#/login" class="pequeno">Já tenho acesso</a>
    </form>
  </div>`;
  const form = $("form", el);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = $("button", form); b.disabled = true; b.textContent = "Criando…";
    estado.criandoEmpresa = true;
    try {
      await criarEmpresa({
        nomeEmpresa: form.nomeEmpresa.value.trim(), nomeUnidade: form.nomeUnidade.value.trim(),
        nome: form.nome.value.trim(), email: form.email.value.trim(), senha: form.senha.value,
      });
      toast("Empresa criada!");
    } catch (err) {
      estado.criandoEmpresa = false;
      toast(err.message, "erro"); b.disabled = false; b.textContent = "Criar e entrar";
    }
  };
}

export function telaSemPerfil(el, msg) {
  el.innerHTML = `
  <div class="tela-login"><div class="login-caixa pilha">
    <div class="marca">🔒</div><h2>Acesso não liberado</h2>
    <p class="muted">${esc(msg || "Este login ainda não está vinculado a uma empresa. Peça ao administrador para liberar seu acesso.")}</p>
    <button class="btn btn-sec" data-sair>Sair</button>
  </div></div>`;
  $("[data-sair]", el).onclick = () => sair();
}

export function telaNaoConfigurado(el) {
  el.innerHTML = `
  <div class="tela-login"><div class="login-caixa pilha">
    <div class="marca">⚙️</div><h2>Falta conectar o Firebase</h2>
    <p class="muted">Abra o arquivo <b>sistema/assets/js/config/firebase-config.js</b> e cole as credenciais do seu projeto (Console do Firebase → Configurações do projeto → App da Web).</p>
    <p class="aviso aviso-info">Depois ative: Authentication → E-mail/senha e Firestore Database. O passo a passo completo está no README.md.</p>
  </div></div>`;
}
