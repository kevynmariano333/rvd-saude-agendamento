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
  listAppointments,
  listAppointmentsBetween,
  listAppointmentInternalNotes,
  listAppointmentSuggestions,
  listBacklogReportRows,
  contarMensagensNaoLidasPorNota,
  listUnreadAppointmentMessages,
  listSupplierActiveAppointments,
  markAppointmentMessagesRead,
  reabrirComoPendente,
  returnAppointmentForRescheduling,
  rescueAppointment,
  scheduleAppointment,
  touchUserSignIn,
  treatBacklogAppointment,
  updateAppointmentStatus,
  consumePasswordResetToken,
  updateUserName,
  updateUserPassword,
  listApprovedCompanyUserIds,
  listarIdsDaEmpresa,
  listarCnpjsDeFornecedores,
  listarEmpresas,
  listarMembrosDaEmpresa,
  criarEmpresa,
  agruparCnpj,
  listPendingAccessRequests,
  setUserAccessStatus,
  createPasswordResetToken,
  getPasswordResetToken,
  getUserById,
  marcarUrgencia,
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
import { clearRvdSession, createRvdSession } from "./session";
import { systemRouter } from "./_core/systemRouter";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { MAX_XML_BYTES, parseInvoiceXml } from "./xmlInvoice";
import { ENV } from "./_core/env";
import { limparFalhas, registrarFalha, segundosDeEspera } from "./loginThrottle";
import { estadoDasContasDeTeste } from "./contasDeTeste";
import { createAppointmentValidationToken, readAppointmentValidationToken } from "./appointmentValidation";
import { buildResetUrl, createResetToken, hashResetToken, isResetTokenUsable, resetEmailContent, resetTokenExpiry } from "./passwordReset";
import { isMailerConfigured, sendMail } from "./_core/mailer";
import { conteudoDoAgendamento } from "./emailDeAgendamento";
import { buildScopeIds, companyKey, isWithinScope } from "./supplierScope";
import { contarAgendamentos } from "./db";
import { notaJaRegistrada, notasRepetidas, ultimasTentativasDeBackup, ultimoBackupConcluido } from "./db";
import { chaveDeDuplicidade } from "../shared/duplicidadeDeNota";
import { countAppointments, countAppointmentsByStatus, createServiceNoteAppointment, listReportRows, listSupplierOptions } from "./db";
import { executarBackup } from "./backup";
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
const filtrosDaLista = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").optional(), status: statusSchema.optional(), invoiceNumber: z.string().max(100).optional(), supplierName: z.string().max(255).optional(), recipientCnpj: z.string().max(20).optional(), recipientCnpjs: z.array(z.string().max(40)).max(20).optional(), purchaseOrder: z.string().max(100).optional(), sapCode: z.string().max(60).optional(), supplierCnpj: z.string().max(20).optional(), itemCountOperator: z.enum([">=", "<=", "="]).optional(), itemCount: z.number().int().min(0).max(100000).optional(), dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), onlyUrgent: z.boolean().optional(), preNote: z.enum(["done", "pending"]).optional(), excludeBacklog: z.boolean().optional(), source: z.enum(appointmentSources).optional(), limit: z.number().int().positive().max(500).optional(), offset: z.number().int().min(0).optional() }).optional();
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

function publicUser(user: { id: number; name: string | null; email: string | null; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
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
  nota: { accessKey?: string | null; supplierCnpj?: string | null; invoiceNumber?: string | null },
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
    console.warn("[Agendamento] envio de e-mail desligado (falta RESEND_API_KEY ou MAIL_FROM) — o fornecedor não foi avisado.");
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
      .input(z.object({ companyName: z.string().trim().min(2, "Informe a razão social.").max(255), companyCnpj: z.string().min(14, "Informe o CNPJ.").max(20), email: z.string().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
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

        await createRvdSession(ctx.res, user);
        return { pending: false, ...publicUser(user) } as const;
      }),
    register: publicProcedure
      .input(z.object({ profile: localProfileSchema, name: z.string().trim().min(2, "Informe o nome.").max(255), companyCnpj: z.string().max(20).optional(), email: z.string().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
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
      .mutation(async ({ input }) => {
        const email = input.email.trim().toLowerCase();
        const user = await getUserByEmail(email);

        // Always answer the same way. Telling the caller whether the address is
        // registered would turn this endpoint into a way to enumerate accounts.
        if (user?.id && user.email) {
          const { token, tokenHash } = createResetToken();
          await createPasswordResetToken({ userId: user.id, tokenHash, expiresAt: resetTokenExpiry() });

          const baseUrl = ENV.appUrl;
          if (!baseUrl) {
            console.error("[PasswordReset] APP_URL não configurada — não foi possível montar o link.");
          } else if (!isMailerConfigured()) {
            console.error("[PasswordReset] RESEND_API_KEY ou MAIL_FROM ausentes — e-mail não enviado.");
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
    logout: publicProcedure.mutation(({ ctx }) => {
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
          dateStart: input?.dateStart, dateEnd: input?.dateEnd, onlyUrgent: input?.onlyUrgent, preNote: input?.preNote, excludeBacklog: input?.excludeBacklog };
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
    total: protectedProcedure
      .input(filtrosDaLista)
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = {
          date: input?.date, status: input?.status as AppointmentStatus | undefined, source: input?.source, invoiceNumber: input?.invoiceNumber,
          supplierName: input?.supplierName, recipientCnpj: input?.recipientCnpj, recipientCnpjs: input?.recipientCnpjs,
          purchaseOrder: input?.purchaseOrder, sapCode: input?.sapCode, supplierCnpj: input?.supplierCnpj,
          itemCountOperator: input?.itemCountOperator, itemCount: input?.itemCount,
          dateStart: input?.dateStart, dateEnd: input?.dateEnd, onlyUrgent: input?.onlyUrgent, preNote: input?.preNote, excludeBacklog: input?.excludeBacklog };
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
          dateStart: input?.dateStart, dateEnd: input?.dateEnd, onlyUrgent: input?.onlyUrgent, preNote: input?.preNote };
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
        await deleteAppointmentById(appointment.id);
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
          { accessKey: invoice.accessKey, supplierCnpj: invoice.supplierCnpj, invoiceNumber: invoice.invoiceNumber },
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
      .input(z.object({ fileName: z.string().min(5).max(255), xmlBase64: z.string().min(4).max(2_800_000) }))
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
        return createUnscheduledReceipt({ operatorId: ctx.user.id, xmlStorageKey: stored.key, xmlUrl: stored.url, xmlFileName: safeName, invoiceNumber: invoice.invoiceNumber, invoiceAccessKey: invoice.accessKey, purchaseOrder: invoice.purchaseOrder, invoiceSupplierName: invoice.supplierName, invoiceSupplierCnpj: invoice.supplierCnpj, recipientCnpj: invoice.recipientCnpj, invoiceIssuedAt: invoice.issuedAt, serviceDescription: invoice.serviceDescription, invoiceTotalCents: invoice.totalCents, invoiceItemsJson: JSON.stringify(invoice.items), invoiceVolumeCount: invoice.volumeCount });
      }),
    updateStatus: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["scheduled", "received", "completed", "backlog", "rejected"]), rejectionReason: z.string().max(1000).optional(), miroNumber: z.string().max(40).optional(), note: z.string().max(1000).optional(), backlogReasonCode: z.string().max(60).optional() }))
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
        return updateAppointmentStatus({ ...input, miroNumber, backlogReasonCode, backlogReason: observacao, previousStatus: appointment.status, handledBy: ctx.user.id, eventNote: notaDoEvento });
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
        return { success: true } as const;
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
    /** Quantas mensagens novas em cada nota, para marcar a conversa certa. */
    naoLidasPorNota: protectedProcedure.query(({ ctx }) => contarMensagensNaoLidasPorNota({ userId: ctx.user.id, isOperator: isSchedulingDesk(ctx.user.role) })),
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
        return listAppointmentsBetween(start, end, ["pending", "scheduled"]);
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
   * Empresas: o guarda-chuva sobre os CNPJs de um mesmo fornecedor.
   *
   * Tudo aqui é do administrador. Agrupar CNPJ é decidir quem enxerga as notas
   * de quem — é controle de acesso, não organização de cadastro.
   */
  empresas: router({
    lista: adminProcedure.query(async () => ({ empresas: await listarEmpresas(), cnpjs: await listarCnpjsDeFornecedores() })),
    membros: adminProcedure
      .input(z.object({ empresaId: z.number().int().positive() }))
      .query(async ({ input }) => listarMembrosDaEmpresa(input.empresaId)),
    criar: adminProcedure
      .input(z.object({ nome: z.string().trim().min(2, "Informe o nome da empresa.").max(255) }))
      .mutation(async ({ input }) => {
        const existentes = await listarEmpresas();
        if (existentes.some(empresa => empresa.nome.toLowerCase() === input.nome.toLowerCase())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe uma empresa com esse nome." });
        }
        return criarEmpresa(input.nome);
      }),
    agrupar: adminProcedure
      .input(z.object({ cnpj: z.string().min(11).max(20), empresaId: z.number().int().positive().nullable() }))
      .mutation(async ({ input }) => {
        if (input.empresaId) {
          const existentes = await listarEmpresas();
          if (!existentes.some(empresa => empresa.id === input.empresaId)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
          }
        }
        await agruparCnpj(input.cnpj, input.empresaId);
        return { ok: true as const };
      }),
  }),
  staff: router({
    list: adminProcedure.query(async () => listStaffUsers()),
    /** As contas de fornecedor, listadas à parte da equipe interna. */
    fornecedores: adminProcedure.query(async () => listSupplierAccounts()),
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
      .mutation(async ({ input }) => {
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
        return publicUser(criado);
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
        return { success: true } as const;
      }),
  }),
  analytics: router({
    dashboard: protectedProcedure.input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2100), day: z.number().int().min(1).max(31).optional() })).query(async ({ ctx, input }) => {
      assertSchedulingDesk(ctx.user.role);
      const items = (await listAppointments()).filter(item => item.status !== "backlog");
      return buildDashboardMetrics(items, input);
    }),
  }),
});

export type AppRouter = typeof appRouter;
