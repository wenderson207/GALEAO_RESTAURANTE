// =====================================================================
// OPERAÇÃO — tela do tablet
// PRODUTO → FUNCIONÁRIO → PIN → CONFIRMAR   (retirada em até 4 toques)
// =====================================================================
import { sync } from "../core/sync.js";
import { estado } from "../core/estado.js";
import { registrarRetirada } from "../core/db.js";
import { sair } from "../core/auth.js";
import { $, $$, esc, num, toast, modal, avatar, conferirPin, paraNumero } from "../core/util.js";

const bloqueios = {}; // funcionarioId -> { erros, ate }

export function telaOperacao(el) {
  let filtroCat = "TODOS";
  let busca = "";
  let fluxo = null; // { produto, funcionario, quantidade }
  let timerVolta = null;

  const modoTablet = !estado.gestor; // login de tablet: só retirada, sem acesso a outras telas
  const logo = sync.empresa()?.logo;
  el.innerHTML = `
  <div class="op">
    <header class="op-topo">
      <div class="op-titulo" data-titulo>
        ${logo ? `<img class="op-logo" src="${esc(logo)}" alt="">` : `<span class="op-logo op-logo-emoji">📦</span>`}
        <h1>RETIRADA DE ESTOQUE</h1>
      </div>
      <span class="unidade" data-unidade></span>
      <span class="espaco"></span>
      <span class="sync" data-sync></span>
      <button class="btn op-recarregar" data-recarregar aria-label="Recarregar">⟳ <span>Recarregar</span></button>
      ${modoTablet ? "" : `<button class="btn-icone" data-menu aria-label="Opções">⚙️</button>`}
    </header>
    <div class="op-barra"><label class="op-busca"><input type="search" placeholder="Buscar produto" data-busca aria-label="Buscar produto" enterkeyhint="search"></label></div>
    <nav class="op-cats" data-cats></nav>
    <main class="op-grade" data-grade></main>
  </div>`;

  // ---------------------------------------------------------- tela cheia + tela sempre acesa
  const fsSuportado = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const instalado = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone;
  let travaTela = null;
  async function entrarTelaCheia() {
    try {
      if (fsSuportado && !document.fullscreenElement && !document.webkitFullscreenElement) {
        const r = document.documentElement;
        await (r.requestFullscreen?.({ navigationUI: "hide" }) || r.webkitRequestFullscreen?.());
      }
    } catch {}
    try { if ("wakeLock" in navigator && !travaTela) { travaTela = await navigator.wakeLock.request("screen"); travaTela.addEventListener("release", () => { travaTela = null; }); } } catch {}
  }
  // navegadores só permitem tela cheia após um toque: qualquer toque na tela já ativa
  const aoTocar = () => entrarTelaCheia();
  document.addEventListener("pointerdown", aoTocar, true);
  let capa = null;
  function mostrarCapa() {
    if (!fsSuportado || instalado || document.fullscreenElement || document.webkitFullscreenElement || capa) return;
    capa = document.createElement("div");
    capa.className = "op-capa";
    capa.innerHTML = `<div><div class="op-capa-ico">👆</div><h2>RETIRADA DE ESTOQUE</h2><p>Toque na tela para começar</p></div>`;
    capa.onclick = () => { capa.remove(); capa = null; };
    document.body.appendChild(capa);
  }
  const aoMudarTela = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) setTimeout(mostrarCapa, 300); };
  document.addEventListener("fullscreenchange", aoMudarTela);
  document.addEventListener("webkitfullscreenchange", aoMudarTela);
  mostrarCapa();

  $("[data-recarregar]", el).onclick = () => location.reload();

  // Opções escondidas do tablet: segurar o título por 3 segundos (trocar unidade / sair)
  let timerSegurar = null;
  const titulo = $("[data-titulo]", el);
  titulo.addEventListener("pointerdown", () => { timerSegurar = setTimeout(() => menuTablet(), 3000); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => titulo.addEventListener(ev, () => clearTimeout(timerSegurar)));
  function menuTablet() {
    const m = modal({
      titulo: "Opções do tablet",
      corpo: `<div class="pilha">
        <button class="btn btn-grande" style="width:100%" data-o="unidade">🏪 Trocar unidade do tablet</button>
        <button class="btn btn-grande" style="width:100%" data-o="sair">🚪 Sair (precisa do login para entrar de novo)</button>
      </div>`,
      acoes: [{ texto: "Fechar", classe: "btn-sec" }],
    });
    m.el.addEventListener("click", async (e) => {
      const o = e.target.closest("[data-o]")?.dataset.o; if (!o) return;
      m.fechar();
      if (o === "unidade") escolherUnidade();
      if (o === "sair") await sair();
    });
  }

  const grade = $("[data-grade]", el);
  const cats = $("[data-cats]", el);

  // ---------------------------------------------------------- unidade do tablet
  function unidadeId() { return estado.unidadeTablet; }

  function escolherUnidade(obrigatorio = false) {
    const lista = estado.unidadesPermitidas();
    if (!lista.length) { toast("Nenhuma unidade cadastrada", "erro"); return; }
    const m = modal({
      titulo: "Este tablet fica em qual unidade?",
      corpo: `<div class="grade grade-2">${lista.map((u) => `<button class="btn btn-grande" data-u="${u.id}">${esc(u.nome)}</button>`).join("")}</div>`,
      acoes: obrigatorio ? [] : [{ texto: "Cancelar", classe: "btn-sec" }],
    });
    $$("[data-u]", m.el).forEach((b) => b.onclick = () => { estado.unidadeTablet = b.dataset.u; m.fechar(); desenhar(); });
  }

  // ---------------------------------------------------------- lista de produtos
  function produtosDaUnidade() {
    const u = unidadeId();
    return sync.lista("produtos")
      .filter((p) => p.ativo !== false && p.unidadeId === u)
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }

  function situacao(p) {
    const e = Number(p.estoque || 0);
    if (e <= 0) return { cls: "sem", txt: "🔴 Sem estoque" };
    if (e <= Number(p.estoqueMinimo || 0)) return { cls: "baixo", txt: "🟡 Estoque baixo" };
    return { cls: "ok", txt: "🟢 Disponível" };
  }

  function desenhar() {
    const u = unidadeId();
    $("[data-unidade]", el).textContent = u ? estado.nomeUnidade(u) : "Sem unidade";
    const s = $("[data-sync]", el);
    s.textContent = navigator.onLine ? "Online" : "Offline — salvando no aparelho";
    s.classList.toggle("off", !navigator.onLine);

    if (!u) {
      grade.innerHTML = `<div class="vazio" style="grid-column:1/-1"><span class="emoji">🏪</span>Escolha a unidade deste tablet.<br><br><button class="btn btn-pri btn-grande" data-escolher>Escolher unidade</button></div>`;
      $("[data-escolher]", grade).onclick = () => escolherUnidade(true);
      cats.innerHTML = "";
      return;
    }

    const todos = produtosDaUnidade();
    const categorias = ["TODOS", ...new Set(todos.map((p) => (p.categoria || "Outros").toUpperCase()))];
    if (!categorias.includes(filtroCat)) filtroCat = "TODOS";
    cats.innerHTML = categorias.map((c) => `<button class="op-cat ${c === filtroCat ? "ativo" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");

    const termo = busca.toLowerCase();
    const lista = todos.filter((p) =>
      (filtroCat === "TODOS" || (p.categoria || "Outros").toUpperCase() === filtroCat)
      && (!termo || (p.nome || "").toLowerCase().includes(termo) || (p.categoria || "").toLowerCase().includes(termo)));

    if (!lista.length) {
      grade.innerHTML = `<div class="vazio" style="grid-column:1/-1"><span class="emoji">🔎</span>${todos.length ? "Nenhum produto encontrado." : "Nenhum produto cadastrado nesta unidade ainda."}</div>`;
      return;
    }
    grade.innerHTML = lista.map((p) => {
      const s = situacao(p);
      return `
      <button class="op-produto ${s.cls === "sem" ? "desabilitado" : ""}" data-p="${p.id}">
        <div class="foto">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : "📦"}</div>
        <div class="nome">${esc(p.nome)}</div>
        <div class="qtd">${num(p.estoque)} ${esc(p.unidadeMedida || "un")}</div>
        <div class="faixa ${s.cls}">${s.txt}</div>
      </button>`;
    }).join("");
  }

  cats.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    filtroCat = b.dataset.cat; desenhar();
  });
  $("[data-busca]", el).addEventListener("input", (e) => { busca = e.target.value.trim(); desenhar(); });
  grade.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    const p = sync.get("produtos", b.dataset.p);
    if (!p) return;
    if (Number(p.estoque || 0) <= 0) { toast("Produto sem estoque", "erro"); return; }
    fluxo = { produto: p, quantidade: Number(p.quantidadePadrao || 1) };
    etapaFuncionario();
  });

  $("[data-menu]", el)?.addEventListener("click", () => {
    const m = modal({
      titulo: "Opções do tablet",
      corpo: `<div class="pilha">
        <button class="btn btn-grande" style="width:100%" data-o="unidade">🏪 Trocar unidade do tablet</button>
        ${estado.gestor ? `<a class="btn btn-grande" style="width:100%" href="#/admin/dashboard" data-o="admin">📊 Painel administrativo</a>` : ""}
        <button class="btn btn-grande" style="width:100%" data-o="sair">🚪 Sair do sistema</button>
      </div>`,
    });
    m.el.addEventListener("click", async (e) => {
      const o = e.target.closest("[data-o]")?.dataset.o; if (!o) return;
      m.fechar();
      if (o === "unidade") escolherUnidade();
      if (o === "sair") await sair();
    });
  });

  // ---------------------------------------------------------- etapas (sobrepostas)
  let camada = null;
  function abrirEtapa(titulo, passo, conteudo, aoVoltar) {
    fecharEtapa();
    camada = document.createElement("div");
    camada.className = "op-etapa";
    const p = fluxo.produto;
    camada.innerHTML = `
      <div class="op-etapa-topo">
        <button class="btn voltar" data-voltar>← Voltar</button>
        <h2>${esc(titulo)}</h2>
        <div class="op-passos">${[1, 2, 3, 4].map((i) => `<i class="${i <= passo ? "feito" : ""}"></i>`).join("")}</div>
      </div>
      <div class="op-etapa-corpo">
        <div class="op-resumo-prod">${p.foto ? `<img class="mini-foto" src="${esc(p.foto)}" alt="">` : `<span class="mini-foto">📦</span>`}<b>${esc(p.nome)}</b></div>
        <div data-corpo style="width:100%;display:flex;flex-direction:column;align-items:center"></div>
      </div>`;
    const corpo = $("[data-corpo]", camada);
    if (typeof conteudo === "string") corpo.innerHTML = conteudo; else corpo.appendChild(conteudo);
    $("[data-voltar]", camada).onclick = aoVoltar || cancelar;
    document.body.appendChild(camada);
    return corpo;
  }
  function fecharEtapa() { camada?.remove(); camada = null; }
  function cancelar() { fecharEtapa(); fluxo = null; desenhar(); }

  // 2) quem está retirando
  function etapaFuncionario() {
    const u = unidadeId();
    const pessoas = sync.lista("funcionarios")
      .filter((f) => f.ativo !== false && (!f.unidades?.length || f.unidades.includes(u)))
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    if (!pessoas.length) { toast("Nenhum funcionário cadastrado para esta unidade", "erro"); fluxo = null; return; }
    const corpo = abrirEtapa("Quem está retirando?", 2, `
      <div class="op-pessoas">${pessoas.map((f) => `
        <button class="op-pessoa" data-f="${f.id}">${avatar(f)}<b>${esc(f.nome)}</b></button>`).join("")}
      </div>`);
    corpo.addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]"); if (!b) return;
      fluxo.funcionario = sync.get("funcionarios", b.dataset.f);
      etapaPin();
    });
  }

  // 3) PIN
  function etapaPin() {
    const f = fluxo.funcionario;
    let pin = "";
    let validando = false;
    const corpo = abrirEtapa("Digite seu PIN", 3, `
      <div class="op-pin">
        <div class="pessoa">${avatar(f)}${esc(f.nome)}</div>
        <div class="pontos" data-pontos>${"<i></i>".repeat(4)}</div>
        <div class="pin-erro" data-erro></div>
        <div class="teclado">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="tecla" data-t="${n}">${n}</button>`).join("")}
          <button class="tecla acao" data-t="limpar">Limpar</button>
          <button class="tecla" data-t="0">0</button>
          <button class="tecla acao" data-t="apagar">⌫</button>
        </div>
      </div>`, etapaFuncionario);
    const pontos = $("[data-pontos]", corpo);
    const erroEl = $("[data-erro]", corpo);
    const pintar = () => $$("i", pontos).forEach((i, k) => i.classList.toggle("cheio", k < pin.length));

    const bloqueado = () => {
      const b = bloqueios[f.id];
      if (b?.ate > Date.now()) { erroEl.textContent = `Muitas tentativas. Aguarde ${Math.ceil((b.ate - Date.now()) / 1000)}s.`; return true; }
      return false;
    };
    bloqueado();

    corpo.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-t]")?.dataset.t; if (!t || validando) return;
      if (bloqueado()) return;
      erroEl.textContent = ""; pontos.classList.remove("erro");
      if (t === "limpar") pin = "";
      else if (t === "apagar") pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += t;
      pintar();
      if (pin.length === 4) {
        validando = true;
        const ok = await conferirPin(pin, f);
        validando = false;
        if (ok) {
          delete bloqueios[f.id];
          if (fluxo.produto.quantidadeVariavel) etapaQuantidade(); else etapaConfirmar();
        } else {
          const b = bloqueios[f.id] || { erros: 0 };
          b.erros += 1;
          if (b.erros >= 5) { b.ate = Date.now() + 60000; b.erros = 0; }
          bloqueios[f.id] = b;
          pin = ""; pintar();
          pontos.classList.add("erro");
          erroEl.textContent = f.pinHash ? "PIN incorreto. Tente novamente." : "Funcionário sem PIN cadastrado. Fale com o gestor.";
          bloqueado();
        }
      }
    });
  }

  // 3b) quantidade (só para produtos de quantidade variável: carne em kg etc.)
  function etapaQuantidade() {
    const p = fluxo.produto;
    let txt = "";
    const corpo = abrirEtapa("Quantidade", 3, `
      <div class="op-qtd">
        <div class="visor"><span data-visor>0</span><small>${esc(p.unidadeMedida || "un")}</small></div>
        <div class="teclado">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="tecla" data-t="${n}">${n}</button>`).join("")}
          <button class="tecla" data-t=",">,</button>
          <button class="tecla" data-t="0">0</button>
          <button class="tecla acao" data-t="apagar">⌫</button>
        </div>
        <button class="btn btn-pri btn-grande" data-ok style="min-width:320px">Continuar</button>
      </div>`, etapaPin);
    const visor = $("[data-visor]", corpo);
    corpo.addEventListener("click", (e) => {
      if (e.target.closest("[data-ok]")) {
        const q = paraNumero(txt);
        if (!(q > 0)) return toast("Digite a quantidade", "erro");
        fluxo.quantidade = q; etapaConfirmar(); return;
      }
      const t = e.target.closest("[data-t]")?.dataset.t; if (!t) return;
      if (t === "apagar") txt = txt.slice(0, -1);
      else if (t === ",") { if (!txt.includes(",")) txt = (txt || "0") + ","; }
      else if (txt.replace(",", "").length < 6) txt += t;
      visor.textContent = txt || "0";
    });
  }

  // 4) confirmação
  function etapaConfirmar() {
    const p = sync.get("produtos", fluxo.produto.id) || fluxo.produto;
    fluxo.produto = p;
    const un = p.unidadeMedida || "un";
    const passo = p.quantidadeVariavel ? 0.5 : 1;
    const corpo = abrirEtapa("Confirmar retirada", 4, `
      <div class="op-confirma">
        <dl>
          <dt>Produto</dt><dd>${esc(p.nome)}</dd>
          <dt>Quantidade</dt><dd class="qtd-linha"><button class="btn" data-menos>−</button><span data-q></span><button class="btn" data-mais>+</button></dd>
          <dt>Funcionário</dt><dd>${esc(fluxo.funcionario.nome)}</dd>
          <dt>Estoque atual</dt><dd>${num(p.estoque)} ${esc(un)}</dd>
          <dt>Estoque após retirada</dt><dd class="depois" data-depois></dd>
        </dl>
        <div class="pin-erro" data-erro style="text-align:center;margin-bottom:10px"></div>
        <button class="btn btn-pri btn-grande" data-confirmar>✓ CONFIRMAR RETIRADA</button>
      </div>`, () => (p.quantidadeVariavel ? etapaQuantidade() : etapaPin()));

    const atualizar = () => {
      const depois = Number(p.estoque || 0) - fluxo.quantidade;
      $("[data-q]", corpo).textContent = `${num(fluxo.quantidade, 3)} ${un}`;
      $("[data-depois]", corpo).textContent = `${num(depois)} ${un}`;
      const btn = $("[data-confirmar]", corpo);
      const falta = depois < 0;
      btn.disabled = falta;
      $("[data-erro]", corpo).textContent = falta ? "Quantidade maior que o estoque. Avise o gestor." : "";
    };
    atualizar();
    $("[data-menos]", corpo).onclick = () => { fluxo.quantidade = Math.max(passo, fluxo.quantidade - passo); atualizar(); };
    $("[data-mais]", corpo).onclick = () => { fluxo.quantidade += passo; atualizar(); };
    $("[data-confirmar]", corpo).onclick = (e) => {
      e.currentTarget.disabled = true;
      try {
        const r = registrarRetirada({ produto: p, funcionario: fluxo.funcionario, quantidade: fluxo.quantidade });
        sucesso(r.posterior);
      } catch (err) { toast(err.message, "erro"); e.currentTarget.disabled = false; }
    };
  }

  function sucesso(restante) {
    const { produto: p, funcionario: f, quantidade } = fluxo;
    fecharEtapa();
    const seg = Number(estado.config().voltarAposSegundos || 4);
    const tela = document.createElement("div");
    tela.className = "op-sucesso";
    tela.innerHTML = `
      <div class="check">✓</div>
      <h2>RETIRADA REGISTRADA</h2>
      <p>${esc(p.nome)} — ${num(quantidade, 3)} ${esc(p.unidadeMedida || "un")}</p>
      <p>${esc(f.nome)}</p>
      <div class="restante">Estoque restante: <b>${num(restante)} ${esc(p.unidadeMedida || "un")}</b></div>
      <div class="contador" style="animation-duration:${seg}s"></div>`;
    const voltar = () => { clearTimeout(timerVolta); tela.remove(); fluxo = null; busca = ""; const i = $("[data-busca]", el); if (i) i.value = ""; desenhar(); };
    tela.onclick = voltar;
    document.body.appendChild(tela);
    timerVolta = setTimeout(voltar, seg * 1000);
  }

  // ---------------------------------------------------------- tempo real
  const pararSync = sync.on((col) => {
    if (!fluxo && ["produtos", "unidades", "*", "status", "empresa"].includes(col)) desenhar();
  });
  desenhar();
  if (!unidadeId() && estado.unidadesPermitidas().length > 1) escolherUnidade(true);

  return () => {
    pararSync(); clearTimeout(timerVolta); fecharEtapa(); $(".op-sucesso")?.remove(); capa?.remove();
    document.removeEventListener("pointerdown", aoTocar, true);
    document.removeEventListener("fullscreenchange", aoMudarTela);
    document.removeEventListener("webkitfullscreenchange", aoMudarTela);
    travaTela?.release?.().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
}
