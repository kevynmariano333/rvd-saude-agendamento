import { DataTable, EmptyState, FieldShell, Panel, PanelBody, PanelHeader, fieldClass } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import LoadingTruck from "@/components/LoadingTruck";
import { homePathFor, isPortalAdmin, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { formatarCnpj } from "@shared/recipients";
import { Building2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

type Formulario = {
  id?: number;
  cnpj: string;
  sigla: string;
  nome: string;
  curto: string;
  artigo: "o" | "a";
  grupo: string;
  razaoSocial: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  ativa: boolean;
};

const VAZIO: Formulario = {
  cnpj: "", sigla: "", nome: "", curto: "", artigo: "o", grupo: "Amil",
  razaoSocial: "", endereco: "", bairro: "", cidade: "", cep: "", ativa: true,
};

/**
 * O cadastro de unidades, para quem administra.
 *
 * Até aqui unidade nova era uma linha escrita no código e um deploy — o que
 * significa que um CEP errado esperava alguém de fora para ser corrigido. Esta
 * tela tira isso do caminho.
 *
 * O CNPJ é o campo que importa de verdade: é ele que a nota traz, e é por ele
 * que o sistema sabe para qual unidade a carga vai. Os outros campos são como
 * a unidade aparece escrita nas telas e no e-mail.
 */
export default function UnidadesPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const cadastro = trpc.unidades.cadastro.useQuery(undefined, { enabled: Boolean(auth.data) });
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Formulario | null>(null);

  const salvar = trpc.unidades.salvar.useMutation({
    onSuccess: async () => {
      toast.success("Unidade salva.");
      setForm(null);
      await Promise.all([utils.unidades.cadastro.invalidate(), utils.unidades.lista.invalidate()]);
    },
    onError: erro => toast.error(erro.message),
  });
  const excluir = trpc.unidades.excluir.useMutation({
    onSuccess: async () => {
      toast.success("Unidade excluída. As notas que ela recebeu continuam no histórico.");
      await Promise.all([utils.unidades.cadastro.invalidate(), utils.unidades.lista.invalidate()]);
    },
    onError: erro => toast.error(erro.message),
  });

  if (auth.isLoading) return <LoadingTruck label="Carregando" />;
  if (!auth.data) { setLocation("/entrar"); return null; }
  if (!isPortalAdmin(auth.data.role as PortalRole)) { setLocation(homePathFor(auth.data.role as PortalRole)); return null; }

  const campo = (chave: keyof Formulario, valor: string | boolean) =>
    setForm(atual => (atual ? { ...atual, [chave]: valor } : atual));

  const enviar = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    salvar.mutate(form);
  };

  return (
    <PortalLayout user={auth.data} title="Unidades" subtitle="As unidades que recebem carga, do jeito que aparecem nas telas e no e-mail.">
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            eyebrow="Cadastro"
            title="Unidades que recebem carga"
            description="O CNPJ é o que a nota traz: é por ele que o sistema sabe para qual unidade a carga vai."
            icon={Building2}
            actions={!form && (
              <Button onClick={() => setForm({ ...VAZIO })} className="rounded-xl bg-brand font-bold text-white">
                <Plus className="size-4" />Nova unidade
              </Button>
            )}
          />
          {cadastro.isLoading ? (
            <PanelBody><p className="text-sm text-ink-soft">Carregando o cadastro…</p></PanelBody>
          ) : cadastro.data?.length ? (
            <DataTable head={<><th>Sigla</th><th>Nome</th><th>CNPJ</th><th>Endereço</th><th>Cidade</th><th className="text-right">Ações</th></>}>
              {cadastro.data.map(unidade => (
                <tr key={unidade.id} className="[&>td]:px-5 [&>td]:py-3 [&>td]:text-sm sm:[&>td]:px-6">
                  <td className="font-extrabold text-rvd-plum">{unidade.sigla}</td>
                  <td className="text-ink">
                    {unidade.nome}
                    {!unidade.ativa && <span className="ml-2 rounded-lg bg-state-done-bg px-2 py-0.5 text-[10px] font-bold uppercase text-state-done">Desativada</span>}
                  </td>
                  <td className="font-mono text-xs text-ink-soft">{formatarCnpj(unidade.cnpj)}</td>
                  <td className="text-ink-soft">{unidade.endereco}{unidade.bairro && ` — ${unidade.bairro}`}</td>
                  <td className="text-ink-soft">{unidade.cidade}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" aria-label={`Editar ${unidade.sigla}`} onClick={() => setForm({ ...unidade, curto: unidade.curto })} className="rounded-lg text-ink-soft">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Excluir ${unidade.sigla}`}
                        onClick={() => {
                          // Excluir unidade é raro e difícil de desfazer de
                          // cabeça: quem clicou sem querer confirma aqui.
                          if (window.confirm(`Excluir ${unidade.sigla} — ${unidade.nome}? As notas já recebidas continuam no histórico.`)) {
                            excluir.mutate({ id: unidade.id });
                          }
                        }}
                        className="rounded-lg text-state-stop"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <PanelBody><EmptyState icon={Building2} title="Nenhuma unidade cadastrada" description="Cadastre a primeira para o sistema reconhecer o destinatário das notas." /></PanelBody>
          )}
        </Panel>

        {form && (
          <Panel>
            <PanelHeader
              eyebrow={form.id ? "Editar" : "Nova"}
              title={form.id ? `Editar ${form.sigla || "unidade"}` : "Cadastrar unidade"}
              description="A sigla é o código curto que a operação usa; o nome é a frase que entra no e-mail."
              icon={Building2}
              actions={<Button variant="ghost" onClick={() => setForm(null)} className="rounded-xl text-ink-soft"><X className="size-4" />Cancelar</Button>}
            />
            <form onSubmit={enviar}>
              <PanelBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <FieldShell label="CNPJ" htmlFor="cnpj" hint="14 dígitos, como vem na nota.">
                  <input id="cnpj" value={form.cnpj} onChange={e => campo("cnpj", e.target.value)} required className={`${fieldClass} font-mono`} placeholder="00000000000000" />
                </FieldShell>
                <FieldShell label="Sigla" htmlFor="sigla" hint="HSH, MSH, CM 19…">
                  <input id="sigla" value={form.sigla} onChange={e => campo("sigla", e.target.value)} required maxLength={20} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Nome" htmlFor="nome" hint='Entra em frases: "a entrega do Hospital".'>
                  <input id="nome" value={form.nome} onChange={e => campo("nome", e.target.value)} required maxLength={160} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Nome curto" htmlFor="curto" hint="Como cabe na coluna da tabela. Vazio, repete a sigla.">
                  <input id="curto" value={form.curto} onChange={e => campo("curto", e.target.value)} maxLength={20} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Artigo" htmlFor="artigo" hint='"o" Hospital, "a" Maternidade.'>
                  <select id="artigo" value={form.artigo} onChange={e => campo("artigo", e.target.value)} className={fieldClass}>
                    <option value="o">o</option>
                    <option value="a">a</option>
                  </select>
                </FieldShell>
                <FieldShell label="Grupo" htmlFor="grupo" hint="O cliente dono da unidade. O filtro por grupo pega todas juntas.">
                  <input id="grupo" value={form.grupo} onChange={e => campo("grupo", e.target.value)} required maxLength={80} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Razão social" htmlFor="razaoSocial" className="xl:col-span-2">
                  <input id="razaoSocial" value={form.razaoSocial} onChange={e => campo("razaoSocial", e.target.value)} maxLength={255} className={fieldClass} />
                </FieldShell>
                <FieldShell label="CEP" htmlFor="cep">
                  <input id="cep" value={form.cep} onChange={e => campo("cep", e.target.value)} maxLength={9} className={fieldClass} placeholder="00000-000" />
                </FieldShell>
                <FieldShell label="Endereço" htmlFor="endereco" className="xl:col-span-2">
                  <input id="endereco" value={form.endereco} onChange={e => campo("endereco", e.target.value)} maxLength={255} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Bairro" htmlFor="bairro">
                  <input id="bairro" value={form.bairro} onChange={e => campo("bairro", e.target.value)} maxLength={120} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Cidade" htmlFor="cidade">
                  <input id="cidade" value={form.cidade} onChange={e => campo("cidade", e.target.value)} maxLength={120} className={fieldClass} />
                </FieldShell>
                <FieldShell label="Situação" htmlFor="ativa" hint="Desativada, ela some das telas sem levar o histórico junto.">
                  <select id="ativa" value={form.ativa ? "sim" : "nao"} onChange={e => campo("ativa", e.target.value === "sim")} className={fieldClass}>
                    <option value="sim">Ativa</option>
                    <option value="nao">Desativada</option>
                  </select>
                </FieldShell>
              </PanelBody>
              <PanelBody className="border-t border-line pt-4">
                <Button type="submit" disabled={salvar.isPending} className="rounded-xl bg-brand font-bold text-white">
                  {salvar.isPending ? "Salvando…" : "Salvar unidade"}
                </Button>
              </PanelBody>
            </form>
          </Panel>
        )}
      </div>
    </PortalLayout>
  );
}
