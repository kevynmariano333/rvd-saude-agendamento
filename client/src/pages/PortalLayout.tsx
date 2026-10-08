import { Button } from "@/components/ui/button";
import { canSeeGateHistory, canTreatBacklogPortal, isPortalAdmin, isPortalGate, isPortalOperator, isPortalPlanner, isPortalSchedulingDesk, isPortalYard, roleLabel, type PortalRole } from "@/lib/portal";
import { serviceTypeCopy } from "@/lib/attendance";
import { rotuloDoMotivo } from "@shared/backlogReasons";
import { ehSituacao, ROTULO_DA_SITUACAO, SITUACAO_PADRAO, SITUACOES } from "@shared/presenca";
import { CORES_DA_SITUACAO } from "@/lib/presenca";
import { marcaDoEmail } from "@shared/marcaDaConta";
import LogoDaConta from "../components/LogoDaConta";
import CaixaDeSugestao from "../components/CaixaDeSugestao";
import { unidadePorCnpj } from "@shared/recipients";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  MessagesSquare,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DatabaseBackup,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  MonitorSmartphone,
  Moon,
  PackageCheck,
  ShieldCheck,
  Sun,
  Truck,
  UserCheck,
  UserRound,
  X,
  type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTheme, type ThemeChoice } from "../contexts/ThemeContext";
import ChangeNameDialog from "../components/ChangeNameDialog";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import { useLocation } from "wouter";
import { MARCA } from "@shared/marca";

/** Claro, escuro, ou acompanhar o aparelho. */
const themeOptions: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "claro", label: "Claro", icon: Sun },
  { value: "escuro", label: "Escuro", icon: Moon },
  { value: "sistema", label: "Sistema", icon: MonitorSmartphone },
];

type PortalUser = { id: number; name: string | null; email: string | null; role: string; situacao?: string | null };

/** Item da barra de navegação. O badge é a contagem que pede atenção agora. */
type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  /** Quando existe, o item abre um menu em vez de navegar direto. */
  grupo?: string;
  filhos?: { label: string; path: string }[];
};

export default function PortalLayout({
  user,
  title,
  subtitle,
  actions,
  children,
  onLogout: _onLogout,
}: {
  user: PortalUser;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onLogout?: () => void;
}) {
  const { choice, setChoice } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sugestaoAberta, setSugestaoAberta] = useState(false);
  const [location, setLocation] = useLocation();
  const role = user.role as PortalRole;
  const isOperator = isPortalOperator(role);
  const isAdmin = isPortalAdmin(role);
  const notifications = trpc.messages.notifications.useQuery(undefined, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();

  // O recado que evita o "oi, tá aí?" — e que só vale enquanto a pessoa
  // estiver de fato no sistema, para não envelhecer na tela dos outros.
  const situacao = ehSituacao(user.situacao) ? user.situacao : SITUACAO_PADRAO;
  // De qual casa é esta conta: a RVD opera o recebimento, a Amil planeja. Quem
  // não é de nenhuma das duas — o fornecedor — continua com o boneco.
  const temMarca = Boolean(marcaDoEmail(user.email));
  const definirSituacao = trpc.auth.definirSituacao.useMutation({
    onSuccess: ({ situacao: escolhida }) => {
      void utils.auth.me.invalidate();
      toast.success(`Agora você aparece como ${ROTULO_DA_SITUACAO[escolhida].rotulo.toLowerCase()} para a equipe.`);
    },
    onError: erro => toast.error(erro.message),
  });
  // Qual versão o servidor está servindo agora. De dez em dez minutos: deploy
  // não acontece a cada minuto, e perguntar de minuto em minuto era uma
  // consulta por pessoa por minuto o dia inteiro para responder um número que
  // muda uma vez por semana.
  const versaoNoAr = trpc.manutencao.versaoNoAr.useQuery(undefined, { refetchInterval: 600_000, staleTime: 300_000 });
  const unreadCount = notifications.data?.length ?? 0;

  // Um caminhão parado no portão espera a Operação aceitar o recebimento, e
  // quem decide não fica com a tela do pátio aberta o dia inteiro. Por isso a
  // solicitação de liberação avisa em todas as telas do portal, e não só lá.
  const canApproveEntries = isPortalYard(role);
  const releaseRequests = trpc.attendances.list.useQuery(
    { status: "aguardando" },
    { enabled: canApproveEntries, refetchInterval: 15_000 }
  );
  const pendingReleases = canApproveEntries ? (releaseRequests.data ?? []) : [];
  // Quem trata o backlog precisa saber que ele encheu sem abrir a tela.
  const podeTratarBacklog = canTreatBacklogPortal(role);
  // Só o número, não a fila.
  //
  // O menu mostra quantas notas estão em backlog, e para isso baixava as notas
  // inteiras — 557 linhas, mais de meio megabyte — em toda tela do sistema, a
  // cada minuto. Contar é trabalho do banco.
  const backlogFila = trpc.appointments.total.useQuery({ status: "backlog" }, { enabled: podeTratarBacklog, refetchInterval: 60_000 });
  const backlogCount = podeTratarBacklog ? (backlogFila.data ?? 0) : 0;
  // O contador do menu diz quantas notas estão lá; ele não diz qual chegou
  // agora nem por quê, e é isso que faz alguém abrir a tela.
  const backlogRecente = trpc.appointments.novosNoBacklog.useQuery(undefined, { enabled: podeTratarBacklog, refetchInterval: 60_000 });
  const novosNoBacklog = podeTratarBacklog ? (backlogRecente.data ?? []) : [];
  // A conversa da tratativa é interna — o fornecedor não a lê —, mas dentro de
  // casa ela não é segredo: quem mandou a nota para o backlog foi o balcão, e
  // ele precisa saber no que deu.
  const ehBalcao = isPortalSchedulingDesk(role);
  const conversaDoBacklog = trpc.appointments.conversaDoBacklog.useQuery(undefined, { enabled: ehBalcao, refetchInterval: 30_000 });
  const falasDoBacklog = ehBalcao ? (conversaDoBacklog.data ?? []) : [];
  const releaseCount = pendingReleases.length;
  // Limpar não apaga nada: grava que esta pessoa leu o que está na lista. A
  // liberação do portão fica de fora — é caminhão parado esperando decisão.
  const limparAvisos = trpc.messages.limparAvisos.useMutation({
    onSuccess: () => {
      void utils.messages.notifications.invalidate();
      void utils.messages.porNota.invalidate();
      void utils.appointments.novosNoBacklog.invalidate();
      void utils.appointments.conversaDoBacklog.invalidate();
    },
  });
  const temAvisoParaLimpar = unreadCount + novosNoBacklog.length + falasDoBacklog.length > 0;
  // O número no sino é de aviso por ler, não do tamanho da fila.
  //
  // Antes ele somava as 557 notas que estão em backlog — uma fila de trabalho,
  // não uma novidade —, e por isso nunca zerava: o sino vivia em "9+" e parou
  // de querer dizer qualquer coisa. Agora conta o que chegou e esta pessoa
  // ainda não viu. A fila continua no contador do menu, que é o lugar dela.
  const alertCount = unreadCount + releaseCount + novosNoBacklog.length + falasDoBacklog.length;

  // Cada perfil vê só o seu posto de trabalho: quem cuida de agendamentos não
  // tem o pátio no menu, e quem trabalha no portão não tem a agenda. O
  // administrador é o único que enxerga tudo. Itens de administração ficam no
  // menu da conta, sem competir com a operação do dia na barra principal.
  const schedulingNav: NavItem[] = [
    { label: "Dashboard", path: "/operador/dashboard", icon: LayoutDashboard },
    { label: "Agendamentos", path: "/operador", icon: ClipboardList },
    { label: "Calendário", path: "/operador/calendario", icon: CalendarDays },
    // Relatórios abre um menu: são duas consultas diferentes, e a de backlog
    // não é uma aba dentro da outra — tem período, colunas e público próprios.
    {
      label: "Relatórios",
      path: "/operador/relatorios",
      icon: BarChart3,
      grupo: "Movimentação",
      filhos: [
        { label: "Notas lançadas", path: "/operador/relatorios" },
        { label: "Backlog", path: "/operador/relatorios/backlog" },
        // Cadastro de parceiros, e não movimento do dia: fica com o administrador.
        ...(isAdmin ? [{ label: "Fornecedores cadastrados", path: "/operador/relatorios/fornecedores" }] : []),
      ],
    },
  ];
  // O backlog é a fila de tratativa do planejamento. Fica fora do menu do
  // Operador de propósito: é ele quem manda a nota para lá.
  const backlogNav: NavItem[] = [{ label: "Backlog", path: "/operador/backlog", icon: AlertTriangle, badge: backlogCount }];
  const gateNav: NavItem[] = [{ label: "Portaria", path: "/portaria", icon: DoorOpen }];
  const yardNav: NavItem[] = [{ label: "Operação", path: "/operacao", icon: PackageCheck, badge: releaseCount }];
  // Para quem enxerga mais de uma tela do pátio, elas entram num menu só. Oito
  // itens soltos na barra atropelavam o nome de quem está logado, e quem precisa
  // do pátio o dia inteiro é a Portaria e a Operação — que continuam com a sua
  // tela direto, sem menu nenhum.
  const patioFilhos = [
    ...(isAdmin || isPortalGate(role) ? [{ label: "Portaria", path: "/portaria" }] : []),
    ...(isPortalYard(role) ? [{ label: "Operação", path: "/operacao" }] : []),
    ...(canSeeGateHistory(role) ? [{ label: "Histórico", path: "/portaria/historico" }] : []),
  ];
  const patioNav: NavItem[] = patioFilhos.length
    ? [{ label: "Pátio", path: patioFilhos[0].path, icon: PackageCheck, badge: releaseCount, filhos: patioFilhos }]
    : [];

  // O planejador para na agenda: as quatro telas de planejamento e nada do
  // pátio. É o recorte inteiro do perfil.
  // O "Importar" mora na barra de cima enquanto o acervo está sendo acertado:
  // guardado no menu do perfil ele existia, mas ninguém achava — e é uma tela
  // que está sendo aberta várias vezes por dia. Só o administrador o vê.
  const importarNav: NavItem[] = isAdmin ? [{ label: "Importar", path: "/operador/importar", icon: DatabaseBackup }] : [];
  const nav: NavItem[] = isAdmin
    ? [...schedulingNav, ...backlogNav, ...patioNav, ...importarNav]
    : isOperator
      ? [...schedulingNav, ...patioNav]
      : isPortalPlanner(role)
        ? [...schedulingNav, ...backlogNav]
        : // A Portaria tem uma tela só: quem está no portão não navega pelo
          // sistema no meio do turno.
          isPortalGate(role)
          ? gateNav
          : // A Operação também: a doca é uma tela só, como o portão.
            isPortalYard(role)
            ? yardNav
            : [{ label: "Meus agendamentos", path: "/fornecedor", icon: ClipboardList }];

  const adminNav: NavItem[] = isAdmin
    ? [
        { label: "Acessos", path: "/operador/acessos", icon: UserCheck },
        { label: "Administrar notas", path: "/operador/notas", icon: ShieldCheck },
      ]
    : [];

  // Só avisa o que chegou depois de a tela abrir: sem isso, entrar no portal
  // com a fila cheia dispararia um aviso de "novidade" que não é novidade.
  const seenReleases = useRef<number | null>(null);
  useEffect(() => {
    if (!canApproveEntries || !releaseRequests.data) return;
    const previous = seenReleases.current;
    seenReleases.current = releaseCount;
    if (previous === null || releaseCount <= previous) return;
    toast.info("Nova solicitação de liberação", {
      description: `${releaseCount} caminhão(ões) no portão esperando o aceite da Operação.`,
      action: { label: "Ver", onClick: () => setLocation("/operacao") },
    });
  }, [canApproveEntries, releaseRequests.data, releaseCount, setLocation]);

  // Mesma regra do portão: só avisa o que caiu no backlog depois de a tela
  // abrir. Entrar no portal com a fila cheia não é novidade nenhuma.
  const vistosNoBacklog = useRef<number | null>(null);
  useEffect(() => {
    if (!podeTratarBacklog || backlogFila.data === undefined) return;
    const anterior = vistosNoBacklog.current;
    vistosNoBacklog.current = backlogCount;
    if (anterior === null || backlogCount <= anterior) return;
    const chegou = backlogCount - anterior;
    toast.warning(chegou === 1 ? "Nota nova no backlog" : `${chegou} notas novas no backlog`, {
      description: novosNoBacklog[0]
        ? `NF ${novosNoBacklog[0].invoiceNumber || "sem número"} — ${rotuloDoMotivo(novosNoBacklog[0].backlogReasonCode)}.`
        : "O recebimento não fechou e a nota espera tratativa.",
      action: { label: "Ver", onClick: () => setLocation("/operador/backlog") },
    });
  }, [podeTratarBacklog, backlogFila.data, backlogCount, novosNoBacklog, setLocation]);

  // Uma fala nova na tratativa avisa na hora: a resposta que destrava a nota
  // ficava esperando alguém abrir a tela do backlog para ser descoberta.
  const falasVistas = useRef<number | null>(null);
  useEffect(() => {
    if (!ehBalcao || !conversaDoBacklog.data) return;
    const anterior = falasVistas.current;
    const ultima = conversaDoBacklog.data[0];
    falasVistas.current = ultima?.id ?? 0;
    if (anterior === null || !ultima || ultima.id <= anterior) return;
    toast.info("Nova mensagem na tratativa do backlog", {
      description: `NF ${ultima.invoiceNumber || "sem número"} · ${ultima.authorName || "Colaborador"}: ${ultima.body.slice(0, 90)}`,
      action: { label: "Ver", onClick: () => setLocation(`/operador?tratativa=${ultima.appointmentId}`) },
    });
  }, [ehBalcao, conversaDoBacklog.data, setLocation]);

  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const homePath = nav[0]?.path ?? "/";
  const go = (path: string) => {
    setLocation(path);
    setMenuAberto(null);
    setMobileOpen(false);
    setProfileOpen(false);
  };

  const finishLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      try {
        sessionStorage.removeItem("manus-cookie");
        localStorage.removeItem("manus-runtime-user-info");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      setProfileOpen(false);
      setLocation("/");
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-5 sm:px-8">
          <button onClick={() => go(homePath)} className="flex shrink-0 items-center gap-2.5 text-left">
            <img src="/RVD-Saude.png" alt="RVD Saúde" className="size-9 rounded-xl object-cover" />
            <span className="hidden min-w-0 sm:block">
              <span className="block font-display text-sm font-extrabold leading-none text-rvd-plum">{MARCA.nome}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                {MARCA.descricao}
              </span>
            </span>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
            <div className="flex items-center">
              {nav.map(item => {
                const active = item.filhos ? item.filhos.some(filho => location === filho.path) : location === item.path;
                const Icon = item.icon;
                if (item.filhos) {
                  const aberto = menuAberto === item.path;
                  return (
                    <div key={item.path} className="relative">
                      <button
                        onClick={() => setMenuAberto(atual => (atual === item.path ? null : item.path))}
                        aria-expanded={aberto}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
                          active ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                        }`}
                      >
                        <Icon className="size-4" />
                        {item.label}
                        {item.badge ? (
                          <span className="flex min-w-[18px] items-center justify-center rounded-full bg-state-stop px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                            {item.badge > 9 ? "9+" : item.badge}
                          </span>
                        ) : null}
                        <ChevronDown className={`size-3.5 transition ${aberto ? "rotate-180" : ""}`} />
                      </button>
                      {aberto && (
                        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-2 shadow-xl">
                          {item.grupo && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{item.grupo}</p>}
                          {item.filhos.map(filho => (
                            <button
                              key={filho.path}
                              onClick={() => { setMenuAberto(null); go(filho.path); }}
                              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-bold transition ${
                                location === filho.path ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                              }`}
                            >
                              {filho.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
                      active ? "bg-rvd-plum-pale/50 text-rvd-plum" : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {item.badge ? (
                      <span className="flex min-w-[18px] items-center justify-center rounded-full bg-state-stop px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setMobileOpen(value => !value)}
              className="rounded-lg border border-line p-2 text-ink-soft xl:hidden"
              aria-label="Abrir navegação"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <button
              onClick={() => {
                setNotificationsOpen(value => !value);
                setProfileOpen(false);
              }}
              title={releaseCount > 0 ? "Solicitações de liberação e mensagens" : "Mensagens novas"}
              className="relative hidden rounded-lg p-2.5 text-ink-soft hover:bg-canvas hover:text-ink sm:block"
            >
              <Bell className="size-5" />
              {alertCount > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex size-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white ${
                    releaseCount > 0 ? "bg-state-stop" : "bg-brand"
                  }`}
                >
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setProfileOpen(value => !value);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-canvas"
            >
              {/* O logo diz de qual casa é a conta — a RVD opera o
                  recebimento, a Amil planeja —, e a bolinha mostra a você
                  mesmo como a equipe está te vendo: sem ela, quem marcou
                  "ocupado" de manhã não lembra disso à tarde sem abrir o
                  menu. */}
              <span className="relative flex shrink-0">
                {temMarca ? (
                  <LogoDaConta email={user.email} />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-lg bg-rvd-plum-pale/60 text-rvd-plum">
                    <UserRound className="size-4" />
                  </span>
                )}
                <span
                  title={`${ROTULO_DA_SITUACAO[situacao].rotulo} — ${ROTULO_DA_SITUACAO[situacao].explica}`}
                  className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface ${CORES_DA_SITUACAO[situacao]}`}
                />
              </span>
              <span className="hidden max-w-24 sm:block 2xl:max-w-36">
                <span className="block truncate text-sm font-bold text-ink">{user.name || "Acesso RVD"}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                  {roleLabel[role]}
                </span>
              </span>
              <ChevronDown className="mr-1 hidden size-4 text-ink-faint sm:block" />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-line bg-surface px-5 py-3 xl:hidden">
            <nav className="flex flex-wrap gap-2">
              {[...nav, ...adminNav].flatMap(item => (item.filhos ? item.filhos.map(filho => ({ ...item, label: filho.label, path: filho.path, filhos: undefined })) : [item])).map(item => {
                const Icon = item.icon;
                const active = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
                      active ? "bg-brand text-white" : "bg-canvas text-ink-soft"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {item.badge ? (
                      <span className="flex min-w-[18px] items-center justify-center rounded-full bg-state-stop px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {notificationsOpen && (
          <div className="absolute right-5 top-[4.25rem] z-50 w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-lg sm:right-8">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="font-display text-sm font-extrabold text-ink">Avisos</p>
                <p className="text-xs text-ink-soft">
                  {releaseCount > 0
                    ? "Liberações no portão e conversas das notas"
                    : novosNoBacklog.length > 0 || falasDoBacklog.length > 0
                      ? "Backlog, tratativa e conversas das notas"
                      : "Conversas vinculadas às notas"}
                </p>
              </div>
              {temAvisoParaLimpar ? (
                <button
                  type="button"
                  onClick={() => limparAvisos.mutate()}
                  disabled={limparAvisos.isPending}
                  title="Dar por lidos os avisos desta lista. Nada é apagado, e o pedido de liberação do portão continua aqui até alguém decidir."
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-rvd-plum hover:bg-rvd-plum-pale disabled:opacity-50"
                >
                  {limparAvisos.isPending ? "Limpando..." : "Limpar"}
                </button>
              ) : (
                <Bell className="size-4 text-ink-faint" />
              )}
            </div>
            {releaseCount > 0 && (
              <div className="border-b border-line bg-state-stop-bg/50 p-2">
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-state-stop">
                  Solicitações de liberação · {releaseCount}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {pendingReleases.map(request => (
                    <button
                      key={request.id}
                      onClick={() => {
                        setNotificationsOpen(false);
                        go("/operacao");
                      }}
                      className="w-full rounded-xl p-3 text-left hover:bg-surface"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-lg bg-state-stop-bg p-2 text-state-stop">
                          <Truck className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-mono text-xs font-bold text-ink">{request.licensePlate}</span>
                          <span className="mt-0.5 block truncate text-sm text-ink-soft">
                            {request.supplierName ?? serviceTypeCopy[request.serviceType]} · aguardando aceite
                          </span>
                          <span className="mt-1 block text-[10px] text-ink-faint">
                            Chegou{" "}
                            {new Date(request.arrivalAt).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {novosNoBacklog.length > 0 && (
              <div className="border-b border-line bg-state-stop-bg/40 p-2">
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-state-stop">
                  Foram para o backlog · {novosNoBacklog.length}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {novosNoBacklog.map(nota => {
                    const unidade = unidadePorCnpj(nota.recipientCnpj);
                    return (
                      <button
                        key={nota.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          go("/operador/backlog");
                        }}
                        className="w-full rounded-xl p-3 text-left hover:bg-surface"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 rounded-lg bg-state-stop-bg p-2 text-state-stop">
                            <AlertTriangle className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-ink">
                              NF {nota.invoiceNumber || "sem número"}
                              {unidade ? ` · ${unidade.sigla}` : ""}
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-ink-soft">
                              {rotuloDoMotivo(nota.backlogReasonCode)}
                            </span>
                            <span className="mt-1 block truncate text-[10px] text-ink-faint">
                              {nota.invoiceSupplierName || nota.supplierName || "Fornecedor"} ·{" "}
                              {nota.entrouEm
                                ? new Date(nota.entrouEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                                : "data não registrada"}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {falasDoBacklog.length > 0 && (
              <div className="border-b border-line bg-rvd-plum-pale/40 p-2">
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-rvd-plum">
                  Conversa da tratativa · {falasDoBacklog.length}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {falasDoBacklog.map(fala => (
                    <button
                      key={fala.id}
                      onClick={() => {
                        setNotificationsOpen(false);
                        go(`/operador?tratativa=${fala.appointmentId}`);
                      }}
                      className="w-full rounded-xl p-3 text-left hover:bg-surface"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-lg bg-rvd-plum-pale p-2 text-rvd-plum">
                          <MessagesSquare className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-ink">
                            NF {fala.invoiceNumber || "sem número"}
                            {unidadePorCnpj(fala.recipientCnpj) ? ` · ${unidadePorCnpj(fala.recipientCnpj)?.sigla}` : ""}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-ink-soft">
                            {fala.authorName || "Colaborador"}: {fala.body}
                          </span>
                          <span className="mt-1 block text-[10px] text-ink-faint">
                            {new Date(fala.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {notifications.data?.length ? (
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.data.map(message => (
                  <button
                    key={message.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      go(`${isOperator ? "/operador" : "/fornecedor"}?chat=${message.appointmentId}`);
                    }}
                    className="w-full rounded-xl p-3 text-left hover:bg-canvas"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-rvd-plum-pale/60 p-2 text-rvd-plum">
                        <MessageCircle className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-ink">
                          {message.invoiceNumber ? `Nota ${message.invoiceNumber}` : message.serviceType}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-ink-soft">
                          {message.senderName || "Participante"}: {message.body}
                        </span>
                        <span className="mt-1 block text-[10px] text-ink-faint">
                          {new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              releaseCount === 0 && novosNoBacklog.length === 0 && falasDoBacklog.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <Bell className="mx-auto size-6 text-ink-faint" />
                  <p className="mt-3 text-sm font-bold text-ink">Nenhum aviso novo</p>
                </div>
              )
            )}
          </div>
        )}

        {profileOpen && (
          <div className="absolute right-5 top-[4.25rem] w-[19rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-surface p-4 shadow-lg sm:right-8">
            <div className="flex items-start gap-3">
              <LogoDaConta email={user.email} className="size-10" />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-extrabold text-ink">{user.name || "Acesso RVD"}</p>
                <p className="mt-1 truncate text-xs text-ink-soft">{user.email}</p>
              </div>
            </div>
            <p className="mt-3 inline-flex rounded-full bg-rvd-plum-pale/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">
              {roleLabel[role]}
            </p>
            {adminNav.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="eyebrow">Administração</p>
                {adminNav.map(item => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.path}
                      onClick={() => go(item.path)}
                      variant="ghost"
                      className="mt-1 w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 border-t border-line pt-3">
              <p className="eyebrow">Minha situação</p>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
                {SITUACOES.map(opcao => {
                  const escolhida = situacao === opcao;
                  return (
                    <button
                      key={opcao}
                      onClick={() => definirSituacao.mutate({ situacao: opcao })}
                      disabled={definirSituacao.isPending}
                      aria-pressed={escolhida}
                      title={ROTULO_DA_SITUACAO[opcao].explica}
                      className={`flex items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-bold transition ${
                        escolhida ? "bg-surface text-rvd-plum shadow-sm" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      <span className={`size-2 shrink-0 rounded-full ${CORES_DA_SITUACAO[opcao]}`} />
                      {ROTULO_DA_SITUACAO[opcao].rotulo}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-ink-faint">
                Aparece para a equipe na tela de Acessos, e só enquanto você estiver usando o sistema.
              </p>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <p className="eyebrow">Tema</p>
              <div className="mt-2 flex gap-1 rounded-xl bg-canvas p-1">
                {themeOptions.map(option => {
                  const Icon = option.icon;
                  const active = choice === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setChoice(option.value)}
                      aria-pressed={active}
                      title={option.label}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                        active ? "bg-surface text-rvd-plum shadow-sm" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <Button
                onClick={() => {
                  setProfileOpen(false);
                  setNameOpen(true);
                }}
                variant="ghost"
                className="w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <UserRound className="size-4" />
                Alterar nome
              </Button>
              <Button
                onClick={() => {
                  setProfileOpen(false);
                  setPasswordOpen(true);
                }}
                variant="ghost"
                className="mt-1 w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <KeyRound className="size-4" />
                Alterar senha
              </Button>
              {/* Para quem é de dentro, a caixa de sugestões mora aqui: um
                  botão flutuante na tela de trabalho atrapalha quem passa o
                  dia nela. O fornecedor, que entra de vez em quando, continua
                  com o botão no canto. */}
              <Button
                onClick={() => {
                  setProfileOpen(false);
                  setSugestaoAberta(true);
                }}
                variant="ghost"
                className="mt-1 w-full justify-start text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <MessageSquarePlus className="size-4" />
                Sugestão sobre o portal
              </Button>
              <Button
                onClick={finishLogout}
                disabled={logoutMutation.isPending}
                variant="ghost"
                className="mt-1 w-full justify-start text-state-stop hover:bg-state-stop-bg hover:text-state-stop"
              >
                <LogOut className="size-4" />
                {logoutMutation.isPending ? "Encerrando..." : "Encerrar sessão"}
              </Button>
            </div>
          </div>
        )}
      </header>

      <main>
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{subtitle}</p>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <div>{children}</div>
        </div>
      </main>
      {/* Quem é dono do sistema e quem o fez: a pergunta aparece na primeira
          semana de uso e não tinha resposta em lugar nenhum da tela. Fica no
          rodapé, que é onde se procura, e não disputa espaço com o trabalho. */}
      <footer className="mt-4 border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-5 px-5 py-6 sm:flex-row sm:justify-between sm:px-8 lg:px-10">
          <div className="flex items-center gap-4">
            <img src="/RVD-Saude.png" alt="RVD Saúde" className="h-10 w-auto object-contain" />
            <span aria-hidden className="h-8 w-px bg-line" />
            {/* O azul da Amil quase some no rodapé escuro; a plaquinha branca
                só aparece nesse tema, para no claro o logo ficar igual aos
                outros dois. */}
            <img src="/Amil.png" alt="Amil" className="h-6 w-auto object-contain dark:rounded-md dark:bg-white dark:px-2 dark:py-1" />
            <span aria-hidden className="h-8 w-px bg-line" />
            <img src="/LLT.png" alt="LLT Consultoria" className="h-10 w-auto object-contain" />
          </div>
          <div className="text-center sm:text-right">
            <p className="font-display text-[13px] font-extrabold text-ink">{MARCA.nome}</p>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">{MARCA.descricao}</p>
            <p className="mt-1.5 text-[11px] text-ink-soft">Desenvolvido por Mariano System</p>
            <p className="text-[11px] text-ink-faint">Versão {versaoNoAr.data?.commit ?? __VERSAO_DO_APP__}</p>
          </div>
        </div>
      </footer>
      <ChangeNameDialog open={nameOpen} onOpenChange={setNameOpen} currentName={user.name ?? ""} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      {/* O fornecedor entra de vez em quando e não conhece os cantos do
          portal: para ele o botão fica à vista, pequeno e no canto. Quem é de
          dentro passa o dia nesta tela e acha a mesma caixa pelo menu da
          conta, sem nada flutuando por cima do trabalho. */}
      {role === "supplier" && (
        <button
          type="button"
          onClick={() => setSugestaoAberta(true)}
          title="Mandar uma sugestão sobre o portal"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3.5 py-2.5 text-xs font-bold text-ink-soft shadow-lg backdrop-blur transition hover:border-rvd-plum hover:text-rvd-plum sm:bottom-6 sm:right-6"
        >
          <MessageSquarePlus className="size-4" />
          <span className="hidden sm:inline">Sugestão</span>
        </button>
      )}
      <CaixaDeSugestao aberta={sugestaoAberta} onOpenChange={setSugestaoAberta} />
    </div>
  );
}
