// CONFIGURAÇÕES — regras da previsão, tablet, categorias e cache
import { sync } from "../../core/sync.js";
import { estado } from "../../core/estado.js";
import { salvarEmpresa } from "../../core/db.js";
import { $, esc, toast, confirmar, paraNumero } from "../../core/util.js";
import { categorias } from "./componentes.js";

function render(el) {
  const emp = sync.empresa() || {};
  const cfg = estado.config();
  el.innerHTML = `
  <div class="pilha" style="max-width:820px">
    <form class="card pilha" data-form>
      <h2>🏢 Empresa</h2>
      <label class="campo"><span>Nome da empresa</span><input name="nome" value="${esc(emp.nome || "")}"></label>

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

  $("[data-form]", el).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const cats = f.categorias.value.split("\n").map((s) => s.trim()).filter(Boolean);
    salvarEmpresa({
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
