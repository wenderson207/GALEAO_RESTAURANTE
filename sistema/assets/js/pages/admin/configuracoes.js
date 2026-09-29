// CONFIGURAÇÕES — regras da previsão, tablet, categorias e cache
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { salvarEmpresa } from "../../core/db.js";
import { $, esc, toast, confirmar, paraNumero, lerForm, ligarMascaras, ligarCep, ligarCnpj, camposEndereco, comprimirPorTipo, IMAGENS } from "../../core/util.js";
import { categorias } from "./componentes.js";

function render(el) {
  const emp = sync.empresa() || {};
  const cfg = estado.config();
  el.innerHTML = `
  <div class="pilha" style="max-width:820px">
    <form class="card pilha" data-form>
      <h2>🏢 Empresa</h2>
      <div class="foto-upload">
        <div class="preview" data-preview style="background:#fff">${emp.logo ? `<img src="${esc(emp.logo)}" alt="" style="object-fit:contain">` : "🏢"}</div>
        <div class="pilha" style="margin:0"><div class="linha"><label class="btn btn-sec">Enviar logo<input type="file" accept="image/*" data-logo hidden></label>
          <button type="button" class="btn btn-texto" data-sem-logo ${emp.logo ? "" : "hidden"}>Remover</button></div>
          <small class="muted">${IMAGENS.logo.dica} Aparece no menu e no tablet.</small></div>
      </div>
      <div class="form-grade" data-dados>
        <label class="campo campo-largo"><span>Nome da empresa</span><input name="nome" value="${esc(emp.nome || "")}"></label>
        <label class="campo campo-largo"><span>CNPJ</span><input name="cnpj" data-mascara="cnpj" value="${esc(emp.cnpj || "")}"></label>
        <label class="campo campo-largo"><span>Razão social</span><input name="razaoSocial" value="${esc(emp.razaoSocial || "")}"></label>
        <label class="campo"><span>Telefone</span><input name="telefone" data-mascara="telefone" value="${esc(emp.telefone || "")}"></label>
        <label class="campo"><span>E-mail</span><input name="email" type="email" value="${esc(emp.email || "")}"></label>
        ${camposEndereco(emp)}
      </div>

      <h2 style="margin-top:10px">📈 Previsão de reposição</h2>
      <div class="form-grade">
        <label class="campo"><span>Período usado no cálculo do consumo médio</span>
          <select name="periodoCalculo">${[7, 15, 30, 60].map((d) => `<option value="${d}" ${d === Number(cfg.periodoCalculo) ? "selected" : ""}>Últimos ${d} dias</option>`).join("")}</select>
          <small>7 dias reage rápido a mudanças; 30 dias é mais estável.</small></label>
        <label class="campo"><span>Cobertura padrão (dias)</span>
          <select name="coberturaPadrao">${[7, 15, 30].map((d) => `<option value="${d}" ${d === Number(cfg.coberturaPadrao) ? "selected" : ""}>${d} dias</option>`).join("")}</select>
          <small>Para quantos dias o sistema sugere comprar (cada produto pode ter o seu).</small></label>
      </div>

      <h2 style="margin-top:10px">📱 Tablet</h2>
      <label class="campo" style="max-width:320px"><span>Voltar para a tela inicial após a retirada (segundos)</span>
        <input name="voltarAposSegundos" inputmode="numeric" value="${esc(cfg.voltarAposSegundos)}"></label>

      <h2 style="margin-top:10px">🏷️ Categorias</h2>
      <label class="campo"><span>Uma por linha</span><textarea name="categorias" rows="7">${esc(categorias().join("\n"))}</textarea></label>

      <div><button class="btn btn-pri">Salvar configurações</button></div>
    </form>

    <div class="card pilha">
      <h2>💾 Cache e economia de leituras</h2>
      <p class="muted" style="margin:0">Este aparelho guarda uma cópia dos dados. Ao abrir o sistema, só o que mudou desde a última vez é baixado do Firebase — cada alteração custa 1 leitura, e não a lista inteira.</p>
      <p class="muted pequeno" style="margin:0">Produtos em cache: <b>${sync.lista("produtos").length}</b> · Movimentações em cache: <b>${sync.lista("movimentacoes").length}</b> · Dias de consumo: <b>${sync.lista("consumoDiario").length}</b></p>
      <div><button class="btn btn-sec" data-limpar>Limpar cache deste aparelho</button></div>
      <small class="muted">Use só se algo parecer errado. Na próxima abertura tudo será baixado de novo (consome leituras).</small>
    </div>
  </div>`;

  const dadosEl = $("[data-dados]", el);
  ligarMascaras(dadosEl); ligarCep(dadosEl); ligarCnpj(dadosEl);
  let logo = emp.logo || "";
  const inLogo = $("[data-logo]", el), semLogo = $("[data-sem-logo]", el), prev = $("[data-preview]", el);
  inLogo.onchange = async () => {
    if (!inLogo.files[0]) return;
    try { logo = await comprimirPorTipo(inLogo.files[0], "logo"); prev.innerHTML = `<img src="${logo}" alt="" style="object-fit:contain">`; semLogo.hidden = false; toast("Logo carregada — clique em Salvar"); }
    catch (err) { toast(err.message, "erro"); }
  };
  semLogo.onclick = () => { logo = ""; prev.textContent = "🏢"; semLogo.hidden = true; };

  $("[data-form]", el).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const cats = f.categorias.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const d = lerForm(dadosEl);
    salvarEmpresa({
      ...d, uf: (d.uf || "").toUpperCase(), logo,
      nome: f.nome.value.trim() || emp.nome,
      categorias: cats,
      config: {
        periodoCalculo: Number(f.periodoCalculo.value),
        coberturaPadrao: Number(f.coberturaPadrao.value),
        voltarAposSegundos: Math.min(30, Math.max(2, paraNumero(f.voltarAposSegundos.value) || 4)),
      },
    });
    toast("Configurações salvas");
  };
  $("[data-limpar]", el).onclick = async () => {
    if (!(await confirmar("Limpar cache", "Os dados serão baixados novamente do Firebase na próxima abertura. Continuar?", "Limpar"))) return;
    sync.parar();
    await sync.limparCache();
    try { Object.keys(localStorage).filter((k) => k.startsWith("historicoDesde")).forEach((k) => localStorage.removeItem(k)); } catch {}
    location.reload();
  };
}

export default { render, semAutoRefresh: true };
