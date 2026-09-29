// =====================================================================
// PREVISÃO DE REPOSIÇÃO (cálculos puros — sem acesso ao banco)
//
// Consumo médio diário   = consumo no período ÷ dias do período
// Dias de estoque        = estoque atual ÷ consumo médio
// Dias até comprar       = (estoque − segurança) ÷ consumo médio − prazo do fornecedor
//                          (≤ 1 dia de folga => "Comprar agora")
// Quantidade sugerida    = consumo médio × cobertura desejada + segurança − estoque atual
//
// Tudo é ESTIMATIVA. Com poucos dias de histórico, o sistema avisa e não inventa consumo.
// =====================================================================
const DIA = 86400000;
export const MIN_DIAS_DADOS = 3;
// 1 dia de folga: o pedido precisa ser feito antes do estoque chegar exatamente no prazo do fornecedor
const MARGEM_DIAS = 1;

export function chaveDia(data = new Date()) {
  const d = new Date(data);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function inicioDoDia(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

// Soma o consumo de um produto nos dias COMPLETOS [hoje-janela, ontem]
export function consumoNoPeriodo(produto, consumoDiario, janela, agora = Date.now()) {
  const hoje0 = inicioDoDia(agora);
  const inicio = hoje0 - janela * DIA;
  const criado = produto.criadoEm ? inicioDoDia(produto.criadoEm) : inicio;
  const inicioReal = Math.max(inicio, criado);
  const dias = Math.max(0, Math.round((hoje0 - inicioReal) / DIA));
  const chInicio = chaveDia(inicioReal);
  const chFim = chaveDia(hoje0 - DIA);
  let total = 0;
  for (const cd of consumoDiario) {
    if (cd.unidadeId !== produto.unidadeId) continue;
    if (cd.dia < chInicio || cd.dia > chFim) continue;
    total += Number(cd.itens?.[produto.id] || 0);
  }
  return { total, dias };
}

const ORDEM = { sem: 0, comprar: 1, baixo: 2, breve3: 3, breve7: 4, normal: 5, semdados: 6 };
export const STATUS = {
  sem:      { rotulo: "Sem estoque",        cor: "vermelho", icone: "🔴" },
  comprar:  { rotulo: "Comprar agora",      cor: "laranja",  icone: "🟠" },
  baixo:    { rotulo: "Estoque baixo",      cor: "amarelo",  icone: "🟡" },
  breve3:   { rotulo: "Comprar em breve",   cor: "amarelo",  icone: "🟡" },
  breve7:   { rotulo: "Atenção",            cor: "azul",     icone: "🔵" },
  normal:   { rotulo: "Normal",             cor: "verde",    icone: "🟢" },
  semdados: { rotulo: "Sem dados",          cor: "cinza",    icone: "⚪" },
};

// Em quantos dias (aprox.) o pedido deve ser feito
export function diasParaComprar(p) {
  if (p.diasAteComprar === null || p.diasAteComprar === undefined) return null;
  return Math.max(0, Math.floor(p.diasAteComprar - MARGEM_DIAS));
}

export function arred(n, casas = 1) { const f = 10 ** casas; return Math.round(n * f) / f; }

export function calcularPrevisao(produto, consumoDiario, cfg = {}, agora = Date.now()) {
  const janela = Number(cfg.periodoCalculo || 30);
  const estoque = Number(produto.estoque || 0);
  const minimo = Number(produto.estoqueMinimo || 0);
  const seguranca = Number(produto.estoqueSeguranca || 0);
  const prazo = Number(produto.prazoFornecedor || 0);
  const cobertura = Number(produto.coberturaDias || cfg.coberturaPadrao || 15);
  const minCompra = Number(produto.compraMinima || 0);

  const { total, dias } = consumoNoPeriodo(produto, consumoDiario, janela, agora);
  const temDados = dias >= MIN_DIAS_DADOS;
  const media = temDados ? total / dias : null;

  // comparação 7 x 30 dias para alerta de "consumo acima da média"
  let acimaDaMedia = null;
  const c7 = consumoNoPeriodo(produto, consumoDiario, 7, agora);
  const c30 = consumoNoPeriodo(produto, consumoDiario, 30, agora);
  if (c7.dias >= 7 && c30.dias >= 14 && c30.total > 0) {
    const m7 = c7.total / c7.dias, m30 = c30.total / c30.dias;
    const pct = Math.round((m7 / m30 - 1) * 100);
    if (pct >= 25) acimaDaMedia = pct;
  }

  let diasRestantes = null, diasAteComprar = null, sugerida = null;
  if (media && media > 0) {
    diasRestantes = estoque / media;
    diasAteComprar = (estoque - seguranca) / media - prazo;
    const desejado = media * cobertura + seguranca;
    sugerida = Math.max(0, desejado - estoque);
    if (sugerida > 0 && minCompra > 0) sugerida = Math.max(sugerida, minCompra);
    sugerida = produto.quantidadeVariavel ? arred(sugerida, 1) : Math.ceil(sugerida);
  } else if (estoque <= minimo && minCompra > 0) {
    // sem consumo conhecido não inventamos número: usa só a compra mínima configurada
    sugerida = minCompra;
  }

  let st;
  if (estoque <= 0) st = "sem";
  else if (diasAteComprar !== null && diasAteComprar <= MARGEM_DIAS) st = "comprar";
  else if (estoque <= minimo) st = "baixo";
  else if (diasAteComprar !== null && diasAteComprar <= 3) st = "breve3";
  else if (diasAteComprar !== null && diasAteComprar <= 7) st = "breve7";
  else if (!temDados) st = "semdados";
  else st = "normal";

  return {
    produto, estoque, minimo, seguranca, prazo, cobertura,
    total, dias, temDados, media, diasRestantes, diasAteComprar, sugerida,
    acimaDaMedia, status: st, ordem: ORDEM[st], info: STATUS[st],
  };
}

// Frases simples explicando a recomendação (item 35 do escopo)
export function explicar(p, un = "un") {
  const f = [];
  const fmt = (n) => arred(n, 1).toLocaleString("pt-BR");
  f.push(`Você possui ${fmt(p.estoque)} ${un}.`);
  if (!p.temDados) {
    f.push("Nossa previsão ficará mais precisa após alguns dias de utilização.");
    if (p.estoque <= p.minimo) f.push(`O estoque está no mínimo configurado (${fmt(p.minimo)} ${un}).`);
    return f;
  }
  if (!p.media) {
    f.push(`Não houve retiradas nos últimos ${p.dias} dias.`);
    return f;
  }
  f.push(`Seu consumo médio é de ${fmt(p.media)} ${un} por dia (últimos ${p.dias} dias).`);
  f.push(`Isso dá para aproximadamente ${Math.floor(p.diasRestantes)} dia(s).`);
  if (p.prazo) f.push(`Seu fornecedor leva aproximadamente ${p.prazo} dia(s) para entregar.`);
  if (p.seguranca) f.push(`Você quer manter sempre ${fmt(p.seguranca)} ${un} de segurança.`);
  if (p.status === "comprar" || p.status === "sem") f.push("Recomendamos realizar a compra agora.");
  else if (p.diasAteComprar !== null) f.push(`Previsão de compra: em aproximadamente ${diasParaComprar(p)} dia(s).`);
  if (p.sugerida) f.push(`Quantidade sugerida: ${fmt(p.sugerida)} ${un} (cobertura de ${p.cobertura} dias).`);
  return f;
}

export function previsoesDaUnidade(produtos, consumoDiario, cfg, unidadeId) {
  return produtos
    .filter((p) => p.ativo !== false && (!unidadeId || p.unidadeId === unidadeId))
    .map((p) => calcularPrevisao(p, consumoDiario, cfg))
    .sort((a, b) => a.ordem - b.ordem || (a.diasAteComprar ?? 999) - (b.diasAteComprar ?? 999));
}
