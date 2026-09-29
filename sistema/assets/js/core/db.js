// =====================================================================
// Gravações no banco. Toda gravação:
// - carimba atualizadoEm com o horário do servidor (necessário para o sync incremental)
// - é aplicada na tela na hora (otimista) e funciona offline (fila do Firestore)
// - movimentações geram auditoria: quem, o quê, quando, estoque antes/depois, unidade
// =====================================================================
import {
  db, doc, collection, writeBatch, setDoc, updateDoc, serverTimestamp, increment,
  query, where, getDocs,
} from "./firebase.js";
import { sync } from "./sync.js";
import { estado } from "./estado.js";
import { chaveDia } from "./previsao.js";
import { idNovo, toast } from "./util.js";
import { traduzErro } from "./auth.js";

const eid = () => estado.perfil.empresaId;
const ref = (col, id) => doc(db, "empresas", eid(), col, id);

function quemFez() {
  return { usuarioUid: estado.usuario.uid, usuarioNome: estado.perfil.nome || estado.usuario.email };
}

// Confirma no servidor em segundo plano; se falhar (ex.: permissão), avisa.
function enviar(promessa, msgErro = "Não foi possível salvar") {
  promessa.catch((e) => { console.error(e); toast(`${msgErro}: ${traduzErro(e)}`, "erro"); });
  return promessa;
}

function movBase(produto, extra) {
  return {
    produtoId: produto.id, produtoNome: produto.nome, categoria: produto.categoria || "",
    unidadeMedida: produto.unidadeMedida || "un", unidadeId: produto.unidadeId,
    ...quemFez(), dataMs: Date.now(), criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
    ...extra,
  };
}

// ---------------------------------------------------------------- RETIRADA (tablet)
export function registrarRetirada({ produto, funcionario, quantidade }) {
  const q = Number(quantidade);
  if (!(q > 0)) throw new Error("Quantidade inválida");
  const anterior = Number(produto.estoque || 0);
  const posterior = anterior - q;
  const movId = idNovo();
  const dia = chaveDia();
  const lote = writeBatch(db);

  lote.update(ref("produtos", produto.id), { estoque: increment(-q), atualizadoEm: serverTimestamp() });
  lote.set(ref("movimentacoes", movId), movBase(produto, {
    tipo: "saida", quantidade: q, estoqueAnterior: anterior, estoquePosterior: posterior,
    funcionarioId: funcionario.id, funcionarioNome: funcionario.nome, diaLocal: dia,
  }));
  // agregado diário = base barata da previsão (1 documento por unidade por dia)
  lote.set(ref("consumoDiario", `${produto.unidadeId}_${dia}`), {
    unidadeId: produto.unidadeId, dia, itens: { [produto.id]: increment(q) }, atualizadoEm: serverTimestamp(),
  }, { merge: true });

  sync.aplicarLocal("produtos", produto.id, { estoque: posterior });
  if (estado.gestor) {
    sync.aplicarLocal("movimentacoes", movId, { ...movBase(produto, {
      tipo: "saida", quantidade: q, estoqueAnterior: anterior, estoquePosterior: posterior,
      funcionarioId: funcionario.id, funcionarioNome: funcionario.nome, diaLocal: dia,
    }), criadoEm: Date.now() });
    const cdId = `${produto.unidadeId}_${dia}`;
    const cd = sync.get("consumoDiario", cdId) || { unidadeId: produto.unidadeId, dia, itens: {} };
    sync.aplicarLocal("consumoDiario", cdId, { ...cd, itens: { ...cd.itens, [produto.id]: Number(cd.itens?.[produto.id] || 0) + q } });
  }
  enviar(lote.commit(), "Retirada não confirmada no servidor");
  return { anterior, posterior };
}

// ---------------------------------------------------------------- ENTRADA (compra)
export function registrarEntrada({ produto, quantidade, custoUnitario, fornecedorId, dataMs, observacao }) {
  const q = Number(quantidade);
  if (!(q > 0)) throw new Error("Informe a quantidade");
  const anterior = Number(produto.estoque || 0);
  const posterior = anterior + q;
  const fornecedor = fornecedorId ? sync.get("fornecedores", fornecedorId) : null;
  const movId = idNovo();
  const extra = {
    tipo: "entrada", quantidade: q, estoqueAnterior: anterior, estoquePosterior: posterior,
    custoUnitario: Number(custoUnitario || 0), custoTotal: Number(custoUnitario || 0) * q,
    fornecedorId: fornecedorId || "", fornecedorNome: fornecedor?.nome || "",
    dataMs: dataMs || Date.now(), observacao: observacao || "",
  };
  const lote = writeBatch(db);
  const atualiza = { estoque: increment(q), atualizadoEm: serverTimestamp() };
  if (extra.custoUnitario > 0) atualiza.custo = extra.custoUnitario;
  if (fornecedorId) atualiza.fornecedorId = fornecedorId;
  lote.update(ref("produtos", produto.id), atualiza);
  lote.set(ref("movimentacoes", movId), movBase(produto, extra));

  sync.aplicarLocal("produtos", produto.id, { estoque: posterior, ...(extra.custoUnitario > 0 ? { custo: extra.custoUnitario } : {}), ...(fornecedorId ? { fornecedorId } : {}) });
  sync.aplicarLocal("movimentacoes", movId, { ...movBase(produto, extra), criadoEm: Date.now() });
  return enviar(lote.commit(), "Entrada não salva");
}

// ---------------------------------------------------------------- AJUSTE (contagem física)
export function registrarAjuste({ produto, novoEstoque, motivo }) {
  const novo = Number(novoEstoque);
  if (!(novo >= 0)) throw new Error("Informe a quantidade contada");
  if (!motivo) throw new Error("Informe o motivo do ajuste");
  const anterior = Number(produto.estoque || 0);
  const movId = idNovo();
  const extra = {
    tipo: "ajuste", quantidade: novo - anterior, estoqueAnterior: anterior, estoquePosterior: novo, motivo,
  };
  const lote = writeBatch(db);
  lote.update(ref("produtos", produto.id), { estoque: novo, atualizadoEm: serverTimestamp() });
  lote.set(ref("movimentacoes", movId), movBase(produto, extra));
  sync.aplicarLocal("produtos", produto.id, { estoque: novo });
  sync.aplicarLocal("movimentacoes", movId, { ...movBase(produto, extra), criadoEm: Date.now() });
  return enviar(lote.commit(), "Ajuste não salvo");
}

// ---------------------------------------------------------------- PRODUTOS
const CAMPOS_PRODUTO = [
  "nome", "foto", "categoria", "unidadeMedida", "estoqueMinimo", "estoqueSeguranca", "fornecedorId",
  "prazoFornecedor", "coberturaDias", "quantidadePadrao", "quantidadeVariavel", "compraMinima",
  "custo", "ativo", "unidadeId",
];

export function salvarProduto(dados, id) {
  const limpo = {};
  CAMPOS_PRODUTO.forEach((c) => { if (c in dados) limpo[c] = dados[c]; });
  if (!limpo.nome) throw new Error("Informe o nome do produto");
  if (!limpo.unidadeId) throw new Error("Escolha o restaurante/unidade");

  if (id) {
    const lote = writeBatch(db);
    lote.update(ref("produtos", id), { ...limpo, atualizadoEm: serverTimestamp() });
    sync.aplicarLocal("produtos", id, limpo);
    return enviar(lote.commit(), "Produto não salvo");
  }

  // Produto novo: o estoque inicial entra como AJUSTE para ficar na auditoria
  const novoId = idNovo();
  const inicial = Number(dados.estoqueInicial || 0);
  const produto = { ...limpo, estoque: inicial, ativo: limpo.ativo !== false };
  const lote = writeBatch(db);
  lote.set(ref("produtos", novoId), { ...produto, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  sync.aplicarLocal("produtos", novoId, { ...produto, criadoEm: Date.now() });
  if (inicial > 0) {
    const movId = idNovo();
    const mov = movBase({ ...produto, id: novoId }, {
      tipo: "ajuste", quantidade: inicial, estoqueAnterior: 0, estoquePosterior: inicial, motivo: "Estoque inicial (cadastro)",
    });
    lote.set(ref("movimentacoes", movId), mov);
    sync.aplicarLocal("movimentacoes", movId, { ...mov, criadoEm: Date.now() });
  }
  return enviar(lote.commit(), "Produto não salvo");
}

// ---------------------------------------------------------------- CADASTROS SIMPLES
function salvarSimples(col, dados, id) {
  const docId = id || idNovo();
  const novo = !id;
  const payload = { ...dados, atualizadoEm: serverTimestamp(), ...(novo ? { criadoEm: serverTimestamp() } : {}) };
  sync.aplicarLocal(col, docId, { ...dados, ...(novo ? { criadoEm: Date.now() } : {}) });
  return enviar(setDoc(ref(col, docId), payload, { merge: true }), "Cadastro não salvo").then(() => docId);
}

export const salvarUnidade = (d, id) => salvarSimples("unidades", d, id);
export const salvarFornecedor = (d, id) => salvarSimples("fornecedores", d, id);
export const salvarFuncionario = (d, id) => salvarSimples("funcionarios", d, id);

// ---------------------------------------------------------------- EMPRESA / CONFIG
export function salvarEmpresa(parcial) {
  sync.aplicarEmpresaLocal(parcial);
  return enviar(updateDoc(doc(db, "empresas", eid()), { ...parcial, atualizadoEm: serverTimestamp() }), "Configuração não salva");
}

// ---------------------------------------------------------------- ACESSOS (sob demanda)
export async function listarAcessos() {
  const snap = await getDocs(query(collection(db, "usuarios"), where("empresaId", "==", eid())));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export function atualizarAcesso(uid, parcial) {
  return updateDoc(doc(db, "usuarios", uid), { ...parcial, atualizadoEm: serverTimestamp() });
}

// ---------------------------------------------------------------- HISTÓRICO ANTIGO (sob demanda)
// O aparelho guarda os últimos 90 dias. Para relatórios mais antigos, busca UMA vez e guarda no cache.
export async function garantirHistorico(desdeMs) {
  const chave = `historicoDesde|${eid()}`;
  const jaTem = Number(localStorage.getItem(chave) || Date.now() - 90 * 86400000);
  if (desdeMs >= jaTem) return 0;
  const { Timestamp } = await import("./firebase.js");
  const q = query(collection(db, "empresas", eid(), "movimentacoes"),
    where("atualizadoEm", ">=", Timestamp.fromMillis(desdeMs)),
    where("atualizadoEm", "<", Timestamp.fromMillis(jaTem)));
  const snap = await getDocs(q);
  sync.mesclar("movimentacoes", snap.docs.map((d) => ({ id: d.id, ...sync.normalizar(d.data()) })));
  try { localStorage.setItem(chave, String(desdeMs)); } catch {}
  return snap.size;
}
