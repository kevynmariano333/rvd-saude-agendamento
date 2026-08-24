import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CalendarClock, CheckCircle2, CircleX, FileText, Loader2, ShieldCheck } from "lucide-react";

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

export default function AppointmentValidation() {
  const token = new URLSearchParams(window.location.search).get("codigo") || "";
  const confirmation = trpc.appointments.publicConfirmation.useQuery({ token }, { enabled: Boolean(token), retry: false });
  const confirmedAppointment = confirmation.data?.valid ? confirmation.data : null;
  const isValid = Boolean(confirmedAppointment);

  return (
    <main className="min-h-screen bg-gradient-to-br from-rvd-plum-pale via-white to-rvd-blue-pale px-4 py-10 text-rvd-plum">
      <section className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3 px-2">
          <img src="/RVD-Saude.png" alt="RVD Saúde" className="size-14 rounded-2xl bg-white object-contain p-1 shadow-sm" />
          <div><p className="text-lg font-extrabold">RVD Saúde</p><p className="text-sm font-medium text-rvd-plum/70">Validação de agendamento</p></div>
        </div>
        <Card className="overflow-hidden border-rvd-plum-soft bg-white shadow-xl shadow-rvd-plum/10">
          <div className={`h-2 ${isValid ? "bg-emerald-500" : "bg-rvd-plum"}`} />
          <CardContent className="p-7 sm:p-9">
            {confirmation.isLoading ? <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center"><Loader2 className="size-10 animate-spin text-rvd-plum" /><p className="font-semibold">Validando o comprovante...</p></div> : isValid ? <>
              <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-10" /></div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">Comprovante validado</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Agendamento confirmado</h1>
              <p className="mt-3 text-sm leading-6 text-rvd-plum/70">Esta nota possui um agendamento ativo no portal RVD Saúde. Apresente o comprovante junto à entrega.</p>
              <div className="mt-7 space-y-4 rounded-2xl bg-rvd-plum-pale p-5">
                <div className="flex gap-3"><FileText className="mt-0.5 size-5 shrink-0 text-rvd-plum" /><div><p className="text-xs font-bold uppercase tracking-wide text-rvd-plum/65">Nota fiscal</p><p className="font-bold">{confirmedAppointment?.invoiceNumber || "Não informado"}</p></div></div>
                <div className="flex gap-3"><CalendarClock className="mt-0.5 size-5 shrink-0 text-rvd-plum" /><div><p className="text-xs font-bold uppercase tracking-wide text-rvd-plum/65">Entrega confirmada para</p><p className="font-bold leading-6">{confirmedAppointment ? formatDateTime(confirmedAppointment.scheduledFor) : "Não informado"}</p></div></div>
              </div>
              <div className="mt-7 flex items-start gap-3 rounded-xl border border-rvd-blue/30 bg-rvd-blue-pale p-4 text-sm leading-5 text-rvd-plum"><ShieldCheck className="mt-0.5 size-5 shrink-0" />A confirmação é consultada diretamente no sistema da RVD Saúde no momento da leitura do QR.</div>
            </> : <>
              <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-red-50 text-red-600"><CircleX className="size-10" /></div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-red-600">Comprovante não validado</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Não foi possível confirmar</h1>
              <p className="mt-3 text-sm leading-6 text-rvd-plum/70">Este QR não é válido, foi alterado ou o agendamento não está mais ativo. Consulte o portal RVD Saúde para confirmar os dados.</p>
            </>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
