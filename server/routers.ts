import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointmentSources,
  appointmentStatuses,
  attendanceClassificationDetails,
  attendanceClassifications,
  attendanceServiceTypes,
  attendanceStatuses,
  type AppointmentStatus,
  type UserRole,
  userRoles,
} from "../drizzle/schema";
import {
  type AppointmentFilters,
  createAppointment,
  createAppointmentInternalNote,
  createAppointmentSuggestion,
  createManualXmlAppointment,
  createUnscheduledReceipt,
  confirmAppointmentPreNote,
  desfazerPreNotaDoAgendamento,
  createAppointmentMessage,
  createLocalUser,
  deleteAppointmentById,
  acceptAppointmentSuggestion,
  getAppointmentById,
  getSuggestionById,
  getUserByCompanyCnpj,
  getUserByEmail,
  listAppointmentHistory,
  listAppointmentMessages,
  contarDatasFuradas,
  listAppointments,
  listCalendarAppointments,
  ultimasNotasNoBacklog,
  conversasRecentesDoBacklog,
  listAppointmentInternalNotes,
  marcarConversaDaTratativaLida,
  listAppointmentSuggestions,
  listBacklogReportRows,
  contarMensagensPorNota,
  sugestoesPendentesPorNota,
  listUnreadAppointmentMessages,
  listSupplierActiveAppointments,
  markAppointmentMessagesRead,
  corrigirMotivoDoBacklog,
  linhasDeBacklogNoHistorico,
  devolverParaBacklog,
  reabrirComoPendente,
  returnAppointmentForRescheduling,
  rescueAppointment,
  scheduleAppointment,
  contarFeedbacksNaoLidos,
  listarFeedbacks,
  notasDoPortal,
  marcarFeedbackLido,
  marcarSaidaDoUsuario,
  registrarFeedback,
  touchUserSignIn,
  treatBacklogAppointment,
  updateAppointmentStatus,
  consumePasswordResetToken,
  updateUserName,
  updateUserPassword,
  listApprovedCompanyUserIds,
  listarIdsDaEmpresa,
  listPendingAccessRequests,
  setUserAccessStatus,
  createPasswordResetToken,
  getPasswordResetToken,
  getUserById,
  definirSituacaoDoUsuario,
  registrarAvisoDoSistema,
  marcarUrgencia,
  definirPedidoDaNota,
  registrarNoHistorico,
  createAttendance,
  decideAttendanceEntry,
  executeAttendanceAction,
  getAttendanceById,
  listAttendanceEvents,
  listAttendances,
  countActiveAdmins,
  deleteAttendanceById,
  listAttendancesByDay,
  listAttendancesInRange,
  listStaffUsers,
  listSupplierAccounts,
  panoramaDeFornecedores,
  razaoSocialConhecida,
  gravarPedidosDoSap,
  situacaoDosPedidos,
  itensDoPedido,
  setUserRole,
} from "./db";
import { supplierNameRule } from "../shared/attendanceFields";
import { canApplySuggestion, canMoveAppointmentStatus, canRequestAppointment, canRescueAppointment, canScheduleAppointment, canSuggestSchedule, canTransitionAppointment, canTreatBacklog, isOperator, isSchedulingDesk } from "./permissions";
import { validarTratativa, resumoDaTratativa } from "../shared/tratativa";
import { ehMotivoConhecido, rotuloDoMotivo } from "../shared/backlogReasons";
import { codigoDoAgilizaNoHistorico } from "../shared/motivoDoAgiliza";
import { BASES_DA_DATA } from "../shared/baseDaData";
import { ehSituacao, SITUACAO_PADRAO, SITUACOES } from "../shared/presenca";
import { NOTA_MAXIMA, NOTA_MINIMA, resumoDasNotas, temConteudo } from "../shared/notaDoPortal";
import { codigoDeOrigem, MOTIVOS_DO_AGILIZA } from "./agilizaImport";
import { clearRvdSession, createRvdSession } from "./session";
import { systemRouter } from "./_core/systemRouter";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { storageLerTexto, storagePut } from "./storage";
import { MAX_XML_BYTES, parseInvoiceXml } from "./xmlInvoice";
import { ENV } from "./_core/env";
import { limparFalhas, registrarFalha, segundosDeEspera } from "./loginThrottle";
import { estadoDasContasDeTeste } from "./contasDeTeste";
import { createAppointmentValidationToken, readAppointmentValidationToken } from "./appointmentValidation";
import { buildResetUrl, createResetToken, enderecoDoPortal, hashResetToken, isResetTokenUsable, resetEmailContent, resetTokenExpiry } from "./passwordReset";
import { caminhoDoEnvio, descricaoDoDestino, isMailerConfigured, remetente, sendMail } from "./_core/mailer";
import { conteudoDoAcessoLiberado } from "./emailDeAcesso";
import { conteudoDoTeste, motivoDaFalha } from "./emailDeTeste";
import { montarEstadoDeSeguranca } from "./estadoDeSeguranca";
import { isS3Configured } from "./_core/s3Client";
import { conteudoDoAgendamento } from "./emailDeAgendamento";
import { conteudoDaRecusa } from "./emailDeRecusa";
import { buildScopeIds, companyKey, isWithinScope } from "./supplierScope";
import { contarAgendamentos } from "./db";
import { apagarNotaRegistrando, backupConhecido, backupsDisponiveis, excluirNotaRepetida, limparAvisos, limparCopiasRepetidas, notaJaRegistrada, notasRepetidas, ultimasTentativasDeBackup, ultimoBackupConcluido } from "./db";
import { chaveDeDuplicidade } from "../shared/duplicidadeDeNota";
import { countAppointments, countAppointmentsByStatus, createServiceNoteAppointment, listReportRows, listSupplierOptions } from "./db";
import { executarBackup, procurarNotaEmBackup, restaurarNotaDoBackup } from "./backup";
import { storageGetSignedUrl } from "./storage";
import { decodificarCsv, importarAcervo } from "./agilizaImport";
import { lerPedidosDoSap } from "./pedidosSap";
import { pedidosDaNota as numerosDosPedidos } from "../shared/purchaseOrders";
import { normalizeCnpj } from "./fiscalFilters";
import { situacaoDasMigracoes } from "./_core/migrations";

/** Uma importação de acervo por vez em todo o servidor. Ver a rota abaixo. */
let importacaoEmCurso = false;
import { normalizePurchaseOrder, pedidosCabem, PURCHASE_ORDER_MAX } from "./purchaseOrder";
import { MIRO_DIGITS, normalizeMiroNumber } from "../shared/miro";
import { buildDashboardMetrics } from "./dashboardMetrics";
import { formatSaoPauloDateKey } from "../shared/dateFilters";
import { buildAttendanceMetrics } from "./attendanceMetrics";
import {
  attendanceActionOwner,
  canManageOperation,
  canManagePortaria,
  canPerformAttendanceAction,
  canViewAttendances,
  canViewGateHistory,
  isValidClassificationDetail,
  validateEntryDecision,
  validateOperationalTransition,
} from "./attendanceRules";

const localProfileSchema = z.enum(["operator", "supplier", "portaria", "operacao"]);
const statusSchema = z.enum(appointmentStatuses);

/** Os filtros da agenda: a lista e a contagem das páginas leem os mesmos. */
const filtrosDaLista = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").optional(), status: statusSchema.optional(), invoiceNumber: z.string().max(100).optional(), supplierName: z.string().max(255).optional(), recipientCnpj: z.string().max(20).optional(), recipientCnpjs: z.array(z.string().max(40)).max(20).optional(), purchaseOrder: z.string().max(100).optional(), sapCode: z.string().max(60).optional(), supplierCnpj: z.string().max(20).optional(), itemCountOperator: z.enum([">=", "<=", "="]).optional(), itemCount: z.number().int().min(0).max(100000).optional(), dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), busca: z.string().max(255).optional(), ordenarPor: z.enum(["fornecedor", "destinatario", "nota", "pedido", "agendamento", "status"]).optional(), ordem: z.enum(["asc", "desc"]).optional(), backlogStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), backlogEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), onlyUrgent: z.boolean().optional(), preNote: z.enum(["done", "pending"]).optional(), excludeBacklog: z.boolean().optional(), excluirServico: z.boolean().optional(), source: z.enum(appointmentSources).optional(), limit: z.number().int().positive().max(500).optional(), offset: z.number().int().min(0).optional() }).optional();
const demoLogin = "admin";
const demoPassword = "admin";

/**
 * As contas de teste do portal.
 *
 * Bloquear só a criação não bastaria: onde a conta de teste já foi criada uma
 * vez, ela continua no banco com a senha de então. Por isso o caminho é
 * reconhecido pelos dois lados — pelo login "admin" e pelos e-mails das contas
 * — e a senha vem sempre da política, nunca do que está gravado.
 */
const EMAILS_DE_TESTE = new Set(["operator", "supplier", "portaria", "operacao"].map(perfil => demoAccountFor(perfil as z.infer<typeof localProfileSchema>).email));

function ehCaminhoDeTeste(login: string, email: string) {
  return login === demoLogin || EMAILS_DE_TESTE.has(email);
}

function politicaDasContasDeTeste() {
  return estadoDasContasDeTeste({
    producao: ENV.isProduction,
    senhaConfigurada: ENV.senhaDasContasDeTeste,
    senhaDeDesenvolvimento: demoPassword,
  });
}

function demoAccountFor(profile: z.infer<typeof localProfileSchema>) {
  if (profile === "supplier") return { email: "teste.fornecedor@rvdsaude.local", name: "Fornecedor de Teste RVD Saúde", companyName: "Fornecedor de Teste RVD Saúde", companyCnpj: "00000000000000" };
  if (profile === "portaria") return { email: "teste.portaria@rvdsaude.local", name: "Portaria de Teste RVD Saúde" };
  if (profile === "operacao") return { email: "teste.operacao@rvdsaude.local", name: "Operação de Teste RVD Saúde" };
  return { email: "teste.operador@rvdsaude.local", name: "Operador de Teste RVD Saúde" };
}

/** O administrador responde por toda a operação interna, então entra por
 * qualquer perfil interno; o de fornecedor continua fora do seu alcance. */
function demoRoleFor(profile: z.infer<typeof localProfileSchema>): UserRole {
  return profile === "operator" ? "admin" : profile;
}

function hashPassword(password: string, salt = nanoid(16)) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function publicUser(user: { id: number; name: string | null; email: string | null; role: string; situacao?: string | null }) {
  // A situação vem junto porque é o menu da própria conta que a mostra e a
  // troca: sem ela, abrir o portal exibiria sempre "Disponível" até alguém
  // clicar, mesmo para quem tinha deixado "Ocupado" marcado.
  return { id: user.id, name: user.name, email: user.email, role: user.role, situacao: ehSituacao(user.situacao) ? user.situacao : SITUACAO_PADRAO };
}

function assertOperator(role: UserRole) {
  if (!isOperator(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao perfil de operador." });
}

function assertSchedulingDesk(role: UserRole) {
  if (!isSchedulingDesk(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a quem cuida da agenda." });
}

function assertAdmin(role: UserRole) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Ação restrita ao Administrador." });
}

function assertPortaria(role: UserRole) {
  if (!canManagePortaria(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o perfil de Portaria pode executar esta ação." });
}

function assertOperacao(role: UserRole) {
  if (!canManageOperation(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o perfil de Operação pode executar esta ação." });
}

/**
 * O RG do motorista é dado pessoal. Ele fica registrado — é o documento
 * conferido no portão —, mas sai do que o portal devolve para quem não é
 * administrador. Apagar só na tela não restringe nada: quem abre o inspetor do
 * navegador lê o JSON igual.
 */
function hideDriverDocument<T extends { driverDocument: string | null }>(role: UserRole, rows: T[]) {
  return role === "admin" ? rows : rows.map(row => ({ ...row, driverDocument: null }));
}

function assertAttendanceViewer(role: UserRole) {
  if (!canViewAttendances(role)) throw new TRPCError({ code: "FORBIDDEN", message: "O pátio é restrito às equipes internas." });
}

/**
 * Recusa a mudança que deixaria o sistema sem nenhum administrador ativo. Sem
 * essa checagem, um clique bloqueia o último dono e a única forma de voltar é
 * abrir o banco na mão.
 */
async function assertAnotherAdminRemains(userId: number, removesAdmin: boolean) {
  if (!removesAdmin) return;
  const target = await getUserById(userId);
  if (target?.role !== "admin" || target.accessStatus !== "approved") return;
  if ((await countActiveAdmins(userId)) === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Este é o último administrador ativo. Promova outra conta a Administrador antes de bloquear esta.",
    });
  }
}

async function getExistingAttendance(attendanceId: number) {
  const attendance = await getAttendanceById(attendanceId);
  if (!attendance) throw new TRPCError({ code: "NOT_FOUND", message: "Atendimento não localizado." });
  return attendance;
}

type ScopedUser = { id: number; role: UserRole; companyCnpj?: string | null; companyId?: number | null };

/**
 * The supplier logins whose appointments this caller may read. Logins sharing a
 * CNPJ see the company's records; only approved ones count, so a login waiting
 * on the operator neither sees the company nor is seen by it.
 */
async function supplierScopeIds(user: ScopedUser): Promise<number[]> {
  // Conta agrupada numa empresa enxerga os CNPJs todos dela — é para isso que a
  // empresa existe. Sem grupo, continua valendo o CNPJ da própria conta.
  if (user.companyId) return buildScopeIds(user.id, await listarIdsDaEmpresa(user.companyId));
  const key = companyKey(user.companyCnpj);
  if (!key) return [user.id];
  return buildScopeIds(user.id, await listApprovedCompanyUserIds(key));
}

async function getAccessibleAppointment(user: ScopedUser, appointmentId: number) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
  if (!isSchedulingDesk(user.role) && !isWithinScope(await supplierScopeIds(user), appointment.supplierId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode acessar as mensagens deste agendamento." });
  }
  return appointment;
}

/** Como cada status aparece na mensagem de nota repetida. */
const NOME_DO_STATUS: Record<string, string> = {
  pending: "aguardando agendamento",
  scheduled: "agendada",
  received: "recebida",
  completed: "concluída",
  backlog: "em backlog",
  rejected: "recusada",
};

/**
 * Barra a nota que já está no sistema.
 *
 * Duas portas levam a mesma nota para dentro: o fornecedor que envia o XML e a
 * portaria que registra um recebimento sem agendamento. Quando o mesmo
 * documento entra pelas duas, passam a existir dois registros do mesmo
 * recebimento — duas conferências, dois lançamentos no SAP —, e desfazer isso
 * depois é muito mais caro do que recusar agora.
 *
 * A mensagem diz qual nota é e em que estado ela está, porque quem está com a
 * mercadoria na mão precisa saber onde continuar, e não só que não pode seguir.
 */
async function recusarNotaRepetida(
  nota: { accessKey?: string | null; supplierCnpj?: string | null; companyCnpj?: string | null; invoiceNumber?: string | null },
  dica?: string,
) {
  const chave = chaveDeDuplicidade(nota);
  // Sem chave de acesso, sem CNPJ e sem número não dá para reconhecer a nota.
  // Barrar no escuro recusaria nota boa e travaria a entrada da mercadoria.
  if (!chave) return;
  const jaExiste = await notaJaRegistrada(chave);
  if (!jaExiste) return;
  const situacao = NOME_DO_STATUS[jaExiste.status] ?? jaExiste.status;
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(jaExiste.createdAt);
  const fornecedor = jaExiste.invoiceSupplierName ? ` de ${jaExiste.invoiceSupplierName}` : "";
  throw new TRPCError({
    code: "CONFLICT",
    message:
      `Esta nota já está no sistema: NF ${jaExiste.invoiceNumber ?? "sem número"}${fornecedor}, ` +
      `registrada em ${quando} e hoje ${situacao}. Procure por ela na lista em vez de registrar de novo.` +
      (dica ? ` ${dica}` : ""),
  });
}

/**
 * Avisa o fornecedor da data marcada.
 *
 * Quem envia a nota não fica com o portal aberto: a confirmação vem horas ou
 * dias depois, e sem aviso ele só descobre se voltar para olhar. Entrega que
 * chega no dia errado custa a viagem, a doca ocupada à toa e a nota de volta.
 *
 * Não trava o agendamento: a marcação já está gravada quando isto roda, e um
 * problema no envio não pode desfazer o que a doca combinou. Fica registrado no
 * histórico da nota — inclusive a falha —, porque "o fornecedor foi avisado?"
 * precisa ter resposta.
 */
async function avisarFornecedorDoAgendamento(agendamento: { id: number; supplierId: number; status: AppointmentStatus; invoiceNumber: string | null; purchaseOrder: string | null; scheduledFor: Date; recipientCnpj: string | null; invoiceSupplierName: string | null }, remarcado: boolean, operadorId: number) {
  const registrar = async (nota: string) => {
    try {
      await registrarNoHistorico({ appointmentId: agendamento.id, status: agendamento.status, handledBy: operadorId, eventNote: nota });
    } catch (erro) {
      // O histórico é o registro do aviso, não o aviso: falhar aqui não pode
      // apagar o e-mail que já saiu.
      console.error("[Agendamento] falha ao registrar o aviso no histórico:", erro);
    }
  };

  if (!isMailerConfigured()) {
    // Nada no histórico da nota: o envio estar desligado não é um evento
    // daquela nota, é o estado do sistema. Escrever a mesma linha em toda nota
    // encheria o histórico de ruído e esconderia o que de fato aconteceu com
    // ela. Fica no log do servidor, que é onde se olha o estado do sistema.
    console.warn("[Agendamento] envio de e-mail desligado (falta o SMTP da empresa ou a chave do Resend) — o fornecedor não foi avisado.");
    return;
  }
  const fornecedor = await getUserById(agendamento.supplierId);
  if (!fornecedor?.email) {
    await registrar("Aviso de agendamento não enviado: o fornecedor não tem e-mail cadastrado.");
    return;
  }
  const conteudo = conteudoDoAgendamento({
    invoiceNumber: agendamento.invoiceNumber,
    purchaseOrder: agendamento.purchaseOrder,
    scheduledFor: agendamento.scheduledFor,
    recipientCnpj: agendamento.recipientCnpj,
    supplierName: agendamento.invoiceSupplierName,
    remarcado,
  });
  try {
    await sendMail({ to: fornecedor.email, ...conteudo });
    await registrar(`${remarcado ? "Remarcação" : "Agendamento"} avisado por e-mail para ${fornecedor.email}.`);
  } catch (erro) {
    console.error("[Agendamento] falha ao enviar o aviso ao fornecedor:", erro);
    await registrar(`Aviso de agendamento não entregue em ${fornecedor.email}.`);
  }
}

/**
 * Avisa o fornecedor de que a nota foi recusada, com o motivo.
 *
 * A recusa é a única decisão do portal que custa dinheiro do outro lado — o
 * caminhão já saiu, a carga volta, alguém refaz o agendamento — e acontecia em
 * silêncio: o fornecedor só descobria se voltasse ao portal, e muitos
 * descobriam pelo motorista ligando da estrada.
 *
 * Nunca derruba a recusa: ela já está gravada quando isto roda. Um e-mail que
 * não sai não pode fazer a doca ficar com a carga que recusou.
 */
async function avisarFornecedorDaRecusa(
  agendamento: { id: number; supplierId: number; invoiceNumber: string | null; purchaseOrder: string | null; scheduledFor: Date | null; recipientCnpj: string | null; semAgendamento?: boolean | null },
  recusa: { motivoCodigo: string | null; descricao: string | null },
  operadorId: number,
) {
  const registrar = async (nota: string) => {
    try {
      await registrarNoHistorico({ appointmentId: agendamento.id, status: "rejected", handledBy: operadorId, eventNote: nota });
    } catch (erro) {
      // O histórico é o registro do aviso, não o aviso: falhar aqui não pode
      // apagar o e-mail que já saiu.
      console.error("[Recusa] falha ao registrar o aviso no histórico:", erro);
    }
  };

  if (!isMailerConfigured()) {
    // Igual ao agendamento: o envio estar desligado é estado do sistema, não
    // evento daquela nota. Escrever isso no histórico de toda nota recusada
    // esconderia o que de fato aconteceu com ela.
    console.warn("[Recusa] envio de e-mail desligado — o fornecedor não foi avisado da recusa.");
    return;
  }
  const fornecedor = await getUserById(agendamento.supplierId);
  // Nota lançada à mão pelo balcão fica no nome de quem a lançou, que é gente
  // de dentro. Mandar a esse endereço o aviso de "sua entrega foi recusada"
  // avisa a própria mesa do que ela acabou de decidir, e não o fornecedor.
  if (fornecedor && fornecedor.role !== "supplier") {
    await registrar("Aviso de recusa não enviado: esta nota não está no nome de uma conta de fornecedor.");
    return;
  }
  if (!fornecedor?.email) {
    await registrar("Aviso de recusa não enviado: o fornecedor não tem e-mail cadastrado.");
    return;
  }
  const conteudo = conteudoDaRecusa({
    invoiceNumber: agendamento.invoiceNumber,
    purchaseOrder: agendamento.purchaseOrder,
    // Carga que chegou sem data marcada não tem "data que estava marcada": o
    // horário gravado ali é o do clique de quem registrou o recebimento.
    scheduledFor: agendamento.semAgendamento ? null : agendamento.scheduledFor,
    recipientCnpj: agendamento.recipientCnpj,
    motivoCodigo: recusa.motivoCodigo,
    descricao: recusa.descricao,
    recusadaEm: new Date(),
  });
  try {
    await sendMail({ to: fornecedor.email, ...conteudo });
    await registrar(`Recusa avisada por e-mail para ${fornecedor.email}.`);
  } catch (erro) {
    console.error("[Recusa] falha ao enviar o aviso ao fornecedor:", erro);
    await registrar(`Aviso de recusa não entregue em ${fornecedor.email}.`);
  }
}

/** O que basta saber da requisição para montar um link: os cabeçalhos. */
type ComCabecalhos = { headers: Record<string, string | string[] | undefined> };

/** O endereço do portal visto por quem fez esta requisição. */
function enderecoDoPortalDaRequisicao(req: ComCabecalhos): string | null {
  return enderecoDoPortal({
    appUrl: ENV.appUrl,
    proto: req.headers["x-forwarded-proto"] as string | undefined,
    host: (req.headers["x-forwarded-host"] ?? req.headers.host) as string | undefined,
  });
}

/**
 * Avisa a pessoa de que o login dela passou a valer.
 *
 * Vale para os três caminhos que liberam um acesso — o cadastro aprovado pelo
 * administrador, a conta criada já liberada e o desbloqueio —, porque para
 * quem recebe são a mesma notícia. Nunca derruba a ação que a gerou: o acesso
 * já está liberado no banco quando esta função roda, e um e-mail que não sai
 * não pode desfazer isso.
 *
 * Devolve se o aviso saiu, para a tela de quem liberou poder dizer.
 */
async function avisarAcessoLiberado(usuario: { name: string | null; email: string | null; role: UserRole }, req: ComCabecalhos, reativado = false): Promise<boolean> {
  if (!usuario.email) return false;
  if (!isMailerConfigured()) {
    console.warn("[Acesso] envio de e-mail desligado (falta o SMTP da empresa ou a chave do Resend) — a pessoa não foi avisada de que o login está ativo.");
    return false;
  }
  try {
    const conteudo = conteudoDoAcessoLiberado({ nome: usuario.name, email: usuario.email, role: usuario.role, appUrl: enderecoDoPortalDaRequisicao(req), reativado });
    await sendMail({ to: usuario.email, ...conteudo });
    return true;
  } catch (erro) {
    console.error("[Acesso] falha ao avisar que o login está ativo:", erro);
    return false;
  }
}

function decodeXmlBase64(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo do XML é inválido." });
  }
  const content = Buffer.from(normalized, "base64");
  if (!content.length || content.length > MAX_XML_BYTES) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O XML deve ter até 2 MB." });
  }
  return content;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().min(1, "Informe seu e-mail ou o login de teste."),
          password: z.string().min(1, "Informe a senha."),
          profile: localProfileSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const requestedLogin = input.email.trim().toLowerCase();
        // O IP e o login contam separado: o primeiro barra quem varre senhas de
        // um mesmo lugar, o segundo barra quem distribui as tentativas por
        // muitos endereços contra a mesma conta.
        const chavesDoFreio = [`ip:${ctx.req.ip ?? "desconhecido"}`, `login:${requestedLogin}`];
        const espera = segundosDeEspera(chavesDoFreio);
        if (espera > 0) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Muitas tentativas seguidas. Tente de novo em ${Math.ceil(espera / 60)} minuto(s).` });
        }
        const isDemoLogin = requestedLogin === demoLogin;
        if (!isDemoLogin && !z.string().email().safeParse(requestedLogin).success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um e-mail válido ou use o login de teste admin." });
        }
        const demoAccount = demoAccountFor(input.profile);
        const email = isDemoLogin ? demoAccount.email : requestedLogin;
        const existing = await getUserByEmail(email);
        let user;

        // A conta de teste tem caminho próprio: a senha dela vem da política do
        // ambiente, e não do que está gravado no banco. Assim, mudar a senha das
        // contas de teste é mudar uma variável — e não sai sincronizada com o
        // que sobrou de uma instalação antiga.
        if (ehCaminhoDeTeste(requestedLogin, email)) {
          const politica = politicaDasContasDeTeste();
          if (!politica.ligadas) {
            registrarFalha(chavesDoFreio);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "As contas de teste estão desligadas neste ambiente. Entre com o seu cadastro." });
          }
          if (input.password !== politica.senha) {
            registrarFalha(chavesDoFreio);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Login, senha ou perfil não conferem." });
          }
          user = existing ?? await createLocalUser({ ...demoAccount, role: demoRoleFor(input.profile), passwordHash: hashPassword(politica.senha) });
          if (existing) await touchUserSignIn(existing.id);
          limparFalhas(chavesDoFreio);
          await createRvdSession(ctx.res, user);
          return publicUser(user);
        }

        if (existing) {
          // Operação e Planejamento não têm porta própria na tela de entrada:
          // são perfis que o administrador atribui depois do cadastro, e a
          // conta continua entrando pela porta por onde se cadastrou, a do
          // Operador. Sem esta linha, promover alguém a Planejador o trancava
          // para fora do sistema.
          const entraPelaPortaDoOperador = existing.role === "operacao" || existing.role === "planejador";
          const profileAllowed =
            existing.role === input.profile ||
            (existing.role === "admin" && input.profile !== "supplier") ||
            (entraPelaPortaDoOperador && input.profile === "operator");
          if (!profileAllowed || !existing.passwordHash || !passwordMatches(input.password, existing.passwordHash)) {
            registrarFalha(chavesDoFreio);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail, senha ou perfil não conferem." });
          }
          // Checked only after the password, so the status of an account is not
          // revealed to someone who does not already hold its credentials.
          if (existing.accessStatus === "pending") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro ainda está em análise. Você poderá entrar assim que for aprovado." });
          }
          if (existing.accessStatus === "rejected") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro não foi aprovado. Fale com o administrador do sistema." });
          }
          await touchUserSignIn(existing.id);
          user = existing;
        } else {
          registrarFalha(chavesDoFreio);
          throw new TRPCError({ code: "NOT_FOUND", message: input.profile === "supplier" ? "Fornecedor não encontrado. Faça seu cadastro antes de entrar." : "Acesso interno não encontrado." });
        }

        limparFalhas(chavesDoFreio);
        await createRvdSession(ctx.res, user);
        return publicUser(user);
      }),
    /**
     * O nome do fornecedor a partir do CNPJ, no cadastro.
     *
     * Poupa digitar a razão social — e, mais do que isso, faz o cadastro novo
     * cair no mesmo CNPJ das notas que já existem, em vez de numa grafia
     * ligeiramente diferente que deixaria a conta sem enxergar o próprio
     * histórico.
     *
     * A consulta é pública por necessidade: quem se cadastra ainda não tem
     * conta. Para não virar uma sonda de "quem fornece para a RVD", ela só
     * responde a CNPJ completo e conta cada busca sem resposta no mesmo freio
     * do login: oito seguidas fecham a porta por dez minutos.
     */
    empresaPorCnpj: publicProcedure
      .input(z.object({ cnpj: z.string().min(14).max(20) }))
      .query(async ({ ctx, input }) => {
        const chave = [`cnpj:${ctx.req.ip ?? "desconhecido"}`];
        if (segundosDeEspera(chave) > 0) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas consultas seguidas. Preencha os dados à mão." });
        const razaoSocial = await razaoSocialConhecida(input.cnpj);
        if (razaoSocial) limparFalhas(chave);
        else registrarFalha(chave);
        return { razaoSocial };
      }),
    registerSupplier: publicProcedure
      .input(z.object({ companyName: z.string().trim().min(2, "Informe a razão social.").max(255), companyCnpj: z.string().trim().min(14, "Informe o CNPJ.").max(20), email: z.string().trim().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        const companyCnpj = input.companyCnpj.replace(/\D/g, "");
        if (companyCnpj.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CNPJ válido com 14 dígitos." });
        const existing = await getUserByEmail(email);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Entre pelo formulário de acesso." });

        // The first login for a CNPJ opens the company and is trusted. Any later
        // one joins a company whose records already exist, so it waits for the
        // operator — a CNPJ is public, and self-service would hand the company's
        // history to anyone who types it.
        const companyExists = Boolean(await getUserByCompanyCnpj(companyCnpj));
        const accessStatus = companyExists ? "pending" : "approved";
        const user = await createLocalUser({ email, name: input.companyName.trim(), companyName: input.companyName.trim(), companyCnpj, role: "supplier", passwordHash: hashPassword(input.password), accessStatus });
        if (accessStatus === "pending") return { pending: true } as const;

        // Cadastro que já entra liberado leva o aviso na hora: é o comprovante
        // de que a conta existe e com qual login se volta a ela.
        await avisarAcessoLiberado(user, ctx.req);
        await createRvdSession(ctx.res, user);
        return { pending: false, ...publicUser(user) } as const;
      }),
    register: publicProcedure
      .input(z.object({ profile: localProfileSchema, name: z.string().trim().min(2, "Informe o nome.").max(255), companyCnpj: z.string().max(20).optional(), email: z.string().trim().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        if (await getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Entre pelo formulário de acesso." });
        const isSupplier = input.profile === "supplier";
        const companyCnpj = isSupplier ? input.companyCnpj?.replace(/\D/g, "") : undefined;
        if (isSupplier && companyCnpj?.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CNPJ válido com 14 dígitos." });
        await createLocalUser({ email, name: input.name.trim(), companyName: isSupplier ? input.name.trim() : undefined, companyCnpj, role: input.profile, passwordHash: hashPassword(input.password), accessStatus: "pending" });
        return { pending: true } as const;
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().trim().email("Informe um e-mail válido.") }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        const user = await getUserByEmail(email);

        // Always answer the same way. Telling the caller whether the address is
        // registered would turn this endpoint into a way to enumerate accounts.
        if (user?.id && user.email) {
          const { token, tokenHash } = createResetToken();
          await createPasswordResetToken({ userId: user.id, tokenHash, expiresAt: resetTokenExpiry() });

          const baseUrl = enderecoDoPortal({
            appUrl: ENV.appUrl,
            proto: ctx.req.headers["x-forwarded-proto"] as string | undefined,
            host: (ctx.req.headers["x-forwarded-host"] as string | undefined) ?? ctx.req.headers.host,
          });
          if (!baseUrl) {
            console.error("[PasswordReset] sem APP_URL e sem host na requisição — não foi possível montar o link.");
          } else if (!isMailerConfigured()) {
            console.error("[PasswordReset] envio de e-mail não configurado — e-mail não enviado.");
          } else {
            const content = resetEmailContent(buildResetUrl(baseUrl, token));
            try {
              await sendMail({ to: user.email, ...content });
            } catch (error) {
              // A delivery failure must not change the response either.
              console.error("[PasswordReset] Falha ao enviar o e-mail:", error);
            }
          }
        }

        if (!user) {
          // Logged, never returned: the caller still gets the same answer, but a
          // silent no-op is indistinguishable from a delivery failure otherwise.
          console.warn(`[PasswordReset] Nenhuma conta encontrada para o e-mail informado.`);
        }

        return { sent: true } as const;
      }),
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().min(1, "Link inválido.").max(500),
          password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres."),
        })
      )
      .mutation(async ({ input }) => {
        const stored = await getPasswordResetToken(hashResetToken(input.token));
        if (!isResetTokenUsable(stored)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este link expirou ou já foi utilizado. Peça um novo e-mail de redefinição.",
          });
        }

        await consumePasswordResetToken({
          tokenId: stored!.id,
          userId: stored!.userId,
          passwordHash: hashPassword(input.password),
        });

        // No session is created here: the new password has to be typed on the
        // login screen, so possession of the link alone never grants access.
        return { success: true } as const;
      }),
    // O nome é o que aparece no topo da tela e assina cada evento do histórico,
    // então quem usa a conta precisa poder corrigi-lo sem depender do admin.
    /**
     * O que a pessoa escolhe dizer de si enquanto está no sistema.
     *
     * Não é uma permissão nem um horário de trabalho: é o recado que evita o
     * "oi, tá aí?" seguido de vinte minutos de silêncio. Vale só enquanto ela
     * estiver de fato usando o portal — quem marca "ocupado" e vai embora
     * aparece como desconectado, e não ocupado para sempre.
     */
    definirSituacao: protectedProcedure
      .input(z.object({ situacao: z.enum(SITUACOES) }))
      .mutation(async ({ ctx, input }) => {
        await definirSituacaoDoUsuario({ userId: ctx.user.id, situacao: input.situacao });
        return { situacao: input.situacao } as const;
      }),
    updateName: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2, "Informe o nome.").max(255) }))
      .mutation(async ({ ctx, input }) => {
        await updateUserName({ userId: ctx.user.id, name: input.name });
        return { name: input.name } as const;
      }),

    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1, "Informe a senha atual."),
          newPassword: z.string().min(6, "A nova senha deve conter pelo menos 6 caracteres."),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Re-check the current password even though the session is already
        // authenticated: an unattended open session should not be enough to
        // take the account over.
        if (!ctx.user.passwordHash || !passwordMatches(input.currentPassword, ctx.user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "A senha atual não confere." });
        }
        if (input.currentPassword === input.newPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha deve ser diferente da atual." });
        }

        await updateUserPassword({ userId: ctx.user.id, passwordHash: hashPassword(input.newPassword) });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      // Sair da lista de quem está no sistema é parte de sair: sem isto, quem
      // encerra a sessão continuaria "online" pelos cinco minutos da janela.
      // A situação volta para "disponível" porque ela vale para a sessão —
      // quem marcou "ocupado" ontem não está ocupado ao entrar amanhã.
      if (ctx.user?.id) await marcarSaidaDoUsuario(ctx.user.id).catch(erro => console.warn("[Presença] não consegui marcar a saída:", erro));
      clearRvdSession(ctx.res);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  appointments: router({
    publicConfirmation: publicProcedure
      .input(z.object({ token: z.string().min(1).max(1000) }))
      .query(async ({ input }) => {
        const validation = readAppointmentValidationToken(input.token, ENV.cookieSecret);
        if (!validation) return { valid: false as const };
        const appointment = await getAppointmentById(validation.appointmentId);
        const scheduledFor = appointment?.scheduledFor;
        if (!appointment || appointment.status !== "scheduled" || !scheduledFor || scheduledFor.getTime() !== validation.scheduledForTimestamp) return { valid: false as const };
        return { valid: true as const, invoiceNumber: appointment.invoiceNumber, scheduledFor };
      }),
    list: protectedProcedure
      .input(filtrosDaLista)
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = {
          limit: input?.limit,
          offset: input?.offset,
          // Pendente, agendado e backlog são fila: o mais próximo primeiro.
          // Recebido, concluído e rejeitado são histórico: o mais recente primeiro.
          futuroPrimeiro: !input?.status || input.status === "pending" || input.status === "scheduled" || input.status === "backlog",
          date: input?.date, status: input?.status as AppointmentStatus | undefined, source: input?.source, invoiceNumber: input?.invoiceNumber, supplierName: input?.supplierName, recipientCnpj: input?.recipientCnpj, recipientCnpjs: input?.recipientCnpjs,
          purchaseOrder: input?.purchaseOrder, sapCode: input?.sapCode, supplierCnpj: input?.supplierCnpj,
          itemCountOperator: input?.itemCountOperator, itemCount: input?.itemCount,
          dateStart: input?.dateStart, dateEnd: input?.dateEnd, busca: input?.busca, ordenarPor: input?.ordenarPor, ordem: input?.ordem, backlogStart: input?.backlogStart, backlogEnd: input?.backlogEnd, onlyUrgent: input?.onlyUrgent, preNote: input?.preNote, excludeBacklog: input?.excludeBacklog, excluirServico: input?.excluirServico };
        if (!isSchedulingDesk(ctx.user.role)) filters.supplierIds = await supplierScopeIds(ctx.user);
        return listAppointments(filters);
      }),
    /**
     * Quantas notas o filtro alcança — o que diz quantas páginas existem.
     *
     * Fica separado da lista porque a lista devolve um array e cinco telas já
     * dependem desse formato; embrulhar tudo num objeto para servir a paginação
     * de uma delas quebraria as outras quatro.
     */
    /**
     * As últimas notas que caíram no backlog, para o sino do planejamento.
     *
     * O contador no menu diz quantas são; ele não diz qual chegou agora nem por
     * quê, e é isso que faz alguém abrir a tela. Só para quem trata o backlog:
     * para o resto do portal não é aviso, é a fila dos outros.
     */
    novosNoBacklog: protectedProcedure.query(async ({ ctx }) => {
      if (!canTreatBacklog(ctx.user.role)) return [];
      return ultimasNotasNoBacklog(10, ctx.user.avisosDoBacklogVistosEm ?? null);
    }),
    /**
     * As últimas falas da conversa das notas em backlog.
     *
     * A conversa da tratativa é interna: o fornecedor não lê esta tabela, e é
     * por isso que nela se escreve preço, documento do HIS e número de SAP.
     * Dentro de casa ela não é segredo de ninguém — quem mandou a nota para o
     * backlog foi o balcão, e ele precisa saber no que deu.
     */
    conversaDoBacklog: protectedProcedure.query(async ({ ctx }) => {
      if (!isSchedulingDesk(ctx.user.role)) return [];
      return conversasRecentesDoBacklog({ exceptoAutorId: ctx.user.id, limite: 10 });
    }),
    total: protectedProcedure
      .input(filtrosDaLista)
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = {
          date: input?.date, status: input?.status as AppointmentStatus | undefined, source: input?.source, invoiceNumber: input?.invoiceNumber,
          supplierName: input?.supplierName, recipientCnpj: input?.recipientCnpj, recipientCnpjs: input?.recipientCnpjs,
          purchaseOrder: input?.purchaseOrder, sapCode: input?.sapCode, supplierCnpj: input?.supplierCnpj,
          itemCountOperator: input?.itemCountOperator, itemCount: input?.itemCount,
          dateStart: input?.dateStart, dateEnd: input?.dateEnd, busca: input?.busca, ordenarPor: input?.ordenarPor, ordem: input?.ordem, backlogStart: input?.backlogStart, backlogEnd: input?.backlogEnd, onlyUrgent: input?.onlyUrgent, preNote: input?.preNote, excludeBacklog: input?.excludeBacklog, excluirServico: input?.excluirServico };
        if (!isSchedulingDesk(ctx.user.role)) filters.supplierIds = await supplierScopeIds(ctx.user);
        return countAppointments(filters);
      }),
    /**
     * Uma nota inteira, para quem abriu o detalhamento.
     *
     * A lista deixou de carregar os itens de cada nota — eram 39% do peso da
     * resposta para um dado que só aparece quando alguém abre uma nota.
     */
    byId: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar este agendamento." });
        }
        return appointment;
      }),
    /**
     * O XML da nota, em texto, para o navegador desenhar o DANFE.
     *
     * O anexo já é servido por link assinado, e para baixar isso basta. Mas o
     * link aponta para o bucket, que é outro domínio, e o navegador não deixa
     * uma página *ler* o conteúdo de outro domínio sem uma permissão que o
     * bucket não dá. Desenhar o DANFE precisa ler.
     *
     * O mesmo cerco do resto da nota: o balcão vê todas, o fornecedor só as
     * suas. Nota de serviço não passa por aqui — NFS-e não tem DANFE, e cada
     * prefeitura tem o layout dela.
     */
    xmlDaNota: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar este agendamento." });
        }
        if (appointment.source === "servico") throw new TRPCError({ code: "BAD_REQUEST", message: "Nota de serviço não tem DANFE." });
        if (!appointment.xmlStorageKey) throw new TRPCError({ code: "NOT_FOUND", message: "Esta nota não tem XML guardado." });
        return { xml: await storageLerTexto(appointment.xmlStorageKey) };
      }),
    /**
     * O que os pedidos de uma nota esperavam, segundo o SAP.
     *
     * A nota traz o número do pedido; o pedido diz quais materiais, em que
     * quantidade e para qual unidade. É contra isto que a nota se confere — e é
     * dado de compra, então fica no balcão interno, longe do fornecedor.
     */
    pedidosDaNota: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        const pedidos = numerosDosPedidos(appointment.purchaseOrder);
        if (!pedidos.length) return { itens: [], unidadeDivergente: false as const };
        const itens = await itensDoPedido(pedidos);
        // A unidade do pedido é a que o SAP mandou comprar para; se a nota foi
        // agendada para outra, a carga vai parar no lugar errado.
        const unidadesDoPedido = new Set(itens.map(item => item.recipientCnpj).filter(Boolean));
        const daNota = normalizeCnpj(appointment.recipientCnpj ?? "");
        const unidadeDivergente = Boolean(daNota) && unidadesDoPedido.size > 0 && !unidadesDoPedido.has(daNota);
        return { itens, unidadeDivergente };
      }),
    /** Os fornecedores já cadastrados, para escolher ao registrar uma nota de serviço. */
    fornecedores: protectedProcedure.query(async ({ ctx }) => {
      assertSchedulingDesk(ctx.user.role);
      return listSupplierOptions();
    }),
    /**
     * Registra uma nota de serviço: sem XML, com o PDF quando houver.
     *
     * Serviço não emite XML de produto, e hoje essas notas ficavam de fora do
     * portal — combinadas por e-mail e conferidas de memória. Aqui elas entram
     * na mesma agenda, com pedido de compra e data, e passam pelo mesmo
     * recebimento.
     */
    createServiceNote: protectedProcedure
      .input(
        z.object({
          supplierId: z.number().int().positive(),
          recipientCnpj: z.string().min(14).max(20),
          invoiceNumber: z.string().trim().min(1).max(100),
          scheduledFor: z.string().datetime({ offset: true }),
          purchaseOrders: z.array(z.string().trim()).min(1, "Informe ao menos um pedido."),
          documentBase64: z.string().max(12_000_000).nullish(),
          documentFileName: z.string().max(255).nullish(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const pedidos = input.purchaseOrders.map(pedido => pedido.replace(/\D/g, "")).filter(Boolean);
        if (!pedidos.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos um pedido de compra." });
        // Dez dígitos é o formato do pedido no ERP; um número curto aqui vira
        // uma nota que ninguém consegue conferir depois.
        const invalido = pedidos.find(pedido => pedido.length !== 10);
        if (invalido) throw new TRPCError({ code: "BAD_REQUEST", message: `O pedido ${invalido} não tem 10 dígitos.` });

        // A nota de serviço era o único caminho sem conferência: número digitado
        // à mão, sem XML e sem chave, duas pessoas registrando a mesma nota do
        // mesmo fornecedor sem o portal dizer nada. O CNPJ da empresa escolhida
        // é o que identifica aqui — mesmo número de outro fornecedor continua
        // sendo outra nota, e passa.
        const empresa = await getUserById(input.supplierId);
        if (!empresa) throw new TRPCError({ code: "BAD_REQUEST", message: "Fornecedor não encontrado." });
        await recusarNotaRepetida({ companyCnpj: empresa.companyCnpj, invoiceNumber: input.invoiceNumber });

        let documento: { key: string; url: string } | null = null;
        if (input.documentBase64 && input.documentFileName) {
          const conteudo = Buffer.from(input.documentBase64, "base64");
          documento = await storagePut(`notas-servico/${ctx.user.id}/${input.documentFileName}`, conteudo, "application/pdf");
        }

        return createServiceNoteAppointment({
          supplierId: input.supplierId,
          invoiceNumber: input.invoiceNumber,
          recipientCnpj: input.recipientCnpj.replace(/\D/g, ""),
          scheduledFor: new Date(input.scheduledFor),
          purchaseOrder: pedidos.join(", "),
          documentStorageKey: documento?.key ?? null,
          documentUrl: documento?.url ?? null,
          documentFileName: input.documentFileName ?? null,
          createdById: ctx.user.id,
        });
      }),
    /** Quantas notas há em cada situação, contadas no banco e não no navegador. */
    /**
     * A contagem de cada aba, com os mesmos filtros que a lista.
     *
     * O status do input é ignorado de propósito: ele é o que agrupa.
     */
    counts: protectedProcedure
      .input(filtrosDaLista)
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = {
          date: input?.date, source: input?.source, invoiceNumber: input?.invoiceNumber,
          supplierName: input?.supplierName, recipientCnpj: input?.recipientCnpj, recipientCnpjs: input?.recipientCnpjs,
          purchaseOrder: input?.purchaseOrder, sapCode: input?.sapCode, supplierCnpj: input?.supplierCnpj,
          itemCountOperator: input?.itemCountOperator, itemCount: input?.itemCount,
          dateStart: input?.dateStart, dateEnd: input?.dateEnd, busca: input?.busca, ordenarPor: input?.ordenarPor, ordem: input?.ordem, backlogStart: input?.backlogStart, backlogEnd: input?.backlogEnd, onlyUrgent: input?.onlyUrgent, preNote: input?.preNote, excluirServico: input?.excluirServico };
        if (!isSchedulingDesk(ctx.user.role)) filters.supplierIds = await supplierScopeIds(ctx.user);
        return countAppointmentsByStatus(filters);
      }),
    history: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar o histórico deste agendamento." });
        }
        return listAppointmentHistory(input.appointmentId);
      }),
    receiptCertificate: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        // O comprovante entrega os dados fiscais da nota e um token de validação
        // assinado. Escrito como "quem não é fornecedor pode", o teste liberava
        // qualquer perfil interno novo — Portaria e Operação não participam
        // deste fluxo. A regra é a mesma do histórico: a operação de
        // agendamentos, ou o próprio fornecedor da nota.
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode emitir este comprovante." });
        }
        if (appointment.status !== "scheduled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O PDF de entrega fica disponível somente para notas Agendadas." });
        }
        const history = await listAppointmentHistory(appointment.id);
        const scheduleEvent = [...history].reverse().find(event => event.nextStatus === "scheduled");
        return {
          appointment,
          confirmedByName: scheduleEvent?.handlerName || "Operador RVD Saúde",
          confirmedByLogin: scheduleEvent?.handlerEmail || "Login não informado",
          confirmedAt: scheduleEvent?.createdAt || appointment.updatedAt,
          scheduledFor: appointment.scheduledFor,
          validationToken: createAppointmentValidationToken({ appointmentId: appointment.id, scheduledForTimestamp: appointment.scheduledFor.getTime() }, ENV.cookieSecret),
        };
      }),
    delete: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        // Com registro: a exclusão é em cascata e definitiva, e dias depois
        // alguém vai perguntar o que havia naquela nota. O resumo é o que
        // sobra para responder — e para achá-la no backup, se for o caso.
        await apagarNotaRegistrando(appointment.id, ctx.user.id);
        return { success: true } as const;
      }),
    /**
     * Volta uma nota recebida ou concluída para pendente.
     *
     * Só o administrador, e só a partir de "Recebida" ou "Concluída": é desfazer
     * um clique errado — alguém deu baixa na nota que não era —, não um caminho
     * normal da nota. O MIRO e o recebimento caem junto, porque uma nota
     * pendente não pode carregar lançamento no SAP nem hora de chegada, e o que
     * ela tinha fica escrito no histórico, que é o que sobra para auditar.
     */
    voltarParaPendente: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        if (appointment.status !== "completed" && appointment.status !== "received") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Somente notas recebidas ou concluídas podem voltar para pendente." });
        }
        const tinha = [
          appointment.miroNumber ? `MIRO ${appointment.miroNumber}` : null,
          appointment.receivedAt ? `recebida em ${appointment.receivedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : null,
        ].filter(Boolean).join(" · ");
        return reabrirComoPendente({
          appointmentId: appointment.id,
          previousStatus: appointment.status,
          handledBy: ctx.user.id,
          eventNote: `Status revertido pelo administrador: de ${appointment.status === "completed" ? "Concluída" : "Recebida"} para Pendente.${tinha ? ` A nota estava com ${tinha}.` : ""}`,
        });
      }),
    /**
     * Devolve uma nota concluída ao backlog.
     *
     * Só o administrador, e só a partir de "Concluída": uma nota recebida já
     * tem o caminho dela para o backlog na própria janela de finalizar. Aqui é
     * o caso de quem fechou e descobriu depois que não estava resolvido.
     *
     * O motivo é obrigatório, e tem que ser um dos conhecidos: é por ele que o
     * planejamento filtra a fila, e um motivo inventado some do filtro.
     */
    voltarParaBacklog: protectedProcedure
      .input(z.object({
        appointmentId: z.number().int().positive(),
        backlogReasonCode: z.string().max(60),
        backlogReason: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        if (!ehMotivoConhecido(input.backlogReasonCode)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha um motivo de backlog da lista." });
        }
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        if (appointment.status !== "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Somente notas concluídas voltam para o backlog por aqui." });
        }
        // O motivo anterior vai para o histórico antes de ser escrito por cima.
        // Sem isto, devolver uma nota ao backlog apagava em silêncio o motivo
        // que veio do acervo, e ele só existia naquele campo.
        const tinha = [
          appointment.miroNumber ? `MIRO ${appointment.miroNumber}` : null,
          appointment.backlogReasonCode ? `o motivo anterior "${rotuloDoMotivo(appointment.backlogReasonCode)}"` : null,
        ].filter(Boolean).join(" e ");
        return devolverParaBacklog({
          appointmentId: appointment.id,
          previousStatus: appointment.status,
          handledBy: ctx.user.id,
          backlogReasonCode: input.backlogReasonCode,
          backlogReason: input.backlogReason?.trim() || null,
          eventNote: `Devolvida ao backlog pelo administrador: ${rotuloDoMotivo(input.backlogReasonCode)}.${input.backlogReason?.trim() ? ` ${input.backlogReason.trim()}` : ""}${tinha ? ` A nota tinha ${tinha}.` : ""}`,
        });
      }),
    /**
     * Corrige o motivo de uma nota que já está em backlog.
     *
     * Catorze motivos parecidos numa lista: errar o clique é questão de tempo,
     * e é por esse código que o fim do mês conta quantas notas travaram por
     * cada coisa. A nota não se move — só o enunciado do problema muda.
     */
    /**
     * O motivo que o Agiliza tinha dado para esta nota.
     *
     * Quem devolve uma nota ao backlog escreve por cima do campo de motivo, e
     * aí o que veio do acervo some da nota — mas não do histórico, que a
     * importação escreveu com o código de origem entre parênteses. É de lá que
     * isto lê, para a tela poder oferecer "era isto, restaura" em vez de deixar
     * a pessoa adivinhar entre catorze motivos parecidos.
     *
     * Devolve null quando a nota não veio do acervo, ou veio sem motivo: não
     * tem o que restaurar, e inventar um seria pior do que não oferecer nada.
     */
    motivoOriginalDoBacklog: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const codigoOriginal = codigoDoAgilizaNoHistorico(await linhasDeBacklogNoHistorico(input.appointmentId));
        if (!codigoOriginal) return null;
        // O mesmo mapeamento da importação: um código que não tem par na lista
        // do portal vira a sua própria forma maiúscula, como lá.
        const codigo = MOTIVOS_DO_AGILIZA[codigoOriginal] ?? codigoDeOrigem(codigoOriginal);
        if (!codigo) return null;
        return { codigoOriginal, codigo, rotulo: rotuloDoMotivo(codigo), naLista: ehMotivoConhecido(codigo) };
      }),
    corrigirMotivoDoBacklog: protectedProcedure
      .input(z.object({
        appointmentId: z.number().int().positive(),
        backlogReasonCode: z.string().max(60),
        backlogReason: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        if (!ehMotivoConhecido(input.backlogReasonCode)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha um motivo de backlog da lista." });
        }
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        if (appointment.status !== "backlog") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Só dá para corrigir o motivo de uma nota que está em backlog." });
        }
        return corrigirMotivoDoBacklog({
          appointmentId: appointment.id,
          handledBy: ctx.user.id,
          backlogReasonCode: input.backlogReasonCode,
          backlogReason: input.backlogReason?.trim() || null,
          eventNote: `Motivo do backlog corrigido pelo administrador: de "${rotuloDoMotivo(appointment.backlogReasonCode)}" para "${rotuloDoMotivo(input.backlogReasonCode)}".${input.backlogReason?.trim() ? ` ${input.backlogReason.trim()}` : ""}`,
        });
      }),
    returnForRescheduling: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        if (appointment.status !== "received" && appointment.status !== "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Somente notas Recebidas ou Concluídas podem retornar para agendamento." });
        }
        return returnAppointmentForRescheduling({
          appointmentId: appointment.id,
          previousStatus: appointment.status,
          previousScheduledFor: appointment.scheduledFor,
          handledBy: ctx.user.id,
        });
      }),
    create: protectedProcedure
      .input(
        z.object({
          serviceType: z.string().min(2).max(80),
          scheduledFor: z.string().datetime(),
          notes: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canRequestAppointment(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente fornecedores podem solicitar agendamentos." });
        }
        const date = new Date(input.scheduledFor);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma data e horário futuros." });
        }
        return createAppointment({ ...input, scheduledFor: date, supplierId: ctx.user.id });
      }),
    createManualXml: protectedProcedure
      .input(z.object({ fileName: z.string().min(5).max(255), xmlBase64: z.string().min(4).max(2_800_000), purchaseOrder: z.string().min(1).max(200), suggestedFor: z.string().datetime().optional(), suggestionNotes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canRequestAppointment(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente fornecedores podem criar agendamentos manuais." });
        }
        if (!input.fileName.toLowerCase().endsWith(".xml")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas o arquivo XML da nota fiscal." });
        }
        const purchaseOrder = normalizePurchaseOrder(input.purchaseOrder);
        if (!purchaseOrder) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o número do pedido de compra da nota." });
        }
        // Vários pedidos são gravados num campo só; passar do limite cortaria o
        // último pela metade e a nota ficaria com um pedido que não existe.
        if (!pedidosCabem(input.purchaseOrder)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `São pedidos demais para uma nota só (o limite é ${PURCHASE_ORDER_MAX} caracteres somando todos). Divida em mais de um agendamento.` });
        }
        const suggestedFor = input.suggestedFor ? new Date(input.suggestedFor) : undefined;
        if (suggestedFor && (Number.isNaN(suggestedFor.getTime()) || suggestedFor.getTime() <= Date.now())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A sugestão de data e horário precisa ser futura." });
        }
        const content = decodeXmlBase64(input.xmlBase64);
        let invoice;
        try {
          invoice = parseInvoiceXml(content);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível ler o XML." });
        }
        // A dica existe porque o reenvio quase sempre tem a mesma causa: a nota
        // cobre mais de um pedido de compra e o fornecedor manda o mesmo XML
        // uma vez para cada um. Recusar sem dizer isso não resolve o problema
        // dele — só o deixa sem saída.
        await recusarNotaRepetida(
          // A empresa do login entra como reserva: XML sem o CNPJ do emitente
          // passava sem conferência nenhuma.
          { accessKey: invoice.accessKey, supplierCnpj: invoice.supplierCnpj, companyCnpj: ctx.user.companyCnpj, invoiceNumber: invoice.invoiceNumber },
          'Se esta nota cobre mais de um pedido de compra, eles vão todos num envio só: use o botão "Outro pedido" antes de enviar. Se faltou incluir um pedido, fale com a equipe de recebimento em vez de enviar a nota de novo.',
        );
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`agendamentos-xml/${ctx.user.id}/${safeName}`, content, "application/xml");
        return createManualXmlAppointment({
          supplierId: ctx.user.id,
          xmlStorageKey: stored.key,
          xmlUrl: stored.url,
          xmlFileName: safeName,
          invoiceNumber: invoice.invoiceNumber,
          invoiceAccessKey: invoice.accessKey,
          // O que o fornecedor informou vale mais do que a tag xPed: o XML só a
          // traz às vezes, e é este número que o Operador usa para achar a
          // compra. O do XML continua sendo lido para os recebimentos avulsos,
          // onde não há fornecedor na tela para digitar.
          purchaseOrder,
          invoiceSupplierName: invoice.supplierName,
          invoiceSupplierCnpj: invoice.supplierCnpj,
          recipientCnpj: invoice.recipientCnpj,
          invoiceIssuedAt: invoice.issuedAt,
          serviceDescription: invoice.serviceDescription,
          invoiceTotalCents: invoice.totalCents,
          invoiceItemsJson: JSON.stringify(invoice.items),
          invoiceVolumeCount: invoice.volumeCount,
          suggestedFor,
          suggestionNotes: input.suggestionNotes,
        });
      }),
    registerUnscheduledReceipt: protectedProcedure
      // Quem registra diz em que fila a nota entra: a carga que já chegou e foi
      // conferida vai para Recebido; a nota que veio antes do caminhão fica em
      // Pendente, esperando data.
      .input(z.object({ fileName: z.string().min(5).max(255), xmlBase64: z.string().min(4).max(2_800_000), situacao: z.enum(["recebida", "pendente"]) }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        if (!input.fileName.toLowerCase().endsWith(".xml")) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas o arquivo XML da nota fiscal." });
        const content = decodeXmlBase64(input.xmlBase64);
        let invoice;
        try { invoice = parseInvoiceXml(content); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível ler o XML." }); }
        // Antes de guardar o arquivo: nota repetida não deve nem ocupar espaço
        // no armazenamento.
        await recusarNotaRepetida({ accessKey: invoice.accessKey, supplierCnpj: invoice.supplierCnpj, invoiceNumber: invoice.invoiceNumber });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`recebimentos-avulsos/${ctx.user.id}/${safeName}`, content, "application/xml");
        return createUnscheduledReceipt({ operatorId: ctx.user.id, xmlStorageKey: stored.key, xmlUrl: stored.url, xmlFileName: safeName, invoiceNumber: invoice.invoiceNumber, invoiceAccessKey: invoice.accessKey, purchaseOrder: invoice.purchaseOrder, invoiceSupplierName: invoice.supplierName, invoiceSupplierCnpj: invoice.supplierCnpj, recipientCnpj: invoice.recipientCnpj, invoiceIssuedAt: invoice.issuedAt, serviceDescription: invoice.serviceDescription, invoiceTotalCents: invoice.totalCents, invoiceItemsJson: JSON.stringify(invoice.items), invoiceVolumeCount: invoice.volumeCount, situacao: input.situacao });
      }),
    updateStatus: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["scheduled", "received", "completed", "backlog", "rejected"]), rejectionReason: z.string().max(1000).optional(), rejectionReasonCode: z.string().max(60).optional(), miroNumber: z.string().max(40).optional(), note: z.string().max(1000).optional(), backlogReasonCode: z.string().max(60).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canMoveAppointmentStatus(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a quem cuida da agenda." });
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canTransitionAppointment(appointment.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Essa alteração de status não é permitida." });
        }
        // Concluir é o passo que fecha a nota contra o SAP, e o MIRO é o que
        // liga um ao outro. Cobrado aqui porque depois ninguém volta para
        // preencher: a nota sai da tela e o número se perde.
        let miroNumber: string | undefined;
        if (input.status === "completed") {
          const numero = normalizeMiroNumber(input.miroNumber);
          if (!numero) throw new TRPCError({ code: "BAD_REQUEST", message: `Informe o número MIRO com exatamente ${MIRO_DIGITS} dígitos.` });
          miroNumber = numero;
        }
        const observacao = input.note?.trim();
        // O backlog exige a categoria e a descrição. A categoria dá o número do
        // fim do mês; a descrição é o que quem vai tratar precisa ler. Uma nota
        // que volta sem dizer por quê só transfere o problema de mesa.
        let backlogReasonCode: string | undefined;
        if (input.status === "backlog") {
          if (!ehMotivoConhecido(input.backlogReasonCode)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o motivo do backlog." });
          }
          if (!observacao) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Descreva o que houve para mandar a nota ao backlog." });
          }
          backlogReasonCode = input.backlogReasonCode;
        }
        const notaDoEvento = input.status === "backlog"
          ? `${rotuloDoMotivo(backlogReasonCode)}: ${observacao}`
          : observacao || (input.status === "received" ? "Recebimento confirmado pelo operador." : input.status === "completed" ? `Recebimento concluído. MIRO ${miroNumber}.` : undefined);
        const atualizada = await updateAppointmentStatus({ ...input, miroNumber, backlogReasonCode, backlogReason: observacao, previousStatus: appointment.status, handledBy: ctx.user.id, eventNote: notaDoEvento });

        // O aviso sai depois de a recusa estar gravada, e sem poder desfazê-la.
        if (input.status === "rejected") {
          await avisarFornecedorDaRecusa(
            {
              id: appointment.id,
              supplierId: appointment.supplierId,
              invoiceNumber: appointment.invoiceNumber,
              purchaseOrder: appointment.purchaseOrder,
              scheduledFor: appointment.scheduledFor,
              recipientCnpj: appointment.recipientCnpj,
              semAgendamento: appointment.semAgendamento,
            },
            { motivoCodigo: input.rejectionReasonCode ?? null, descricao: observacao ?? input.rejectionReason ?? null },
            ctx.user.id,
          );
        }
        return atualizada;
      }),
    confirmPreNote: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        // A pré-nota é um passo do lançamento da carga recebida: fica com quem
        // recebe. O planejamento vê a marca, mas não a coloca.
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.preNoteConfirmedAt) return appointment;
        return confirmAppointmentPreNote({ appointmentId: appointment.id, status: appointment.status, operatorId: ctx.user.id });
      }),
    /**
     * A urgência que o planejamento enxerga e o pedido de compra não.
     *
     * Marcar prioridade é trabalho de quem planeja a semana, e por isso fica
     * com a mesa de agendamento inteira — planejador incluído. Não é mexer no
     * andamento da nota: não recebe, não recusa, não conclui. Só diz que essa
     * não pode esperar.
     */
    marcarUrgencia: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), urgente: z.boolean(), motivo: z.string().max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        return marcarUrgencia({
          appointmentId: appointment.id,
          status: appointment.status,
          urgente: input.urgente,
          motivo: input.motivo?.trim() || null,
          handledBy: ctx.user.id,
        });
      }),
    /**
     * Informar (ou corrigir) o pedido de compra de uma nota.
     *
     * O pedido é obrigatório quando o fornecedor envia pelo portal, mas falta
     * nos dois caminhos que não passam por ele: o recebimento sem agendamento,
     * que lê o pedido do XML — e nem todo XML o traz —, e o acervo importado,
     * que herda o que a planilha tinha. Sem o pedido, o recebimento não tem
     * contra o que conferir, e até aqui não havia como consertar pela tela.
     *
     * Dez dígitos, como o resto do sistema exige: número curto aqui vira uma
     * nota que ninguém consegue conferir no SAP depois.
     */
    definirPedido: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), purchaseOrders: z.array(z.string().trim()).min(1, "Informe ao menos um pedido.").max(10) }))
      .mutation(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });

        /*
         * O fornecedor também corrige — enquanto a nota ainda está pendente.
         *
         * Digitar o pedido errado no envio é o erro mais comum do portal, e
         * até aqui ele só tinha um conserto: ligar para a doca e pedir para
         * alguém de dentro arrumar. A nota fica parada no meio disso.
         *
         * Depois que o operador agenda, não: a partir daí o pedido é o que a
         * doca vai conferir contra a carga, e mudá-lo sem a mesa saber
         * trocaria a conferência debaixo de quem recebe. Dali em diante o
         * caminho é a conversa da nota.
         */
        if (!isSchedulingDesk(ctx.user.role)) {
          if (!isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Esta nota não é da sua empresa." });
          }
          if (appointment.status !== "pending") {
            throw new TRPCError({ code: "FORBIDDEN", message: "A nota já foi agendada. Para corrigir o pedido agora, fale pela conversa da nota." });
          }
        }
        const pedidos = input.purchaseOrders.map(pedido => pedido.replace(/\D/g, "")).filter(Boolean);
        if (!pedidos.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos um pedido de compra." });
        const invalido = pedidos.find(pedido => pedido.length !== 10);
        if (invalido) throw new TRPCError({ code: "BAD_REQUEST", message: `O pedido ${invalido} não tem 10 dígitos.` });
        const purchaseOrder = pedidos.join(", ");
        if (!pedidosCabem(purchaseOrder)) throw new TRPCError({ code: "BAD_REQUEST", message: `Os pedidos não cabem em ${PURCHASE_ORDER_MAX} caracteres.` });
        return definirPedidoDaNota({
          appointmentId: appointment.id,
          status: appointment.status,
          purchaseOrder,
          anterior: appointment.purchaseOrder,
          handledBy: ctx.user.id,
        });
      }),
    desfazerPreNota: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        // Quem pode marcar pode desmarcar: o erro de clique é de quem usa a
        // tela, e mandar a pessoa pedir para outra desfazer transformaria um
        // engano de um segundo num pedido que fica para depois.
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!appointment.preNoteConfirmedAt) return appointment;
        return desfazerPreNotaDoAgendamento({ appointmentId: appointment.id, status: appointment.status, operatorId: ctx.user.id });
      }),
    activeForSupplier: protectedProcedure
      .input(z.object({ supplierId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => { assertSchedulingDesk(ctx.user.role); return listSupplierActiveAppointments(input.supplierId); }),
    schedule: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), scheduledFor: z.string().datetime(), acceptedSuggestionId: z.number().int().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canScheduleAppointment(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este item não pode ser agendado." });
        const scheduledFor = new Date(input.scheduledFor);
        if (Number.isNaN(scheduledFor.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Data e horário inválidos." });
        if (input.acceptedSuggestionId) {
          const suggestion = await getSuggestionById(input.acceptedSuggestionId);
          if (!suggestion || suggestion.appointmentId !== appointment.id || suggestion.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "A sugestão selecionada não está disponível." });
        }
        const remarcado = appointment.status === "scheduled";
        const agendado = await scheduleAppointment({ appointmentId: appointment.id, previousStatus: appointment.status, previousScheduledFor: appointment.scheduledFor, scheduledFor, handledBy: ctx.user.id, rescheduled: remarcado, acceptedSuggestionId: input.acceptedSuggestionId });
        // Sem esperar o e-mail: a data já está marcada, e quem está na tela não
        // precisa aguardar o servidor de mensagens para seguir com a fila.
        if (agendado) void avisarFornecedorDoAgendamento(agendado, remarcado, ctx.user.id);
        return agendado;
      }),
    tratarBacklog: protectedProcedure
      .input(z.object({
        appointmentId: z.number().int().positive(),
        miroNumber: z.string().max(40),
        quotationNumber: z.string().max(120).optional(),
        memorizedOrder: z.string().max(120).optional(),
        hisEntryDocument: z.string().max(120).optional(),
        hisExitDocument: z.string().max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canTreatBacklog(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A tratativa do backlog é do Planejador." });
        }
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.status !== "backlog") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Só notas em Backlog entram em tratativa." });
        }
        const validacao = validarTratativa(input);
        if (!validacao.ok) throw new TRPCError({ code: "BAD_REQUEST", message: validacao.erro });
        return treatBacklogAppointment({
          appointmentId: appointment.id,
          previousStatus: appointment.status,
          handledBy: ctx.user.id,
          eventNote: resumoDaTratativa(validacao.dados),
          ...validacao.dados,
        });
      }),
    rescue: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        // Resgatar devolve à fila uma nota que foi recusada — desfaz uma
        // decisão da doca, e por isso é de quem toma essa decisão.
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canRescueAppointment(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas itens rejeitados podem ser resgatados." });
        return rescueAppointment({ appointmentId: appointment.id, handledBy: ctx.user.id });
      }),
  }),
  suggestions: router({
    /** A data proposta em cada nota que ainda espera resposta, para a lista. */
    pendentesPorNota: protectedProcedure.query(async ({ ctx }) => {
      assertSchedulingDesk(ctx.user.role);
      return sugestoesPendentesPorNota();
    }),
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive().optional(), status: z.enum(["pending", "accepted", "declined"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (input?.appointmentId && !isSchedulingDesk(ctx.user.role)) {
          const appointment = await getAppointmentById(input.appointmentId);
          if (!appointment || !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar sugestões deste agendamento." });
        }
        return listAppointmentSuggestions({ appointmentId: input?.appointmentId, status: input?.status, supplierIds: isSchedulingDesk(ctx.user.role) ? undefined : await supplierScopeIds(ctx.user) });
      }),
    create: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), suggestedFor: z.string().datetime(), notes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canSuggestSchedule(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Este perfil não envia sugestões de data." });
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode sugerir horário para este agendamento." });
        // O planejador trabalha a agenda inteira; o fornecedor, só as notas da
        // própria empresa. Por isso o recorte de escopo continua valendo para
        // quem não está na mesa de agendamentos.
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode sugerir horário para este agendamento." });
        }
        if (!canApplySuggestion(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este agendamento não aceita novas sugestões." });
        const suggestedFor = new Date(input.suggestedFor);
        if (Number.isNaN(suggestedFor.getTime()) || suggestedFor.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Sugira uma data e horário futuros." });
        // `supplierId` sempre guardou quem escreveu a sugestão, e continua
        // assim com o planejador. O efeito colateral é bem-vindo: a proposta
        // dele fica fora do recorte do fornecedor, que não precisa acompanhar
        // um pedido interno ainda não confirmado.
        return createAppointmentSuggestion({ ...input, supplierId: ctx.user.id, suggestedFor });
      }),
    accept: protectedProcedure
      .input(z.object({ suggestionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const suggestions = await listAppointmentSuggestions({ status: "pending" });
        const suggestion = suggestions.find(item => item.id === input.suggestionId);
        if (!suggestion) throw new TRPCError({ code: "NOT_FOUND", message: "Sugestão pendente não encontrada." });
        if (!canApplySuggestion(suggestion.appointmentStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "O agendamento não pode receber esta sugestão." });
        return acceptAppointmentSuggestion({ suggestionId: input.suggestionId, appointmentStatus: suggestion.appointmentStatus, handledBy: ctx.user.id });
      }),
  }),
  manutencao: router({
    // Só administrador: o arquivo gerado contém a base inteira.
    gerarBackup: adminProcedure.mutation(async () => executarBackup("manual")),
    /**
     * As notas que já entraram repetidas, para separar herança de problema novo.
     *
     * A trava recusa duplicata nova, mas não desfaz as antigas. Sem esta lista,
     * qualquer repetição vista na tela parece falha da trava.
     */
    notasRepetidas: adminProcedure.query(async () => notasRepetidas()),
    /**
     * Apagar uma das cópias de uma nota repetida.
     *
     * A única exclusão de nota do sistema, e só do administrador. O servidor
     * confere de novo que a nota está mesmo repetida e que sobra outra cópia:
     * a tela pode estar desatualizada, e apagar a última cópia deixaria a
     * entrega sem registro nenhum.
     */
    excluirNotaRepetida: adminProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await excluirNotaRepetida({ appointmentId: input.appointmentId, adminId: ctx.user.id });
        } catch (erro) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro instanceof Error ? erro.message : "Não consegui apagar esta nota." });
        }
      }),
    /**
     * Limpa de uma vez as cópias de um grupo repetido.
     *
     * A tela passa a identidade do grupo, e não a lista de notas: assim o que
     * é apagado vem do que o servidor acabou de ler, e não do que o navegador
     * estava mostrando quando alguém clicou.
     */
    limparCopiasRepetidas: adminProcedure
      .input(z.object({ identidade: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await limparCopiasRepetidas({ identidade: input.identidade, adminId: ctx.user.id });
        } catch (erro) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro instanceof Error ? erro.message : "Não consegui limpar as cópias." });
        }
      }),
    /**
     * Qual versão está rodando, para o rodapé de qualquer perfil.
     *
     * Separada do estado do sistema porque aquele é do administrador e traz o
     * banco inteiro; esta responde uma coisa só, e é a que todo mundo precisa
     * quando pergunta "já atualizou?". Vem do processo no ar, e não da build
     * do navegador: é o servidor que sabe qual código está servindo.
     */
    versaoNoAr: protectedProcedure.query(() => ({
      commit: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null,
      subidoHaSegundos: Math.round(process.uptime()),
    })),
    /**
     * O que ainda está aberto na segurança, para o administrador conferir.
     *
     * Eram combinados de conversa — "no sábado troca o banco para a rede
     * interna" — e conversa se perde. Aqui o servidor no ar responde o que ele
     * vê, e o que estiver vermelho é o que falta fazer.
     */
    estadoDeSeguranca: adminProcedure.query(() =>
      montarEstadoDeSeguranca({
        databaseUrl: ENV.databaseUrl,
        segredoDaSessao: ENV.cookieSecret,
        appUrl: ENV.appUrl,
        contasDeTeste: politicaDasContasDeTeste(),
        emailConfigurado: isMailerConfigured(),
        backupConfigurado: isS3Configured(),
      }),
    ),
    /**
     * O link para baixar uma cópia do banco no computador de quem administra.
     *
     * O backup saía todo dia e ia para o bucket — e parava ali. Para pegar o
     * arquivo era preciso ter conta no provedor de armazenamento, que quem
     * administra o sistema não tem. Backup que o dono não consegue baixar é
     * metade de um backup: serve para restaurar de dentro, não serve para levar
     * os dados embora, nem para abrir numa planilha, nem para entregar a um
     * contador ou a uma auditoria.
     *
     * O link é assinado e expira. É melhor do que servir o arquivo por aqui:
     * são dezenas de megabytes que não precisam atravessar o processo do app, e
     * um link que vaza morre sozinho.
     *
     * Só administrador, porque o arquivo é a base inteira: todas as notas,
     * todos os fornecedores, todas as conversas.
     */
    linkDoBackup: adminProcedure
      .input(z.object({ chave: z.string().min(1).max(512) }))
      .mutation(async ({ input }) => {
        // A chave tem que ser de um backup que este sistema gerou, e não um
        // caminho qualquer vindo da tela: senão esta rota vira um jeito de ler
        // qualquer arquivo do bucket, inclusive XML de nota de fornecedor.
        const conhecida = await backupConhecido(input.chave);
        if (!conhecida) throw new TRPCError({ code: "NOT_FOUND", message: "Este backup não está na lista de cópias geradas pelo sistema." });
        return { url: await storageGetSignedUrl(input.chave), chave: input.chave };
      }),
    /** As cópias já gravadas, da mais nova para a mais velha, para baixar. */
    backupsParaBaixar: adminProcedure.query(async () => backupsDisponiveis(20)),
    /**
     * Procurar, dentro de uma cópia, uma nota que foi apagada.
     *
     * Apagar uma nota é definitivo: o banco leva junto, em cascata, o
     * histórico, a conversa com o fornecedor e as notas internas. Não existe
     * lixeira. O que existe é a cópia da madrugada — e até aqui ela só servia
     * para baixar o arquivo, o que não ajuda quem precisa da nota de volta
     * dentro do sistema.
     *
     * É mutation, e não query, porque cada busca baixa e abre o arquivo
     * inteiro: isso acontece quando alguém pede, e não sozinho a cada vez que a
     * tela recarrega.
     */
    procurarNotaNoBackup: adminProcedure
      .input(z.object({ chave: z.string().min(1).max(512), numeroDaNota: z.string().trim().min(1).max(100) }))
      .mutation(async ({ input }) => {
        // Mesma conferência do download: a chave tem que ser de um backup que
        // este sistema gerou, senão a rota vira um jeito de ler qualquer
        // arquivo do bucket.
        if (!(await backupConhecido(input.chave))) throw new TRPCError({ code: "NOT_FOUND", message: "Este backup não está na lista de cópias geradas pelo sistema." });
        try {
          return await procurarNotaEmBackup(input);
        } catch (erro) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro instanceof Error ? erro.message : "Não consegui abrir este backup." });
        }
      }),
    /**
     * Recolocar no banco a nota apagada, com a conversa e o histórico dela.
     *
     * Volta com o mesmo id: é esse número que a conversa e o histórico citam.
     * O que mudou na nota entre a cópia e a exclusão não volta — a tela mostra
     * de quando é a cópia justamente para quem restaura saber o que está
     * recebendo de volta.
     */
    restaurarNotaDoBackup: adminProcedure
      .input(z.object({ chave: z.string().min(1).max(512), appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!(await backupConhecido(input.chave))) throw new TRPCError({ code: "NOT_FOUND", message: "Este backup não está na lista de cópias geradas pelo sistema." });
        try {
          return await restaurarNotaDoBackup({ chave: input.chave, appointmentId: input.appointmentId, adminId: ctx.user.id });
        } catch (erro) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro instanceof Error ? erro.message : "Não consegui restaurar esta nota." });
        }
      }),
    /** O que a tela mostra para provar que a cópia da madrugada está saindo. */
    situacaoDoBackup: adminProcedure.query(async () => ({
      ultimo: await ultimoBackupConcluido(),
      tentativas: await ultimasTentativasDeBackup(5),
    })),
    /**
     * O que está no ar, em números conferíveis.
     *
     * "Atualizei e não mudou nada" é impossível de responder de fora: não dá
     * para saber se o deploy entrou, se o banco acompanhou, ou se a tela é
     * outra. Aqui o próprio sistema diz qual commit está rodando, desde quando,
     * e quantas migrações o banco tem — e aí a pergunta vira uma conferência.
     */
    estadoDoSistema: adminProcedure.query(async () => {
      const migracoes = await situacaoDasMigracoes();
      const contas = politicaDasContasDeTeste();
      return {
        // O Railway injeta estas variáveis no container a cada deploy.
        commit: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null,
        branch: process.env.RAILWAY_GIT_BRANCH || null,
        mensagemDoCommit: (process.env.RAILWAY_GIT_COMMIT_MESSAGE || "").split("\n")[0] || null,
        subidoHaSegundos: Math.round(process.uptime()),
        migracoesRegistradas: migracoes.registradas,
        migracoesEsperadas: migracoes.esperadas,
        notasNoBanco: await contarAgendamentos(),
        // O que o servidor que está no ar entende sobre as contas de teste.
        // Sem isto, descobrir por que elas não entram é tentativa e erro na
        // tela de login, que é o pior lugar para investigar qualquer coisa.
        contasDeTeste: { ligadas: contas.ligadas, motivo: contas.ligadas ? null : contas.motivo },
        // O aviso ao fornecedor depende de o envio de e-mail estar configurado.
        // Desligado, o agendamento funciona e ninguém é avisado — e isso não
        // pode ser descoberto pela reclamação de um fornecedor que perdeu a
        // data. Fica escrito onde se olha o estado do sistema.
        avisoPorEmail: isMailerConfigured(),
      };
    }),
    /**
     * Manda um e-mail de teste para quem pediu.
     *
     * O destino é sempre o e-mail do próprio administrador logado: assim o
     * portal não vira um jeito de mandar mensagem para endereço de terceiro, e
     * quem testa recebe na própria caixa, que é onde ele consegue conferir.
     *
     * Não estoura em caso de falha — devolve o motivo. A recusa do provedor é
     * a resposta do teste, não um erro do sistema, e é ela que diz o que
     * ajustar: senha de aplicativo errada, SMTP bloqueado, remetente proibido.
     */
    enviarEmailDeTeste: adminProcedure.mutation(async ({ ctx }) => {
      const caminho = caminhoDoEnvio();
      if (!caminho) return { enviado: false as const, para: null, motivo: "O envio de e-mail não está configurado neste servidor." };
      if (!ctx.user.email) return { enviado: false as const, para: null, motivo: "A sua conta não tem e-mail cadastrado para receber o teste." };
      try {
        await sendMail({ to: ctx.user.email, ...conteudoDoTeste({ caminho, remetente: remetente(), quando: new Date() }) });
        return { enviado: true as const, para: ctx.user.email, motivo: null };
      } catch (erro) {
        console.error("[E-mail de teste] o provedor recusou o envio:", erro);
        return { enviado: false as const, para: ctx.user.email, motivo: `${motivoDaFalha(erro)} (tentou ${descricaoDoDestino()})` };
      }
    }),
    /**
     * Importa o acervo do sistema anterior a partir dos CSVs exportados de lá.
     *
     * Existe como rota, e não só como script, porque script exige console do
     * provedor — e o que exige console não é feito. Sem "confirmar" é só
     * simulação: lê, valida e conta, sem gravar. A carga é idempotente por
     * nota, então uma requisição que estoure o tempo pode ser repetida sem
     * duplicar nada.
     */
    /**
     * Importa o relatório de pedidos de compra do SAP.
     *
     * Separada da importação do acervo de propósito: é outro arquivo, outra
     * origem e outra frequência — o acervo veio uma vez, este vem todo dia.
     */
    importarPedidos: adminProcedure
      .input(z.object({
        planilha: z.string().min(1, "Envie a planilha do SAP.").max(20_000_000, "A planilha passa do tamanho aceito."),
        confirmar: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        if (importacaoEmCurso) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma importação em andamento. Espere ela terminar." });
        }
        importacaoEmCurso = true;
        try {
          const conteudo = Buffer.from(input.planilha, "base64");
          const { itens, recusas } = lerPedidosDoSap(conteudo);
          const pedidos = new Set(itens.map(item => item.purchaseOrder));
          const semUnidade = itens.filter(item => !item.recipientCnpj).length;
          const resumo = {
            linhas: itens.length,
            pedidos: pedidos.size,
            materiais: new Set(itens.map(item => item.sapCode).filter(Boolean)).size,
            semUnidade,
            recusas: recusas.slice(0, 20),
            totalDeRecusas: recusas.length,
          };
          // A simulação diz o que entraria sem gravar nada, como na do acervo:
          // arquivo errado é o tipo de engano que se descobre olhando o resumo.
          if (!input.confirmar) return { ...resumo, gravados: 0, marcadosComoAusentes: 0, simulacao: true as const };
          const gravacao = await gravarPedidosDoSap(itens);
          return { ...resumo, ...gravacao, simulacao: false as const };
        } finally {
          importacaoEmCurso = false;
        }
      }),
    /** Quantos pedidos o portal conhece e de quando é a última leitura. */
    situacaoDosPedidos: adminProcedure.query(async () => situacaoDosPedidos()),
    importarAcervo: adminProcedure
      .input(
        z.object({
          // O teto acompanha o precedente do envio de XML: recusa limpa do zod
          // em vez de estourar a memória do servidor com um arquivo absurdo.
          consolidado: z.string().min(1, "Envie o relatório consolidado.").max(12_000_000, "O relatório consolidado passa do tamanho aceito."),
          detalhado: z.string().max(12_000_000, "O relatório detalhado passa do tamanho aceito.").nullish(),
          backlog: z.string().max(12_000_000, "O relatório de backlog passa do tamanho aceito.").nullish(),
          confirmar: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) => {
        // Uma de cada vez. A idempotência da carga é ler-antes-de-escrever, e
        // não um índice único no banco: se o navegador perder a resposta de uma
        // gravação demorada e o administrador clicar de novo, duas execuções
        // simultâneas leriam "ainda não existe" para a mesma nota e gravariam
        // as duas.
        if (importacaoEmCurso) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma importação em andamento. Espere ela terminar." });
        }
        importacaoEmCurso = true;
        try {
          return await importarAcervo(
            {
              consolidado: decodificarCsv(input.consolidado),
              detalhado: input.detalhado ? decodificarCsv(input.detalhado) : null,
              backlog: input.backlog ? decodificarCsv(input.backlog) : null,
            },
            { confirmar: input.confirmar }
          );
        } finally {
          importacaoEmCurso = false;
        }
      }),
  }),
  accessRequests: router({
    listPending: adminProcedure.query(async () => listPendingAccessRequests()),
    decide: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), approve: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        // Guard against an administrator locking themselves out mid-session.
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar o próprio acesso." });
        }
        await setUserAccessStatus({ userId: input.userId, accessStatus: input.approve ? "approved" : "rejected" });
        // Aprovar sem avisar é deixar a pessoa esperando por algo que já
        // aconteceu: ela não tem como saber, e a maioria não tenta de novo.
        const solicitante = input.approve ? await getUserById(input.userId) : null;
        const avisado = solicitante ? await avisarAcessoLiberado(solicitante, ctx.req) : false;
        return { success: true, avisado } as const;
      }),
  }),
  messages: router({
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await getAccessibleAppointment(ctx.user, input.appointmentId);
        await markAppointmentMessagesRead({ appointmentId: input.appointmentId, userId: ctx.user.id, isOperator: isSchedulingDesk(ctx.user.role) });
        return listAppointmentMessages(input.appointmentId);
      }),
    send: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), body: z.string().trim().min(1, "Digite uma mensagem.").max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await getAccessibleAppointment(ctx.user, input.appointmentId);
        const id = await createAppointmentMessage({ appointmentId: input.appointmentId, senderId: ctx.user.id, body: input.body.trim(), senderIsOperator: isSchedulingDesk(ctx.user.role) });
        return { id };
      }),
    notifications: protectedProcedure.query(({ ctx }) => listUnreadAppointmentMessages({ userId: ctx.user.id, isOperator: isSchedulingDesk(ctx.user.role) })),
    /**
     * O botão "Limpar" do sino: dar por visto tudo o que está nele.
     *
     * Não apaga nada — nem mensagem, nem nota, nem backlog. Só grava que esta
     * pessoa já leu, e o que ela não leu continua lá. O pedido de liberação do
     * portão fica de fora de propósito: é caminhão parado esperando decisão, e
     * some da tela só quando alguém decide.
     */
    limparAvisos: protectedProcedure.mutation(async ({ ctx }) => {
      await limparAvisos({
        userId: ctx.user.id,
        isOperator: isSchedulingDesk(ctx.user.role),
        trataBacklog: canTreatBacklog(ctx.user.role),
      });
      return { ok: true };
    }),
    /** Quantas mensagens cada nota tem, e quantas são novas, para marcar a conversa certa. */
    porNota: protectedProcedure.query(({ ctx }) => contarMensagensPorNota({ userId: ctx.user.id, isOperator: isSchedulingDesk(ctx.user.role) })),
  }),
  reports: router({
    /**
     * Todos os fornecedores que o sistema conhece, com e sem login.
     *
     * Responde duas perguntas de uma vez: "esse fornecedor já está no portal, e
     * com qual e-mail?" e "quem ainda manda nota mas nunca foi cadastrado?".
     * Só administrador: é a relação de contato das empresas parceiras reunida
     * num arquivo que sai do portal.
     */
    fornecedores: adminProcedure.query(async () => panoramaDeFornecedores()),
    /**
     * As notas do relatório, filtradas no banco.
     *
     * O teto existe para a tela não receber a tabela inteira quando alguém
     * limpa os filtros; o total diz quantas ficaram de fora, e a tela mostra
     * isso em vez de fingir que são todas.
     */
    notas: protectedProcedure
      .input(
        z.object({
          scheduledStart: z.string().optional(),
          scheduledEnd: z.string().optional(),
          baseDaData: z.enum(BASES_DA_DATA).optional(),
          receivedStart: z.string().optional(),
          receivedEnd: z.string().optional(),
          status: statusSchema.optional(),
          supplier: z.string().max(255).optional(),
          recipientCnpj: z.string().max(40).optional(),
          recipientCnpjs: z.array(z.string().max(40)).max(20).optional(),
          limite: z.number().int().positive().max(5000).optional(),
        }).optional()
      )
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        return listReportRows({
          scheduledStart: input?.scheduledStart,
          scheduledEnd: input?.scheduledEnd,
          baseDaData: input?.baseDaData,
          receivedStart: input?.receivedStart,
          receivedEnd: input?.receivedEnd,
          status: input?.status as AppointmentStatus | undefined,
          supplier: input?.supplier,
          recipientCnpj: input?.recipientCnpj,
          recipientCnpjs: input?.recipientCnpjs,
          limite: input?.limite ?? 3000,
        });
      }),
    // O relatório de backlog junta o que está na nota com o que só existe no
    // histórico — quando entrou, quando saiu — e com as observações internas.
    // Por isso é montado aqui, e não a partir da lista de agendamentos.
    backlog: protectedProcedure.query(async ({ ctx }) => {
      assertSchedulingDesk(ctx.user.role);
      return listBacklogReportRows();
    }),
  }),
  internalNotes: router({
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        return listAppointmentInternalNotes(input.appointmentId);
      }),
    /**
     * Abrir a conversa é a leitura: some do sino o que a pessoa acabou de ver.
     *
     * Sem isto o aviso não tinha fim — clicar levava até a conversa e o número
     * continuava no sino, então ele parava de querer dizer alguma coisa.
     */
    marcarLida: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        await marcarConversaDaTratativaLida({ userId: ctx.user.id, appointmentId: input.appointmentId });
        return { ok: true };
      }),
    create: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), body: z.string().trim().min(1, "Escreva a observação.").max(2000) }))
      .mutation(async ({ ctx, input }) => {
        // Internas quer dizer internas: o fornecedor nunca lê esta tabela, e
        // quem não trabalha a agenda também não escreve nela.
        assertSchedulingDesk(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        const id = await createAppointmentInternalNote({ appointmentId: appointment.id, authorId: ctx.user.id, body: input.body.trim() });
        return { id };
      }),
  }),
  calendar: router({
    list: protectedProcedure
      .input(z.object({ start: z.string().datetime(), end: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const start = new Date(input.start);
        const end = new Date(input.end);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new TRPCError({ code: "BAD_REQUEST", message: "Período inválido." });
        // O calendário é a agenda do que ainda vai chegar. Nota recebida já
        // chegou, concluída já foi lançada e recusada não vem — deixá-las no
        // quadro faz o número do dia contar trabalho que não existe mais. O
        // histórico delas continua na lista e no relatório.
        return listCalendarAppointments(start, end);
      }),
  }),
  attendances: router({
    list: protectedProcedure
      .input(z.object({ status: z.enum(attendanceStatuses).optional(), statuses: z.array(z.enum(attendanceStatuses)).optional(), serviceType: z.enum(attendanceServiceTypes).optional() }).optional())
      .query(async ({ ctx, input }) => {
        assertAttendanceViewer(ctx.user.role);
        return hideDriverDocument(ctx.user.role, await listAttendances(input ?? {}));
      }),
    // O registro do dia é o que a operação de agendamentos consulta para saber
    // quais fornecedores e transportadoras entraram — por isso é o único ponto
    // do pátio aberto a ela.
    dayLog: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.").optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!canViewAttendances(ctx.user.role) && !isOperator(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Registro restrito às equipes internas." });
        }
        // O dia corrente é o de São Paulo, e não o do relógio do servidor.
        return hideDriverDocument(ctx.user.role, await listAttendancesByDay(input?.date ?? formatSaoPauloDateKey()));
      }),

    // O histórico geral é a consulta que a operação leva para a planilha, então
    // ele pede o período em vez de assumir um: sem as duas datas, a tela não
    // saberia o que está pedindo e o servidor devolveria o banco inteiro.
    report: protectedProcedure
      .input(
        z.object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD."),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD."),
        })
      )
      .query(async ({ ctx, input }) => {
        if (!canViewGateHistory(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "O histórico do portão é de quem responde pelo pátio." });
        }
        if (input.from > input.to) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A data inicial não pode ser depois da final." });
        }
        return hideDriverDocument(ctx.user.role, await listAttendancesInRange(input.from, input.to));
      }),

    overview: protectedProcedure.query(async ({ ctx }) => {
      assertAttendanceViewer(ctx.user.role);
      return buildAttendanceMetrics(await listAttendances());
    }),
    history: protectedProcedure
      .input(z.object({ attendanceId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        assertAttendanceViewer(ctx.user.role);
        await getExistingAttendance(input.attendanceId);
        return listAttendanceEvents(input.attendanceId);
      }),
    create: protectedProcedure
      .input(
        z.object({
          driverName: z.string().trim().min(3, "Informe o nome do motorista.").max(160),
          driverDocument: z.string().trim().max(32).optional(),
          invoiceNumbers: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
          licensePlate: z.string().trim().min(7, "Informe a placa completa.").max(12),
          supplierName: z.string().trim().max(160).optional(),
          serviceType: z.enum(attendanceServiceTypes),
          classification: z.enum(attendanceClassifications),
          classificationDetail: z.enum(attendanceClassificationDetails),
          notes: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertPortaria(ctx.user.role);
        if (!isValidClassificationDetail(input.classification, input.classificationDetail)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria informada não corresponde à classificação selecionada." });
        }
        const supplierRule = supplierNameRule(input.serviceType);
        if (supplierRule === "obrigatorio" && !input.supplierName) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o fornecedor." });
        }
        // Onde o campo não aparece na tela, um valor só chegaria por chamada
        // forjada — e gravaria um fornecedor que a Portaria nunca digitou.
        const supplierName = supplierRule === "oculto" ? null : (input.supplierName ?? null);
        return createAttendance({ ...input, supplierName, createdById: ctx.user.id });
      }),
    // Quem decide o recebimento é a Operação: a Portaria registra a chegada e
    // envia o caminhão para a decisão de quem vai receber a carga.
    decideReceipt: protectedProcedure
      .input(z.object({ attendanceId: z.number().int().positive(), decision: z.enum(["aprovar", "recusar"]), refusalReason: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        assertOperacao(ctx.user.role);
        const attendance = await getExistingAttendance(input.attendanceId);
        const invalid = validateEntryDecision(attendance.status, input.decision, input.refusalReason);
        if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: invalid });
        return decideAttendanceEntry({ attendanceId: input.attendanceId, decision: input.decision, refusalReason: input.refusalReason, decisionById: ctx.user.id });
      }),
    // Só o administrador apaga, e o que ele apaga é um registro de teste ou um
    // lançamento errado — por isso a exclusão é definitiva e leva o histórico
    // do protocolo junto, em vez de deixar um evento órfão apontando para nada.
    remove: adminProcedure
      .input(z.object({ attendanceId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const attendance = await getExistingAttendance(input.attendanceId);
        await deleteAttendanceById(attendance.id);
        return { protocol: attendance.protocol } as const;
      }),

    executeAction: protectedProcedure
      .input(
        z.object({
          attendanceId: z.number().int().positive(),
          action: z.enum(["iniciar", "liberar", "concluir"]),
          // A unidade tem duas docas, e informar é opcional: nem toda entrada
          // vai para doca, e o porteiro nem sempre sabe qual na hora de abrir.
          dockNumber: z.union([z.literal(1), z.literal(2)]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canPerformAttendanceAction(ctx.user.role, input.action)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Esta etapa é da ${attendanceActionOwner[input.action]}.`,
          });
        }
        const attendance = await getExistingAttendance(input.attendanceId);
        const invalid = validateOperationalTransition(attendance.status, input.action);
        if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: invalid });
        // A doca só faz sentido na abertura do portão: mandar uma doca junto
        // com a saída gravaria um destino para um caminhão que está indo embora.
        if (input.dockNumber && input.action !== "iniciar") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A doca é informada na liberação da entrada." });
        }
        return executeAttendanceAction({
          attendanceId: input.attendanceId,
          action: input.action,
          operatedById: ctx.user.id,
          dockNumber: input.dockNumber,
        });
      }),
  }),
  /**
   * A caixa de sugestões do portal.
   *
   * Quem mais esbarra nas arestas do sistema é o fornecedor, e é quem menos
   * tem por onde falar: não está no grupo da operação nem senta ao lado de
   * ninguém daqui. Hoje ele liga para a doca para reclamar de uma tela — e a
   * doca, que não desenvolve nada, anota num papel.
   */
  feedback: router({
    enviar: protectedProcedure
      .input(z.object({
        mensagem: z.string().trim().max(1000).optional(),
        nota: z.number().int().min(NOTA_MINIMA).max(NOTA_MAXIMA).optional(),
        pagina: z.string().max(255).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // A nota sozinha já é um recado — é o clique de quem não ia escrever
        // nada. O que não entra é o vazio: sem nota e sem texto, não há o que ler.
        if (!temConteudo(input)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Dê a nota ou escreva um pouco mais para dar para entender." });
        }
        try {
          await registrarFeedback({ userId: ctx.user.id, mensagem: input.mensagem, nota: input.nota, pagina: input.pagina });
        } catch (erro) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro instanceof Error ? erro.message : "Não consegui registrar seu recado." });
        }
        return { recebido: true } as const;
      }),
    lista: adminProcedure.query(async () => ({
      recados: await listarFeedbacks(50),
      naoLidos: await contarFeedbacksNaoLidos(),
      // O resumo sai de todas as notas, e não das cinquenta da lista: a média
      // dos últimos cinquenta recados não é a média do portal.
      notas: resumoDasNotas(await notasDoPortal()),
    })),
    /**
     * A nota do portal, para o painel.
     *
     * Só o número e a distribuição — sem os recados, que são de quem
     * administra. Quem cuida da operação precisa ver se o portal está
     * agradando; ler reclamação nominal é outra conversa.
     */
    nota: protectedProcedure.query(async ({ ctx }) => {
      assertSchedulingDesk(ctx.user.role);
      return resumoDasNotas(await notasDoPortal());
    }),
    marcarLido: adminProcedure
      .input(z.object({ feedbackId: z.number().int().positive(), lido: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await marcarFeedbackLido({ feedbackId: input.feedbackId, adminId: ctx.user.id, lido: input.lido });
        return { ok: true } as const;
      }),
  }),
  staff: router({
    list: adminProcedure.query(async () => listStaffUsers()),
    /** As contas de fornecedor, listadas à parte da equipe interna. */
    fornecedores: adminProcedure.query(async () => listSupplierAccounts()),
    /**
     * O link de redefinição de senha, na mão do administrador.
     *
     * O caminho normal é o próprio usuário pedir e receber por e-mail. Ele
     * falha de três jeitos que acontecem toda semana: o e-mail cai no spam da
     * empresa, o endereço cadastrado tem um erro de digitação, ou o fornecedor
     * trocou de pessoa e a caixa de quem saiu ninguém abre mais. Em qualquer um
     * deles a conta fica trancada para sempre, porque não havia por onde
     * ajudar de dentro.
     *
     * É o mesmo link do e-mail, com a mesma validade de uma hora e o mesmo uso
     * único — não é uma senha nova nem uma porta paralela. O administrador
     * copia e manda pelo canal em que já fala com o fornecedor.
     *
     * Não serve para a conta de outro administrador: quem administra já pode
     * aprovar e bloquear contas, mas tomar a conta de outro administrador sem
     * ele saber é outra coisa.
     */
    linkDeRedefinicao: adminProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const alvo = await getUserById(input.userId);
        if (!alvo) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
        if (alvo.role === "admin" && alvo.id !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A conta de outro administrador não se redefine por aqui." });
        }

        const baseUrl = enderecoDoPortal({
          appUrl: ENV.appUrl,
          proto: ctx.req.headers["x-forwarded-proto"] as string | undefined,
          host: (ctx.req.headers["x-forwarded-host"] as string | undefined) ?? ctx.req.headers.host,
        });
        if (!baseUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Não consegui montar o endereço do portal para o link." });

        const { token, tokenHash } = createResetToken();
        const expiraEm = resetTokenExpiry();
        await createPasswordResetToken({ userId: alvo.id, tokenHash, expiresAt: expiraEm });
        // O link não entra no registro: ele é a credencial. O que fica é quem
        // pediu, para quem, e quando.
        await registrarAvisoDoSistema("link-de-redefinicao", `conta ${alvo.id} (${alvo.email ?? "sem e-mail"}) · gerado pelo usuário ${ctx.user.id}`);

        return {
          url: buildResetUrl(baseUrl, token),
          expiraEm,
          email: alvo.email,
          // Senha nova não adianta para quem ainda não foi aprovado: a tela
          // precisa dizer isso antes de o administrador mandar o link.
          precisaAprovar: alvo.accessStatus !== "approved",
        };
      }),
    /**
     * Cria uma conta já liberada, pelo administrador.
     *
     * Até aqui só existiam dois caminhos para entrar: o fornecedor se cadastrar
     * e esperar aprovação, ou a conta de teste. Quem precisa dar acesso a um
     * operador novo — ou cadastrar o fornecedor que não se cadastra sozinho —
     * não tinha por onde. A conta nasce aprovada porque quem a criou é
     * justamente quem aprovaria.
     */
    criarUsuario: adminProcedure
      .input(z.object({
        nome: z.string().trim().min(2, "Informe o nome.").max(255),
        email: z.string().trim().email("Informe um e-mail válido.").max(320),
        senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres.").max(200),
        role: z.enum(userRoles),
        razaoSocial: z.string().trim().max(255).optional(),
        cnpj: z.string().trim().max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.toLowerCase();
        if (await getUserByEmail(email)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe uma conta com esse e-mail." });
        }
        const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, "") : "";
        // O fornecedor sem CNPJ não enxergaria nota nenhuma: é pelo CNPJ que as
        // notas dele são encontradas.
        if (input.role === "supplier" && cnpj.length !== 14) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o CNPJ do fornecedor com 14 dígitos." });
        }
        const criado = await createLocalUser({
          email,
          role: input.role,
          passwordHash: hashPassword(input.senha),
          name: input.nome,
          companyName: input.razaoSocial || undefined,
          companyCnpj: cnpj || undefined,
          accessStatus: "approved",
        });
        // A conta nasce valendo; quem vai usá-la precisa saber disso e com que
        // login entra — senão o administrador vira o canal de recado.
        const avisado = await avisarAcessoLiberado(criado, ctx.req);
        return { ...publicUser(criado), avisado };
      }),
    setRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "operator", "portaria", "operacao", "planejador"]) }))
      .mutation(async ({ ctx, input }) => {
        // An administrator changing their own role would drop the only account
        // that can hand the role back.
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar o seu próprio perfil." });
        }
        await assertAnotherAdminRemains(input.userId, input.role !== "admin");
        await setUserRole({ userId: input.userId, role: input.role });
        return { success: true } as const;
      }),

    // Bloquear devolve a conta ao estado de quem não passou pela aprovação: ela
    // continua no sistema, com o histórico intacto e atribuível, mas não entra.
    setAccess: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), allowed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await assertAnotherAdminRemains(input.userId, !input.allowed);
        await setUserAccessStatus({
          userId: input.userId,
          accessStatus: input.allowed ? "approved" : "rejected",
        });
        // Desbloquear é a mesma notícia que aprovar, só que para quem já
        // conhece o portal.
        const desbloqueado = input.allowed ? await getUserById(input.userId) : null;
        const avisado = desbloqueado ? await avisarAcessoLiberado(desbloqueado, ctx.req, true) : false;
        return { success: true, avisado } as const;
      }),
  }),
  analytics: router({
    dashboard: protectedProcedure.input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2100), day: z.number().int().min(1).max(31).optional() })).query(async ({ ctx, input }) => {
      assertSchedulingDesk(ctx.user.role);
      const [todas, furadas] = await Promise.all([listAppointments(), contarDatasFuradas()]);
      const items = todas
        .filter(item => item.status !== "backlog")
        .map(item => ({ ...item, datasFuradas: furadas.get(item.id) ?? 0 }));
      return buildDashboardMetrics(items, input);
    }),
  }),
});

export type AppRouter = typeof appRouter;
