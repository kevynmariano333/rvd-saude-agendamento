import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/PortalKit";
import {
  accessProfileLabel,
  accessProfiles,
  parseAccessProfile,
  type AccessProfile,
} from "@/lib/accessProfiles";
import { homePathFor, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, ChevronRight, Home as HomeIcon, KeyRound, LockKeyhole, Mail, Send, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { MARCA } from "@shared/marca";

/**
 * Vindo da home o acesso já está escolhido, e repetir os três cartões só
 * convidaria a errar o perfil. Quem chega direto em /entrar ainda precisa
 * escolher, então aí os cartões aparecem.
 */
function ChosenAccess({
  profile,
  fromRoute,
  onSelect,
}: {
  profile: AccessProfile;
  fromRoute: boolean;
  onSelect: (profile: AccessProfile) => void;
}) {
  const [, setLocation] = useLocation();
  const chosen = accessProfiles.find(option => option.value === profile);

  if (fromRoute && chosen) {
    const Icon = chosen.icon;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-rvd-plum/30 bg-rvd-plum-pale/30 p-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{chosen.headline}</p>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{chosen.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="shrink-0 text-xs font-bold text-rvd-plum hover:underline"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <fieldset>
      <legend className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">Perfil de acesso</legend>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {accessProfiles.map((option, index) => {
          const Icon = option.icon;
          const active = profile === option.value;
          const fillsRow = accessProfiles.length % 2 === 1 && index === accessProfiles.length - 1;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              aria-pressed={active}
              className={`rounded-xl border p-3.5 text-left transition ${fillsRow ? "col-span-2" : ""} ${
                active
                  ? "border-rvd-plum bg-rvd-plum-pale/40 text-rvd-plum"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-canvas"
              }`}
            >
              <Icon className="size-5" />
              <span className="mt-3 block text-sm font-bold text-ink">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-4">{option.description}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  // O acesso vem escolhido da home, então a tela já abre no perfil certo em vez
  // de pedir a escolha no meio dos campos de senha.
  const params = useParams<{ profile?: string }>();
  const routeProfile = parseAccessProfile(params.profile);
  const [profile, setProfile] = useState<AccessProfile>(routeProfile ?? "supplier");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [recuperando, setRecuperando] = useState(false);
  const registrandoFornecedor = mode === "register" && profile === "supplier";
  const [companyName, setCompanyName] = useState("");
  const [companyCnpj, setCompanyCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const auth = trpc.auth.me.useQuery();
  // O CNPJ só é consultado quando está completo: metade de um CNPJ não
  // identifica ninguém, e cada consulta sem resposta conta no freio do servidor.
  const cnpjLimpo = companyCnpj.replace(/\D/g, "");
  const empresa = trpc.auth.empresaPorCnpj.useQuery(
    { cnpj: cnpjLimpo },
    { enabled: registrandoFornecedor && cnpjLimpo.length === 14, retry: false },
  );
  const razaoSocialAchada = empresa.data?.razaoSocial ?? null;
  // Achou: o nome vem preenchido e a pessoa segue para o e-mail. Se ela quiser
  // corrigir, o campo continua editável — o que veio das notas pode estar velho.
  useEffect(() => {
    if (razaoSocialAchada) setCompanyName(atual => (atual.trim() ? atual : razaoSocialAchada));
  }, [razaoSocialAchada]);
  const login = trpc.auth.login.useMutation({
    onSuccess: user => setLocation(homePathFor(user.role as PortalRole)),
    onError: error => toast.error(error.message),
  });
  const register = trpc.auth.register.useMutation({
    // Registration never grants access on its own, so there is nowhere to send
    // the new account: it waits for an administrator.
    onSuccess: () => {
      setMode("login");
      toast.success("Cadastro enviado para aprovação. Você poderá entrar assim que o administrador liberar seu acesso.");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data) setLocation(homePathFor(auth.data.role as PortalRole));
  }, [auth.data, setLocation]);

  // Um endereço digitado errado não escolhe acesso por conta própria: volta para
  // a home, onde a escolha é explícita.
  useEffect(() => {
    if (params.profile && !routeProfile) setLocation("/");
  }, [params.profile, routeProfile, setLocation]);

  useEffect(() => {
    if (routeProfile) setProfile(routeProfile);
  }, [routeProfile]);

  function selectProfile(nextProfile: AccessProfile) {
    setProfile(nextProfile);
    setCompanyCnpj("");
    setCompanyName("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "register") {
      if (password !== passwordConfirmation) return toast.error("As senhas precisam ser iguais.");
      register.mutate({
        profile,
        name: companyName,
        companyCnpj: profile === "supplier" ? companyCnpj : undefined,
        email,
        password,
      });
      return;
    }
    login.mutate({ email, password, profile });
  }

  const registering = mode === "register";
  const pending = login.isPending || register.isPending;
  const selectedProfileLabel = accessProfileLabel[profile];

  return (
    <main className="min-h-screen bg-canvas p-4 sm:p-6 lg:p-8">
      <div className="panel mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-3xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-brand px-7 py-10 text-white sm:px-12 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-14">
          <div className="absolute right-[-6rem] top-[-5rem] size-64 rounded-full bg-on-brand/45" />
          <div className="absolute bottom-[-10rem] left-[-7rem] size-80 rounded-full bg-white/10" />
          <div className="absolute left-14 top-32 z-10 hidden sm:block" aria-hidden="true">
            <div className="absolute -bottom-2 -left-5 w-32 border-t border-dashed border-white/45" />
            <div className="rvd-login-truck relative h-10 w-20 drop-shadow-lg">
              <span className="absolute left-0 top-1 h-6 w-11 overflow-hidden rounded-md border-2 border-brand bg-white">
                <img src="/RVD-Saude.png" alt="" className="size-full object-contain p-0.5" />
              </span>
              <span className="absolute left-11 top-3 h-4 w-6 rounded-r-md border-2 border-l-0 border-brand bg-on-brand" />
              <span className="absolute bottom-0 left-2 size-3 rounded-full border-2 border-white bg-brand" />
              <span className="absolute bottom-0 right-2 size-3 rounded-full border-2 border-white bg-brand" />
            </div>
          </div>
          <div className="relative z-10">
            <p className="font-display text-lg font-extrabold">{MARCA.nome}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-on-brand-soft">{MARCA.descricao}</p>
          </div>
          <div className="relative z-10 mt-20 max-w-md lg:mt-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-brand-soft">
              Organização que cuida do seu tempo
            </p>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Do agendamento da nota à liberação do caminhão.
            </h1>
            <p className="mt-6 max-w-sm text-base leading-7 text-white/85">
              Agendamentos, portaria e pátio no mesmo portal: solicitações, decisões de entrada e conclusão do
              atendimento com histórico completo.
            </p>
          </div>
          <div className="relative z-10 mt-12 flex flex-wrap gap-2 text-xs font-bold lg:mt-0">
            <span className="rounded-full bg-white/15 px-3.5 py-1.5">Agendamentos</span>
            <span className="rounded-full bg-white/15 px-3.5 py-1.5">Portaria</span>
            <span className="rounded-full bg-white/15 px-3.5 py-1.5">Pátio</span>
          </div>
        </section>

        <section className="flex items-center bg-surface px-6 py-10 sm:px-12 lg:px-14">
          <div className="rvd-reveal mx-auto w-full max-w-md">
            <p className="eyebrow">{registering ? `Cadastro de ${selectedProfileLabel}` : `Acesso ${selectedProfileLabel}`}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink">
              {registering ? "Crie seu acesso" : `Bem-vindo ao ${MARCA.nome}`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {registering
                ? `Cadastre seus dados e defina uma senha para acessar o portal como ${selectedProfileLabel}.`
                : `Entre com a sua conta de ${selectedProfileLabel} para continuar.`}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-5">
              {registering ? (
                <>
                  {/* O CNPJ vem primeiro: é ele que identifica a empresa, e com
                      ele o resto do cadastro pode vir pronto. */}
                  {profile === "supplier" && (
                    <div className="grid gap-1.5">
                      <label htmlFor="companyCnpj" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
                        CNPJ da empresa
                      </label>
                      <input
                        id="companyCnpj"
                        required
                        inputMode="numeric"
                        value={companyCnpj}
                        onChange={event => setCompanyCnpj(event.target.value)}
                        placeholder="00.000.000/0000-00"
                        className={fieldClass}
                      />
                      {cnpjLimpo.length > 0 && cnpjLimpo.length < 14 && <p className="text-[11px] text-ink-faint">Faltam {14 - cnpjLimpo.length} dígito(s).</p>}
                      {empresa.isFetching && <p className="text-[11px] text-ink-faint">Procurando a empresa...</p>}
                      {cnpjLimpo.length === 14 && !empresa.isFetching && (razaoSocialAchada
                        ? <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-state-go"><CheckCircle2 className="size-3.5" />Empresa encontrada. Confira o nome abaixo e siga para o e-mail.</p>
                        : <p className="text-[11px] text-ink-faint">Não achamos esse CNPJ por aqui. Preencha a razão social abaixo.</p>)}
                    </div>
                  )}
                  <div className="grid gap-1.5">
                    <label htmlFor="companyName" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
                      {profile === "supplier" ? "Nome da empresa / razão social" : "Nome completo"}
                    </label>
                    <input
                      id="companyName"
                      required
                      value={companyName}
                      onChange={event => setCompanyName(event.target.value)}
                      placeholder={profile === "supplier" ? "Ex.: RVD Fornecimentos Ltda." : "Ex.: Maria da Silva"}
                      className={fieldClass}
                    />
                  </div>
                </>
              ) : (
                <ChosenAccess profile={profile} fromRoute={Boolean(routeProfile)} onSelect={selectProfile} />
              )}

              <div className="grid gap-1.5">
                <label htmlFor="email" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
                  E-mail ou login
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    id="email"
                    type={registering ? "email" : "text"}
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="nome@empresa.com"
                    className={`${fieldClass} pl-10`}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="password" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
                  Senha
                </label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    id="password"
                    type="password"
                    minLength={registering ? 6 : 1}
                    required
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder={registering ? "Mínimo de 6 caracteres" : "Sua senha"}
                    className={`${fieldClass} pl-10`}
                  />
                </div>
                {/* Sem este link, quem esquecia a senha só tinha um caminho:
                    ligar para a operação e pedir que alguém trocasse por ele.
                    Fica embaixo da senha, que é onde a pessoa percebe que não
                    lembra dela. */}
                {!registering && (
                  <button
                    type="button"
                    onClick={() => setRecuperando(true)}
                    className="justify-self-end text-xs font-bold text-rvd-plum underline-offset-2 hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              {registering && (
                <div className="grid gap-1.5">
                  <label
                    htmlFor="passwordConfirmation"
                    className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft"
                  >
                    Confirmar senha
                  </label>
                  <input
                    id="passwordConfirmation"
                    type="password"
                    minLength={6}
                    required
                    value={passwordConfirmation}
                    onChange={event => setPasswordConfirmation(event.target.value)}
                    placeholder="Repita a senha"
                    className={fieldClass}
                  />
                </div>
              )}
              <Button
                type="submit"
                disabled={pending}
                className="h-12 w-full rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand/90 active:scale-[0.99]"
              >
                {pending ? (
                  "Processando..."
                ) : registering ? (
                  <>
                    <UserPlus className="size-4" />
                    Criar conta de {selectedProfileLabel}
                  </>
                ) : (
                  <>
                    Entrar no portal
                    <ChevronRight className="size-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              {registering ? (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="inline-flex items-center gap-2 text-sm font-bold text-rvd-plum hover:underline"
                >
                  <ArrowLeft className="size-4" />
                  Já tenho conta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="inline-flex items-center gap-2 text-sm font-bold text-rvd-plum hover:underline"
                >
                  <UserPlus className="size-4" />
                  Novo cadastro de {selectedProfileLabel}
                </button>
              )}
            </div>
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setLocation("/")}
                className="inline-flex items-center gap-2 text-xs font-bold text-ink-faint hover:text-ink"
              >
                <HomeIcon className="size-3.5" />
                Voltar para a escolha de acesso
              </button>
            </div>
            <p className="mt-6 border-t border-line pt-4 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
              Mariano System
            </p>
          </div>
        </section>
      </div>
      <RecuperarSenhaDialog
        open={recuperando}
        onOpenChange={setRecuperando}
        emailInicial={email}
      />
    </main>
  );
}

/**
 * Pedir um link para trocar a senha.
 *
 * A resposta é a mesma para e-mail cadastrado e não cadastrado, de propósito:
 * dizer "essa conta não existe" entregaria a quem tentasse adivinhar uma lista
 * de quem é cliente da casa. Quem tem conta recebe o link; quem não tem lê a
 * mesma frase e não descobre nada.
 */
function RecuperarSenhaDialog({
  open,
  onOpenChange,
  emailInicial,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  emailInicial: string;
}) {
  const [email, setEmail] = useState(emailInicial);
  const [enviado, setEnviado] = useState(false);
  // O e-mail já digitado no login entra aqui sozinho: quem esqueceu a senha
  // não deve ter que digitar o endereço de novo.
  useEffect(() => {
    if (open) {
      setEmail(emailInicial);
      setEnviado(false);
    }
  }, [open, emailInicial]);

  const pedir = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setEnviado(true),
    onError: erro => toast.error(erro.message),
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const endereco = email.trim();
    if (!endereco) return toast.error("Informe o seu e-mail.");
    pedir.mutate({ email: endereco });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-3xl !border !border-line !bg-surface p-0 sm:max-w-md">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum">
              <KeyRound className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Esqueci minha senha</DialogTitle>
              <DialogDescription className="text-[13px] text-ink-soft">
                Enviamos um link para você criar uma senha nova.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {enviado ? (
          <div className="px-6 py-8 text-center">
            <CheckCircle2 className="mx-auto size-9 text-state-go" />
            <p className="mt-4 text-sm font-bold text-ink">Se existir uma conta com esse e-mail, o link já está a caminho.</p>
            <p className="mt-2 text-[13px] leading-6 text-ink-soft">
              Confira a caixa de entrada e o lixo eletrônico. O link vale por pouco tempo — se demorar para usar, é só pedir outro.
            </p>
            <Button onClick={() => onOpenChange(false)} className="mt-6 h-11 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand">
              Entendi
            </Button>
          </div>
        ) : (
          <form onSubmit={enviar} className="px-6 py-6">
            <label htmlFor="email-recuperacao" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
              Seu e-mail
            </label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input
                id="email-recuperacao"
                type="email"
                required
                value={email}
                onChange={evento => setEmail(evento.target.value)}
                placeholder="voce@empresa.com.br"
                className={`${fieldClass} pl-10`}
              />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-ink-soft">
              Use o mesmo e-mail com que você entra no portal.
            </p>
            <Button type="submit" disabled={pedir.isPending} className="mt-5 h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand">
              <Send className="size-4" />
              {pedir.isPending ? "Enviando..." : "Enviar o link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
