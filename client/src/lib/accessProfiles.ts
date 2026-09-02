import { Building2, DoorOpen, Stethoscope, type LucideIcon } from "lucide-react";

/**
 * Os três acessos que existem na porta da frente. O administrador não aparece
 * aqui: ele entra pelo acesso de operador e o próprio perfil da conta é que
 * abre as telas de administração.
 */
export type AccessProfile = "supplier" | "operator" | "portaria";

export const accessProfiles: {
  value: AccessProfile;
  slug: string;
  label: string;
  headline: string;
  description: string;
  bullets: string[];
  icon: LucideIcon;
}[] = [
  {
    value: "supplier",
    slug: "fornecedor",
    label: "Fornecedor",
    headline: "Acesso Fornecedor",
    description: "Para a transportadora e o fornecedor que entregam na RVD Saúde.",
    bullets: ["Solicitar agendamento", "Enviar as notas", "Acompanhar cada etapa"],
    icon: Building2,
  },
  {
    value: "operator",
    slug: "operador",
    label: "Operador",
    headline: "Acesso Operador",
    description: "Para quem cuida da agenda e autoriza o recebimento da carga.",
    bullets: ["Agenda e calendário", "Autorizar recebimento", "Relatórios e notas"],
    icon: Stethoscope,
  },
  {
    value: "portaria",
    slug: "portaria",
    label: "Portaria",
    headline: "Acesso Portaria",
    description: "Para o portão: registrar a chegada, liberar a entrada e a saída.",
    bullets: ["Registrar a chegada", "Liberar a entrada", "Concluir a saída"],
    icon: DoorOpen,
  },
];

/** O perfil vem da URL, então um endereço digitado errado não pode virar login. */
export function parseAccessProfile(slug: string | undefined): AccessProfile | null {
  return accessProfiles.find(profile => profile.slug === slug)?.value ?? null;
}

export function accessProfileBySlug(slug: string) {
  return accessProfiles.find(profile => profile.slug === slug) ?? null;
}

export function accessProfilePath(profile: AccessProfile) {
  const found = accessProfiles.find(item => item.value === profile);
  return `/entrar/${found ? found.slug : "fornecedor"}`;
}

export const accessProfileLabel: Record<AccessProfile, string> = {
  supplier: "fornecedor",
  operator: "operador",
  portaria: "portaria",
};
