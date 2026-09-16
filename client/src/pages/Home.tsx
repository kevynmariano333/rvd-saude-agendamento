import { accessProfilePath, accessProfiles } from "@/lib/accessProfiles";
import { homePathFor, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Porta da frente do portal. Antes o visitante caía direto num formulário e
 * tinha de descobrir qual perfil era o dele no meio dos campos de senha; aqui
 * ele escolhe o acesso primeiro e só então vê o login daquele acesso.
 */
export default function Home() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();

  // Quem já está com a sessão aberta não precisa escolher acesso de novo.
  useEffect(() => {
    if (auth.data) setLocation(homePathFor(auth.data.role as PortalRole));
  }, [auth.data, setLocation]);

  return (
    <main className="min-h-screen bg-canvas">
      <section className="relative overflow-hidden bg-brand text-white">
        <div className="absolute right-[-8rem] top-[-7rem] size-80 rounded-full bg-on-brand/40" />
        <div className="absolute bottom-[-12rem] left-[-8rem] size-96 rounded-full bg-white/10" />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-white/95 p-1.5">
              <img src="/RVD-Saude.png" alt="RVD Saúde" className="size-full object-contain" />
            </span>
            <div>
              <p className="font-display text-lg font-extrabold leading-tight">RVD Saúde</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-brand-soft">
                Portal operacional
              </p>
            </div>
          </div>

          <div className="mt-12 max-w-2xl lg:mt-16">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-brand-soft">
              Organização que cuida do seu tempo
            </p>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Do agendamento da nota à liberação do caminhão.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/85">
              Agendamento, portaria e pátio no mesmo portal. Escolha abaixo o acesso que é o seu e entre com a sua
              conta.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
        <p className="eyebrow">Escolha seu acesso</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink">
          Cada acesso abre a sua própria tela
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
          O fornecedor acompanha as entregas dele, o operador cuida da agenda e a portaria opera o portão. Ninguém vê
          a tela de outro perfil.
        </p>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {accessProfiles.map(profile => {
            const Icon = profile.icon;
            return (
              <button
                key={profile.value}
                type="button"
                onClick={() => setLocation(accessProfilePath(profile.value))}
                className="panel group flex flex-col rounded-3xl p-6 text-left transition hover:-translate-y-0.5 hover:border-rvd-plum/40 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rvd-plum"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-rvd-plum-pale/50 text-rvd-plum transition group-hover:bg-brand group-hover:text-white">
                  <Icon className="size-6" />
                </span>
                <p className="mt-5 font-display text-xl font-extrabold text-ink">{profile.headline}</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-soft">{profile.description}</p>
                <ul className="mt-4 space-y-1.5">
                  {profile.bullets.map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs font-bold text-ink-soft">
                      <Check className="size-3.5 shrink-0 text-rvd-plum" />
                      {item}
                    </li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-rvd-plum">
                  Entrar como {profile.label}
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="panel mt-6 flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-blue-pale text-rvd-plum">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">É administrador?</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Entre pelo acesso de operador: sua conta já abre as telas de administração.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLocation(accessProfilePath("operator"))}
            className="shrink-0 rounded-xl border border-line px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-canvas"
          >
            Ir para o acesso do operador
          </button>
        </div>

        <p className="mt-10 border-t border-line pt-5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
          Mariano System
        </p>
      </section>
    </main>
  );
}
