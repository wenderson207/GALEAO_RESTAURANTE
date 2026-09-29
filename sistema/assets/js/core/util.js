// =====================================================================
// Utilidades de interface: DOM, formatação, avisos, modais, imagens e PIN
// =====================================================================

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function num(v, casas = 2) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}
export function moeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function dataHora(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function data(ms) { return ms ? new Date(ms).toLocaleDateString("pt-BR") : "—"; }
export function hora(ms) { return ms ? new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"; }
export function paraNumero(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
export function inputData(ms = Date.now()) {
  const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function unidadeTexto(qtd, produto) {
  const un = produto?.unidadeMedida || "un";
  return `${num(qtd, produto?.quantidadeVariavel ? 3 : 2)} ${un}`;
}

export function iniciais(nome) {
  return String(nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function idNovo() {
  const a = crypto.getRandomValues(new Uint8Array(10));
  return [...a].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

// ------------------------------------------------ Avisos rápidos
export function toast(msg, tipo = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add("sair"), 2600);
  setTimeout(() => t.remove(), 3000);
}

// ------------------------------------------------ Modal simples
export function modal({ titulo, corpo, acoes = [], largo = false, aoAbrir }) {
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  fundo.innerHTML = `
    <div class="modal ${largo ? "modal-largo" : ""}" role="dialog" aria-modal="true">
      <div class="modal-topo"><h3>${esc(titulo)}</h3><button class="btn-icone" data-fechar aria-label="Fechar">✕</button></div>
      <div class="modal-corpo"></div>
      <div class="modal-acoes"></div>
    </div>`;
  const corpoEl = $(".modal-corpo", fundo);
  if (typeof corpo === "string") corpoEl.innerHTML = corpo; else if (corpo) corpoEl.appendChild(corpo);
  const fechar = () => fundo.remove();
  const acoesEl = $(".modal-acoes", fundo);
  acoes.forEach((a) => {
    const b = document.createElement("button");
    b.className = `btn ${a.classe || ""}`;
    b.textContent = a.texto;
    b.onclick = async () => {
      if (!a.onClick) return fechar();
      b.disabled = true;
      try { const r = await a.onClick(fundo); if (r !== false) fechar(); }
      catch (e) { toast(e.message || "Erro", "erro"); console.error(e); }
      finally { b.disabled = false; }
    };
    acoesEl.appendChild(b);
  });
  fundo.addEventListener("click", (e) => { if (e.target === fundo || e.target.closest("[data-fechar]")) fechar(); });
  document.body.appendChild(fundo);
  aoAbrir?.(fundo);
  return { el: fundo, fechar };
}

export function confirmar(titulo, texto, textoBotao = "Confirmar") {
  return new Promise((res) => {
    const m = modal({
      titulo, corpo: `<p>${esc(texto)}</p>`,
      acoes: [
        { texto: "Cancelar", classe: "btn-sec", onClick: () => res(false) },
        { texto: textoBotao, classe: "btn-pri", onClick: () => res(true) },
      ],
    });
    m.el.addEventListener("click", (e) => { if (e.target === m.el) res(false); });
  });
}

// ------------------------------------------------ Formulários
export function lerForm(form) {
  const r = {};
  $$("[name]", form).forEach((el) => {
    if (el.type === "checkbox") r[el.name] = el.checked;
    else if (el.dataset.tipo === "numero") r[el.name] = paraNumero(el.value);
    else r[el.name] = el.value.trim();
  });
  return r;
}

// ------------------------------------------------ Imagem
// Tamanhos que o sistema GUARDA (a foto enviada pode ser maior; é reduzida aqui).
// Tudo fica dentro do próprio documento (sem Firebase Storage, que exige plano pago).
export const IMAGENS = {
  produto:     { lado: 480, quadrado: true,  dica: "Foto quadrada (1:1), mínimo 600×600 px. O produto centralizado, fundo limpo." },
  funcionario: { lado: 240, quadrado: true,  dica: "Foto quadrada (1:1), mínimo 400×400 px, rosto no centro (aparece em círculo)." },
  logo:        { lado: 256, quadrado: false, transparente: true, dica: "Logo quadrada, 512×512 px, PNG com fundo transparente." },
};

// quadrado=true recorta o centro para 1:1 (o que aparece no tablet é exatamente o que você vê aqui)
export function comprimirImagem(arquivo, lado = 320, qualidade = 0.8, { quadrado = false, transparente = false } = {}) {
  return new Promise((resolve, reject) => {
    if (arquivo.size > 15 * 1024 * 1024) return reject(new Error("Imagem muito grande (máx. 15 MB)"));
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (quadrado) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
      const fator = Math.min(1, lado / Math.max(sw, sh));
      const w = Math.round(sw * fator), h = Math.round(sh * fator);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!transparente) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let dataUrl = c.toDataURL("image/webp", qualidade);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = transparente ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", qualidade);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}
export function comprimirPorTipo(arquivo, tipo) {
  const c = IMAGENS[tipo];
  return comprimirImagem(arquivo, c.lado, 0.8, c);
}

// ------------------------------------------------ Máscaras (CPF/CNPJ, CEP, telefone)
export const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const MASCARAS = {
  cep: (d) => d.slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2"),
  cnpj: (d) => d.slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"),
  telefone: (d) => {
    d = d.slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  },
};
export function formatar(tipo, v) { return v ? MASCARAS[tipo](soDigitos(v)) : ""; }
// Aplica máscara em todo input com data-mascara="cep|cnpj|telefone" dentro de raiz
export function ligarMascaras(raiz) {
  $$("[data-mascara]", raiz).forEach((i) => {
    const f = MASCARAS[i.dataset.mascara]; if (!f) return;
    i.inputMode = "numeric";
    const aplicar = () => { i.value = f(soDigitos(i.value)); };
    i.addEventListener("input", aplicar); aplicar();
  });
}

// ------------------------------------------------ Endereço pelo CEP (ViaCEP, gratuito)
// Campos esperados no formulário: cep, logradouro, numero, bairro, cidade, uf
export async function buscarCep(cep) {
  const d = soDigitos(cep);
  if (d.length !== 8) throw new Error("CEP deve ter 8 números");
  const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
  const j = await r.json();
  if (j.erro) throw new Error("CEP não encontrado");
  return { logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf, complemento: j.complemento };
}
export function ligarCep(form) {
  const cep = form.querySelector("[name=cep]"); if (!cep) return;
  let ultimo = "";
  const status = document.createElement("small");
  cep.insertAdjacentElement("afterend", status);
  cep.addEventListener("input", async () => {
    const d = soDigitos(cep.value);
    if (d.length !== 8 || d === ultimo) return;
    ultimo = d; status.textContent = "Buscando endereço…";
    try {
      const e = await buscarCep(d);
      for (const k of ["logradouro", "bairro", "cidade", "uf"]) {
        const campo = form.querySelector(`[name=${k}]`);
        if (campo && e[k]) campo.value = e[k];
      }
      status.textContent = "✓ Endereço preenchido";
      form.querySelector("[name=numero]")?.focus();
    } catch (err) { status.textContent = err.message.includes("fetch") ? "Sem internet para buscar o CEP" : err.message; }
  });
}

// ------------------------------------------------ Dados pelo CNPJ (BrasilAPI, gratuito)
export async function buscarCnpj(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14) throw new Error("CNPJ deve ter 14 números");
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  if (!r.ok) throw new Error("CNPJ não encontrado");
  const j = await r.json();
  return {
    razaoSocial: j.razao_social || "", nomeFantasia: j.nome_fantasia || "",
    telefone: formatar("telefone", j.ddd_telefone_1 || ""), email: (j.email || "").toLowerCase(),
    cep: formatar("cep", j.cep || ""), logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
    numero: j.numero || "", complemento: j.complemento || "", bairro: j.bairro || "", cidade: j.municipio || "", uf: j.uf || "",
  };
}
// Botão "Buscar" ao lado do CNPJ: preenche só os campos vazios
export function ligarCnpj(form) {
  const campo = form.querySelector("[name=cnpj]"); if (!campo) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "btn btn-sec btn-pequeno"; btn.textContent = "🔎 Buscar dados do CNPJ";
  const status = document.createElement("small");
  campo.insertAdjacentElement("afterend", btn); btn.insertAdjacentElement("afterend", status);
  btn.onclick = async () => {
    status.textContent = "Consultando…"; btn.disabled = true;
    try {
      const d = await buscarCnpj(campo.value);
      for (const [k, v] of Object.entries(d)) {
        const el = form.querySelector(`[name=${k}]`);
        if (el && v && !el.value.trim()) el.value = v;
      }
      status.textContent = "✓ Dados preenchidos (confira)";
    } catch (e) { status.textContent = e.message.includes("fetch") ? "Sem internet para consultar" : e.message; }
    finally { btn.disabled = false; }
  };
}

// Bloco de endereço reutilizável (qualquer cadastro)
export function camposEndereco(d = {}) {
  const v = (k) => esc(d[k] || "");
  return `
    <div class="form-secao">Endereço</div>
    <label class="campo"><span>CEP</span><input name="cep" data-mascara="cep" value="${v("cep")}" placeholder="00000-000"></label>
    <label class="campo campo-largo"><span>Rua / Avenida</span><input name="logradouro" value="${v("logradouro")}"></label>
    <label class="campo"><span>Número</span><input name="numero" value="${v("numero")}"></label>
    <label class="campo"><span>Complemento</span><input name="complemento" value="${v("complemento")}"></label>
    <label class="campo"><span>Bairro</span><input name="bairro" value="${v("bairro")}"></label>
    <label class="campo"><span>Cidade</span><input name="cidade" value="${v("cidade")}"></label>
    <label class="campo"><span>UF</span><input name="uf" maxlength="2" value="${v("uf")}" style="text-transform:uppercase"></label>`;
}
export function enderecoTexto(d = {}) {
  const l1 = [d.logradouro, d.numero].filter(Boolean).join(", ");
  const l2 = [d.bairro, [d.cidade, d.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ");
  return [l1 + (d.complemento ? " " + d.complemento : ""), l2, d.cep].filter(Boolean).join(" · ");
}

// ------------------------------------------------ Impressão
// Imprime só o HTML passado (o resto da tela é escondido pelo CSS @media print)
export function imprimir(html, titulo = "") {
  document.getElementById("impressao")?.remove();
  const area = document.createElement("div");
  area.id = "impressao";
  area.innerHTML = html;
  document.body.appendChild(area);
  document.body.classList.add("imprimindo");
  const tituloAntigo = document.title;
  if (titulo) document.title = titulo;
  const fim = () => { document.body.classList.remove("imprimindo"); area.remove(); document.title = tituloAntigo; };
  window.addEventListener("afterprint", fim, { once: true });
  setTimeout(() => window.print(), 50);
}

// ------------------------------------------------ PIN (nunca guardado em texto)
// PBKDF2-SHA256 com sal aleatório por funcionário e 120 mil iterações.
function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function deB64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export async function gerarHashPin(pin, salB64) {
  const sal = salB64 ? deB64(salB64) : crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: 120000, hash: "SHA-256" }, chave, 256);
  return { pinHash: b64(bits), pinSal: salB64 || b64(sal) };
}

export async function conferirPin(pin, funcionario) {
  if (!funcionario?.pinHash || !funcionario?.pinSal) return false;
  const { pinHash } = await gerarHashPin(pin, funcionario.pinSal);
  return pinHash === funcionario.pinHash;
}

export function avatar(pessoa, classe = "") {
  if (pessoa?.foto) return `<img class="avatar ${classe}" src="${esc(pessoa.foto)}" alt="">`;
  return `<span class="avatar avatar-letras ${classe}">${esc(iniciais(pessoa?.nome))}</span>`;
}
