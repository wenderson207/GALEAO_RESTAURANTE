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
// Reduz a foto para ~320px WebP (≈10–25 KB) e guarda dentro do próprio documento.
// Assim não precisa do Firebase Storage (que exige plano pago) e a foto fica no cache.
export function comprimirImagem(arquivo, lado = 320, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const fator = Math.min(1, lado / Math.max(img.width, img.height));
      const w = Math.round(img.width * fator), h = Math.round(img.height * fator);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let dataUrl = c.toDataURL("image/webp", qualidade);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = c.toDataURL("image/jpeg", qualidade);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
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
