import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { roleLabel, type PortalRole } from "@/lib/portal";
import { cargoExisteNaEmpresa, cargoExisteNasEmpresas, ehCargoDeMesa, EMPRESAS, type CodigoDaEmpresa } from "@shared/empresas";
import { trpc } from "@/lib/trpc";
import { UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

/** Os perfis que o administrador pode criar, na ordem em que são pedidos. */
const PERFIS: PortalRole[] = ["supplier", "operator", "planejador", "planejador_leitura", "portaria", "operacao", "admin"];

/**
 * Criação de conta pelo administrador.
 *
 * Antes existiam dois caminhos para entrar: o fornecedor se cadastrar e esperar
 * aprovação, ou a conta de teste. Quem precisava liberar um operador novo não
 * tinha por onde — e acabava emprestando login, que é o pior dos mundos. A
 * conta criada aqui já nasce liberada, porque quem a criou é quem aprovaria.
 */
export default function CriarUsuarioDialog({ open, onOpenChange, onCriado }: { open: boolean; onOpenChange: (open: boolean) => void; onCriado: () => void }) {
  const [role, setRole] = useState<PortalRole>("supplier");
  // Para quem trabalha na mesa: quais empresas a conta atende — uma ou mais. A
  // mesma pessoa pode cuidar da RVD e da LLT. Quem escolhe um cargo que alguma
  // delas não tem — planejador na RVD — volta para a Amil, em vez de ficar com
  // uma combinação que o servidor recusa.
  const [empresas, setEmpresas] = useState<CodigoDaEmpresa[]>(["amil"]);
  const escolherPerfil = (perfil: PortalRole) => {
    setRole(perfil);
    if (!cargoExisteNasEmpresas(perfil, empresas)) setEmpresas(["amil"]);
  };
  // Marca e desmarca, mas nunca deixa a lista vazia: uma conta sem empresa não
  // enxergaria nota nenhuma.
  const alternarEmpresa = (codigo: CodigoDaEmpresa) =>
    setEmpresas(atual => {
      if (!atual.includes(codigo)) return [...atual, codigo];
      return atual.length > 1 ? atual.filter(item => item !== codigo) : atual;
    });
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");

  const criar = trpc.staff.criarUsuario.useMutation({
    onSuccess: usuario => {
      toast.success(usuario.avisado
        ? `Conta de ${usuario.name || usuario.email} criada. Avisamos por e-mail que o login está ativo.`
        : `Conta de ${usuario.name || usuario.email} criada. Ela já pode entrar — o aviso por e-mail não saiu, avise a pessoa.`);
      setNome(""); setEmail(""); setSenha(""); setRazaoSocial(""); setCnpj("");
      onCriado();
      onOpenChange(false);
    },
    onError: erro => toast.error(erro.message),
  });

  const ehFornecedor = role === "supplier";
  const temEmpresa = ehCargoDeMesa(role);
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (nome.trim().length < 2) return toast.error("Informe o nome.");
    if (!email.includes("@")) return toast.error("Informe um e-mail válido.");
    if (senha.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
    if (ehFornecedor && cnpj.replace(/\D/g, "").length !== 14) return toast.error("Informe o CNPJ do fornecedor com 14 dígitos.");
    criar.mutate({ nome: nome.trim(), email: email.trim(), senha, role, empresas: temEmpresa ? empresas : undefined, razaoSocial: razaoSocial.trim() || undefined, cnpj: cnpj || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><UserPlus className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Criar usuário</DialogTitle>
              <DialogDescription className="text-[13px] text-ink-soft">A conta já entra depois de criada, sem passar por aprovação.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4 px-6 py-5">
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Tipo de perfil *</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERFIS.map(perfil => (
                <button key={perfil} type="button" onClick={() => escolherPerfil(perfil)} aria-pressed={role === perfil} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${role === perfil ? "bg-brand text-white" : "bg-sunken text-rvd-plum hover:bg-rvd-plum-pale"}`}>
                  {roleLabel[perfil]}
                </button>
              ))}
            </div>
          </div>
          {/* A empresa decide quais notas a pessoa enxerga: o operador da RVD não
              lê o que vai para o Hospital, e o da Amil não lê o da LLT. */}
          {temEmpresa && (
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Empresas que atende *</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {EMPRESAS.map(item => {
                  const existe = cargoExisteNaEmpresa(role, item.codigo);
                  return (
                    <button key={item.codigo} type="button" disabled={!existe} onClick={() => alternarEmpresa(item.codigo)} aria-pressed={empresas.includes(item.codigo)} title={existe ? undefined : "Esta empresa ainda não tem planejador"} className={`rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${empresas.includes(item.codigo) ? "bg-brand text-white" : "bg-sunken text-rvd-plum hover:bg-rvd-plum-pale"}`}>
                      {item.nome}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-ink-soft">A conta só enxerga as notas das empresas marcadas — dá para marcar mais de uma, como quem cuida da RVD e da LLT. O administrador é o único que vê todas.</p>
            </div>
          )}
          <div>
            <Label htmlFor="novo-nome" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Nome completo *</Label>
            <Input id="novo-nome" value={nome} onChange={evento => setNome(evento.target.value)} maxLength={255} placeholder="Nome de quem vai usar a conta" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="novo-email" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">E-mail *</Label>
              <Input id="novo-email" type="email" value={email} onChange={evento => setEmail(evento.target.value)} maxLength={320} placeholder="email@empresa.com" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
            </div>
            <div>
              <Label htmlFor="novo-senha" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Senha de acesso *</Label>
              <Input id="novo-senha" value={senha} onChange={evento => setSenha(evento.target.value)} maxLength={200} placeholder="Mínimo 6 caracteres" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
            </div>
          </div>
          {/* Só o fornecedor precisa de CNPJ: é por ele que as notas dele são
              encontradas. Um operador sem CNPJ enxerga tudo, por função. */}
          {ehFornecedor && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="novo-cnpj" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">CNPJ *</Label>
                <Input id="novo-cnpj" value={cnpj} onChange={evento => setCnpj(evento.target.value)} inputMode="numeric" maxLength={20} placeholder="00000000000000" className="mt-2 h-11 border-line bg-surface font-mono text-rvd-plum" />
              </div>
              <div>
                <Label htmlFor="novo-razao" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Razão social</Label>
                <Input id="novo-razao" value={razaoSocial} onChange={evento => setRazaoSocial(evento.target.value)} maxLength={255} placeholder="Nome da empresa" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
              </div>
            </div>
          )}
          <p className="rounded-xl bg-sunken px-4 py-3 text-[11px] leading-4 text-ink-soft">
            Anote a senha e passe para a pessoa por um canal seguro. Ela pode trocá-la depois pelo menu do próprio nome.
          </p>
        </form>
        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-ink-soft hover:bg-sunken">Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={criar.isPending} className="h-10 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand"><UserPlus className="size-4" />{criar.isPending ? "Criando..." : "Criar conta"}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
