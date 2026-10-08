import { MARCA_COMPLETA } from "@shared/marca";
import CaminhaoDaMarca from "./CaminhaoDaMarca";

export default function LoadingTruck({ label = "Organizando seus agendamentos" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-surface px-6">
      <div className="relative w-full max-w-md text-center">
        <div className="relative mx-auto flex h-36 w-60 items-center justify-center">
          <CaminhaoDaMarca className="rvd-login-truck h-28 w-auto" />
        </div>
        <p className="mt-5 font-display text-lg font-extrabold text-ink">{label}</p>
        <p className="mt-2 text-sm text-ink-soft">{MARCA_COMPLETA}</p>
      </div>
    </div>
  );
}
