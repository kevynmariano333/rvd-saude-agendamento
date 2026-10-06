ALTER TABLE `appointments` ADD `semAgendamento` boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- As notas que já estão no banco com a data do clique no lugar do agendamento.
--
-- Só as lançadas à mão pelo portal: nelas o sistema gravou o instante do
-- registro porque a coluna não aceita vazio. Um minuto de folga porque o
-- registro e a gravação não acontecem no mesmo segundo.
--
-- O acervo importado fica de fora de propósito: lá a data veio do sistema de
-- origem, e se ela coincide com a criação é porque era assim na origem --
-- reescrever isso seria inventar história que não é nossa.
--
-- Nota que depois foi mesmo agendada também fica de fora: se existe um evento
-- de agendamento no histórico, alguém combinou aquela data.
UPDATE `appointments` a
SET a.`semAgendamento` = 1
WHERE a.`source` = 'manual_xml'
  AND ABS(TIMESTAMPDIFF(SECOND, a.`createdAt`, a.`scheduledFor`)) <= 60
  AND NOT EXISTS (
    SELECT 1 FROM `appointmentStatusHistory` h
    WHERE h.`appointmentId` = a.`id` AND h.`nextStatus` = 'scheduled'
  );
