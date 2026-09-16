import { Truck } from "lucide-react";

export default function LoadingTruck({ label = "Organizando seus agendamentos" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-surface px-6">
      <div className="relative w-full max-w-md text-center">
        <div className="absolute left-0 right-0 top-28 h-px bg-rvd-plum-soft" />
        <div className="relative mx-auto flex h-36 w-52 items-center justify-center motion-safe:animate-[pulse_1.6s_cubic-bezier(0.23,1,0.32,1)_infinite]">
          <div className="relative rounded-2xl bg-brand p-4 shadow-[0_16px_32px_rgba(120,32,120,0.18)]">
            <Truck className="size-16 text-on-brand" strokeWidth={1.7} />
            <img src="/RVD-Saude.png" alt="RVD Saúde" className="absolute left-6 top-8 size-7 rounded-md bg-surface object-cover p-0.5" />
            <span className="absolute -bottom-2 left-3 size-4 rounded-full border-4 border-rvd-plum bg-rvd-blue" />
            <span className="absolute -bottom-2 right-3 size-4 rounded-full border-4 border-rvd-plum bg-rvd-blue" />
          </div>
        </div>
        <p className="mt-5 font-display text-lg font-extrabold text-ink">{label}</p>
        <p className="mt-2 text-sm text-ink-soft">RVD Saúde Agendamento</p>
      </div>
    </div>
  );
}
