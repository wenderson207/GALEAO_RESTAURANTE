// Telas de entrada: login, primeiro acesso e avisos
import { entrar, criarEmpresa, sair, recuperarSenha, PAPEIS } from "../core/auth.js";
import { $, esc, toast } from "../core/util.js";
import {
  buscarConvite, situacaoConvite, aceitarPorLink, criarContaConvidado, procurarMeuConvite, reenviarConfirmacao,
} from "../core/convites.js";
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

// Primeiro acesso: a pessoa escolhe se foi CONVIDADA (funcionário/gerente) ou se é o DONO criando a empresa
export function telaPrimeiroAcesso(el) {
  el.innerHTML = `
  <div class="tela-login">
    <div class="login-caixa pilha">
      <div><div class="marca">👋</div><h1>Primeiro acesso</h1><p class="muted">Como você vai usar o sistema?</p></div>
      <button class="btn btn-pri btn-grande escolha" data-e="convidado" style="width:100%;flex-direction:column;align-items:flex-start;text-align:left;white-space:normal">
        <span>✉️ Fui convidado</span><small style="font-weight:500;opacity:.85;font-size:14px">O administrador já cadastrou meu e-mail</small></button>
      <button class="btn btn-grande escolha" data-e="empresa" style="width:100%;flex-direction:column;align-items:flex-start;text-align:left;white-space:normal">
        <span>🏪 Sou o dono — criar minha empresa</span><small style="font-weight:500;color:var(--texto-2);font-size:14px">Crie a empresa e convide a equipe depois</small></button>
      <a href="#/login" class="pequeno">Já tenho acesso — entrar</a>
    </div>
  </div>`;
  el.querySelector("[data-e=convidado]").onclick = () => telaConvidado(el);
  el.querySelector("[data-e=empresa]").onclick = () => telaCriarEmpresa(el);
}

// Convidado sem link: cria a conta com o e-mail pré-cadastrado e confirma o e-mail
function telaConvidado(el) {
  el.innerHTML = `
  <div class="tela-login">
    <form class="login-caixa pilha">
      <div><div class="marca">✉️</div><h1>Fui convidado</h1><p class="muted">Use o <b>mesmo e-mail</b> que o administrador cadastrou para você.</p></div>
      <label class="campo"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="campo"><span>Crie uma senha</span><input name="senha" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo 6 caracteres</small></label>
      <button class="btn btn-pri btn-grande" style="width:100%">Continuar</button>
      <p class="muted pequeno" style="margin:0">Recebeu um <b>link de convite</b>? Abra o link direto — é mais rápido.</p>
      <a href="#/primeiro-acesso" class="pequeno" data-voltar>← Voltar</a>
    </form>
  </div>`;
  const form = $("form", el);
  $("[data-voltar]", el).onclick = (e) => { e.preventDefault(); telaPrimeiroAcesso(el); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = $("button", form); b.disabled = true; b.textContent = "Criando conta…";
    try { await criarContaConvidado(form.email.value, form.senha.value); telaConfirmarEmail(el); }
    catch (err) { toast(err.message.includes("já está cadastrado") ? "Este e-mail já tem conta. Volte e faça login." : err.message, "erro"); b.disabled = false; b.textContent = "Continuar"; }
  };
}

// Espera a pessoa confirmar o e-mail e procura o convite
export function telaConfirmarEmail(el, email = "") {
  el.innerHTML = `
  <div class="tela-login"><div class="login-caixa pilha">
    <div class="marca">📬</div><h1>Confirme seu e-mail</h1>
    <p class="muted">Enviamos um link de confirmação para <b>${esc(email || "seu e-mail")}</b>. Abra o e-mail (veja também o spam), toque no link e volte aqui.</p>
    <button class="btn btn-pri btn-grande" style="width:100%" data-ok>✓ Já confirmei</button>
    <button class="btn btn-sec" data-reenviar>Reenviar e-mail</button>
    <button class="btn btn-texto" data-sair>Sair</button>
    <p class="pequeno" data-msg></p>
  </div></div>`;
  const msg = $("[data-msg]", el);
  $("[data-ok]", el).onclick = async (e) => {
    e.currentTarget.disabled = true; msg.textContent = "Procurando seu convite…";
    try {
      const r = await procurarMeuConvite();
      if (r.naoConfirmado) msg.textContent = "Ainda não identificamos a confirmação. Toque no link do e-mail e tente de novo.";
      else if (r.nenhum) { estado.criandoEmpresa = false; msg.innerHTML = "Nenhum convite pendente para este e-mail. Peça ao administrador para cadastrar <b>exatamente</b> este e-mail em Acessos → Convidar."; }
      else toast(`Bem-vindo(a) à ${r.aceito.empresaNome || "empresa"}!`);
    } catch (err) { msg.textContent = err.message; }
    finally { const b = $("[data-ok]", el); if (b) b.disabled = false; }
  };
  $("[data-reenviar]", el).onclick = async () => {
    try { await reenviarConfirmacao(); toast("E-mail reenviado"); } catch (err) { toast("Aguarde um pouco para reenviar", "erro"); }
  };
  $("[data-sair]", el).onclick = () => { estado.criandoEmpresa = false; sair(); };
}

// Convite pelo LINK: dados já vêm preenchidos, a pessoa só cria a senha
export async function telaConvite(el, codigo) {
  el.innerHTML = `<div class="tela-login"><div class="login-caixa"><div class="giro"></div><p class="muted" style="text-align:center">Abrindo convite…</p></div></div>`;
  let c = null;
  try { c = await buscarConvite(codigo); } catch (e) { console.warn(e); }
  const problema = situacaoConvite(c);
  if (problema) {
    el.innerHTML = `<div class="tela-login"><div class="login-caixa pilha"><div class="marca">✉️</div><h2>Convite indisponível</h2>
      <p class="muted">${esc(problema)}</p><a class="btn btn-pri" href="#/login">Ir para o login</a></div></div>`;
    return;
  }
  el.innerHTML = `
  <div class="tela-login">
    <form class="login-caixa pilha">
      <div><div class="marca">🎉</div><h1>Você foi convidado!</h1>
        <p class="muted">${esc(c.criadoPorNome || "O administrador")} convidou você para <b>${esc(c.empresaNome || "a empresa")}</b>.</p></div>
      <div class="aviso aviso-info">
        <div><b>${esc(c.nome)}</b></div>
        <div>Permissão: <b>${esc(PAPEIS[c.papel] || c.papel)}</b></div>
        <div>Unidade: <b>${esc((c.unidadesNomes || []).join(", ") || "Todas")}</b></div>
      </div>
      <label class="campo"><span>E-mail</span><input value="${esc(c.email)}" disabled></label>
      <label class="campo"><span>Crie sua senha</span><input name="senha" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo 6 caracteres. Se este e-mail já tem conta, digite a senha dela.</small></label>
      <label class="campo"><span>Repita a senha</span><input name="senha2" type="password" minlength="6" required autocomplete="new-password"></label>
      <button class="btn btn-pri btn-grande" style="width:100%">Aceitar convite e entrar</button>
    </form>
  </div>`;
  const form = $("form", el);
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.senha.value !== form.senha2.value) return toast("As senhas não são iguais", "erro");
    const b = $("button", form); b.disabled = true; b.textContent = "Entrando…";
    try {
      await aceitarPorLink(c, form.senha.value);
      toast(`Bem-vindo(a), ${c.nome.split(" ")[0]}!`);
      history.replaceState(null, "", location.pathname + "#/");
    } catch (err) { toast(err.message, "erro"); b.disabled = false; b.textContent = "Aceitar convite e entrar"; }
  };
}

function telaCriarEmpresa(el) {
  el.innerHTML = `
  <div class="tela-login">
    <form class="login-caixa pilha">
      <div><div class="marca">🏪</div><h1>Criar minha empresa</h1><p class="muted">Só para o <b>dono</b>: você será o administrador. Funcionários e gerentes entram por convite.</p></div>
      <label class="campo"><span>Nome da empresa</span><input name="nomeEmpresa" required placeholder="Ex.: Galeão Restaurante"></label>
      <label class="campo"><span>Primeiro restaurante / unidade</span><input name="nomeUnidade" required value="Unidade 01"></label>
      <label class="campo"><span>Seu nome</span><input name="nome" required></label>
      <label class="campo"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="campo"><span>Senha</span><input name="senha" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo 6 caracteres</small></label>
      <button class="btn btn-pri btn-grande" style="width:100%">Criar e entrar</button>
      <a href="#/primeiro-acesso" class="pequeno" data-voltar>← Voltar</a>
    </form>
  </div>`;
  const form = $("form", el);
  $("[data-voltar]", el).onclick = (e) => { e.preventDefault(); telaPrimeiroAcesso(el); };
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
    <p class="muted">${esc(msg || "Este login ainda não está vinculado a uma empresa. Se o administrador cadastrou seu e-mail, toque em \"Procurar meu convite\".")}</p>
    ${msg ? "" : `<button class="btn btn-pri" data-procurar>✉️ Procurar meu convite</button>`}
    <button class="btn btn-sec" data-sair>Sair</button>
  </div></div>`;
  $("[data-sair]", el).onclick = () => sair();
  const p = el.querySelector("[data-procurar]");
  if (p) p.onclick = async () => {
    p.disabled = true;
    try {
      const r = await procurarMeuConvite();
      if (r.naoConfirmado) { await reenviarConfirmacao().catch(() => {}); telaConfirmarEmail(el, estado.usuario?.email); }
      else if (r.nenhum) toast("Nenhum convite pendente para este e-mail", "erro");
      else toast("Convite aceito!");
    } catch (err) { toast(err.message, "erro"); }
    finally { p.disabled = false; }
  };
}

export function telaNaoConfigurado(el) {
  el.innerHTML = `
  <div class="tela-login"><div class="login-caixa pilha">
    <div class="marca">⚙️</div><h2>Falta conectar o Firebase</h2>
    <p class="muted">Abra o arquivo <b>sistema/assets/js/config/firebase-config.js</b> e cole as credenciais do seu projeto (Console do Firebase → Configurações do projeto → App da Web).</p>
    <p class="aviso aviso-info">Depois ative: Authentication → E-mail/senha e Firestore Database. O passo a passo completo está no README.md.</p>
  </div></div>`;
}
