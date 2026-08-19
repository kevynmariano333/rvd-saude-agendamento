import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Building2, ChevronRight, CircleUserRound, LockKeyhole, Mail, Stethoscope, Truck, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Profile = "operator" | "supplier";
type AccessMode = "login" | "register";

const profileLabel: Record<Profile, string> = {
  operator: "operador",
  supplier: "fornecedor",
};

export default function Login() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<Profile>("supplier");
  const [mode, setMode] = useState<AccessMode>("login");
  const [companyName, setCompanyName] = useState("");
  const [companyCnpj, setCompanyCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const auth = trpc.auth.me.useQuery();
  const login = trpc.auth.login.useMutation({
    onSuccess: user => setLocation(user.role === "supplier" ? "/fornecedor" : "/operador"),
    onError: error => toast.error(error.message),
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: user => {
      toast.success("Cadastro realizado com sucesso.");
      setLocation(user.role === "supplier" ? "/fornecedor" : "/operador");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data) setLocation(auth.data.role === "supplier" ? "/fornecedor" : "/operador");
  }, [auth.data, setLocation]);

  function selectProfile(nextProfile: Profile) {
    setProfile(nextProfile);
    setCompanyCnpj("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "register") {
      if (password !== passwordConfirmation) return toast.error("As senhas precisam ser iguais.");
      register.mutate({ profile, name: companyName, companyCnpj: profile === "supplier" ? companyCnpj : undefined, email, password });
      return;
    }
    login.mutate({ email, password, profile });
  }

  const registering = mode === "register";
  const pending = login.isPending || register.isPending;
  const selectedProfileLabel = profileLabel[profile];

  return (
    <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-rvd-plum-soft bg-white lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-rvd-plum px-7 py-10 text-white sm:px-12 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-14">
          <div className="absolute right-[-6rem] top-[-5rem] h-64 w-64 rounded-full bg-rvd-blue" />
          <div className="absolute bottom-[-10rem] left-[-7rem] h-80 w-80 rounded-full bg-rvd-lilac-blue" />
          <div className="absolute left-36 top-8 z-10 hidden sm:block" aria-hidden="true"><div className="absolute -bottom-2 -left-5 w-32 border-t border-dashed border-white/45" /><div className="rvd-login-truck relative flex items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 text-rvd-plum shadow-lg"><Truck className="size-7" strokeWidth={2.4} /><img src="/manus-storage/RVD-Saude_f78a565b.png" alt="" className="size-5 rounded-md object-cover" /></div></div>
          <div className="relative z-10 flex items-center gap-4">
            <img src="/manus-storage/RVD-Saude_f78a565b.png" alt="Logo RVD Saúde" className="h-16 w-16 rounded-full border-4 border-white object-cover" />
            <div><p className="font-display text-xl font-extrabold">RVD Saúde</p><p className="mt-1 text-sm font-medium">Agendamento</p></div>
          </div>
          <div className="relative z-10 mt-20 max-w-md lg:mt-0">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-rvd-blue-pale">Gestão de cuidado</p>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl">Organize seus agendamentos com clareza.</h1>
            <p className="mt-6 max-w-sm text-base leading-7">Uma experiência segura e acolhedora para operadores e fornecedores acompanharem cada etapa do atendimento.</p>
          </div>
          <div className="relative z-10 mt-12 flex gap-3 text-sm font-semibold lg:mt-0"><span className="rounded-full bg-white px-4 py-2 text-rvd-plum">Precisão</span><span className="rounded-full bg-rvd-blue px-4 py-2 text-rvd-plum">Cuidado</span></div>
        </section>

        <section className="flex items-center px-6 py-10 sm:px-12 lg:px-14">
          <div className="rvd-reveal mx-auto w-full max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-rvd-plum">{registering ? `Cadastro de ${selectedProfileLabel}` : "Acesso ao portal"}</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-rvd-plum">{registering ? "Crie sua conta" : "Bem-vindo(a)"}</h2>
            <p className="mt-3 text-sm leading-6 text-rvd-plum">{registering ? `Informe seus dados e defina sua própria senha para acessar o portal de ${selectedProfileLabel}.` : "Selecione seu perfil e informe seus dados para continuar."}</p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              {registering ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-sm font-bold text-rvd-plum">{profile === "supplier" ? "Nome da empresa / razão social" : "Nome completo"}</Label>
                    <Input id="companyName" required value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder={profile === "supplier" ? "Ex.: RVD Fornecimentos Ltda." : "Ex.: Maria da Silva"} className="h-12 border-rvd-plum-soft bg-white text-rvd-plum" />
                  </div>
                  {profile === "supplier" && <div className="space-y-2"><Label htmlFor="companyCnpj" className="text-sm font-bold text-rvd-plum">CNPJ</Label><Input id="companyCnpj" required inputMode="numeric" value={companyCnpj} onChange={event => setCompanyCnpj(event.target.value)} placeholder="00.000.000/0000-00" className="h-12 border-rvd-plum-soft bg-white text-rvd-plum" /></div>}
                </>
              ) : (
                <fieldset>
                  <Label className="text-sm font-bold text-rvd-plum">Perfil de acesso</Label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => selectProfile("operator")} className={`rounded-2xl border p-4 text-left transition ${profile === "operator" ? "border-rvd-plum bg-rvd-plum text-white" : "border-rvd-plum-soft bg-white text-rvd-plum hover:bg-rvd-plum-pale"}`}><Stethoscope className="size-5" /><span className="mt-4 block text-sm font-bold">Operador</span><span className="mt-1 block text-xs">Gerencia solicitações</span></button>
                    <button type="button" onClick={() => selectProfile("supplier")} className={`rounded-2xl border p-4 text-left transition ${profile === "supplier" ? "border-rvd-blue bg-rvd-blue text-rvd-plum" : "border-rvd-plum-soft bg-white text-rvd-plum hover:bg-rvd-plum-pale"}`}><Building2 className="size-5" /><span className="mt-4 block text-sm font-bold">Fornecedor</span><span className="mt-1 block text-xs">Solicita atendimentos</span></button>
                  </div>
                </fieldset>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-bold text-rvd-plum">{registering ? "E-mail" : "E-mail ou login de teste"}</Label>
                <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-rvd-plum" /><Input id="email" type={registering ? "email" : "text"} required value={email} onChange={event => setEmail(event.target.value)} placeholder={registering ? "nome@empresa.com" : "nome@empresa.com ou admin"} className="h-12 border-rvd-plum-soft bg-white pl-11 text-rvd-plum placeholder:text-rvd-plum/70" /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-bold text-rvd-plum">Senha</Label>
                <div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-rvd-plum" /><Input id="password" type="password" minLength={registering ? 6 : 1} required value={password} onChange={event => setPassword(event.target.value)} placeholder={registering ? "Mínimo de 6 caracteres" : "Sua senha ou admin no teste"} className="h-12 border-rvd-plum-soft bg-white pl-11 text-rvd-plum placeholder:text-rvd-plum/70" /></div>
              </div>
              {registering && <div className="space-y-2"><Label htmlFor="passwordConfirmation" className="text-sm font-bold text-rvd-plum">Confirmar senha</Label><Input id="passwordConfirmation" type="password" minLength={6} required value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} placeholder="Repita a senha" className="h-12 border-rvd-plum-soft bg-white text-rvd-plum" /></div>}
              <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl bg-rvd-plum text-sm font-bold text-white hover:bg-rvd-plum active:scale-[0.97]">{pending ? "Processando..." : registering ? <><UserPlus className="size-4" />Criar conta de {selectedProfileLabel}</> : <>Entrar no portal <ChevronRight className="size-4" /></>}</Button>
            </form>

            {!registering && <div className="mt-5 rounded-2xl border border-rvd-blue/50 bg-rvd-blue-pale/60 p-4 text-rvd-plum"><div className="flex items-center gap-2 text-sm font-extrabold"><CircleUserRound className="size-4" />Acessos de teste</div><p className="mt-2 text-xs leading-5">Selecione o perfil desejado e use <strong>login: admin</strong> e <strong>senha: admin</strong>. Cada perfil abre o seu próprio painel.</p></div>}
            <div className="mt-5 text-center">{registering ? <button type="button" onClick={() => setMode("login")} className="inline-flex items-center gap-2 text-sm font-bold text-rvd-plum hover:underline"><ArrowLeft className="size-4" />Já tenho conta</button> : <button type="button" onClick={() => setMode("register")} className="inline-flex items-center gap-2 text-sm font-bold text-rvd-plum hover:underline"><UserPlus className="size-4" />Novo cadastro de {selectedProfileLabel}</button>}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
