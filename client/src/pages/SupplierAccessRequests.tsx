import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatCnpj } from "@/lib/portal";
import { CheckCircle2, ShieldCheck, UserCheck, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

export default function SupplierAccessRequests() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const pending = trpc.supplierAccess.listPending.useQuery(undefined, {
    enabled: Boolean(auth.data && auth.data.role !== "supplier"),
  });

  const decide = trpc.supplierAccess.decide.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(variables.approve ? "Acesso liberado." : "Acesso recusado.");
      utils.supplierAccess.listPending.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data && auth.data.role === "supplier") setLocation("/fornecedor");
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-white" />;

  const requests = pending.data ?? [];

  return (
    <PortalLayout
      user={auth.data}
      title="Acessos de fornecedores"
      subtitle="Libere ou recuse quem pediu para entrar em uma empresa já cadastrada."
    >
      <section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-rvd-plum">Aprovação</p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-rvd-plum">Solicitações pendentes</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-rvd-plum">
              O primeiro cadastro de um CNPJ entra direto. A partir do segundo, o novo login fica sem acesso
              até você aprovar — quem for liberado passa a ver todas as notas daquela empresa.
            </p>
          </div>
        </div>

        {pending.isLoading ? (
          <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando solicitações...</div>
        ) : requests.length ? (
          <div className="mt-7 space-y-3">
            {requests.map(request => (
              <article
                key={request.id}
                className="rounded-2xl border border-rvd-plum-soft p-4 transition hover:border-rvd-plum"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-extrabold text-rvd-plum">
                      {request.companyName || request.name || "Fornecedor"}
                    </p>
                    <p className="mt-1 text-sm text-rvd-plum">{request.email}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-rvd-plum">
                      CNPJ {formatCnpj(request.companyCnpj || "")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      onClick={() => decide.mutate({ userId: request.id, approve: false })}
                      disabled={decide.isPending}
                      variant="ghost"
                      className="h-10 rounded-xl border border-rvd-plum-soft px-4 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"
                    >
                      <X className="size-4" />
                      Recusar
                    </Button>
                    <Button
                      onClick={() => decide.mutate({ userId: request.id, approve: true })}
                      disabled={decide.isPending}
                      className="h-10 rounded-xl bg-rvd-plum px-4 text-xs font-bold text-white hover:bg-rvd-plum"
                    >
                      <UserCheck className="size-4" />
                      Aprovar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto size-8 text-rvd-plum" />
            <h3 className="mt-4 font-display text-lg font-extrabold text-rvd-plum">Nenhuma solicitação pendente</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-rvd-plum">
              Quando alguém pedir acesso a um CNPJ já cadastrado, o pedido aparece aqui.
            </p>
          </div>
        )}
      </section>
    </PortalLayout>
  );
}
