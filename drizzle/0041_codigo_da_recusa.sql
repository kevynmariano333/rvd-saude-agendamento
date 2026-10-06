ALTER TABLE `appointments` ADD `rejectionReasonCode` varchar(60);
--> statement-breakpoint
-- As recusas que já estão no banco guardaram só a frase.
--
-- A frase começa pelo rótulo do motivo, porque é assim que `textoDaRecusa` a
-- monta: "Carga avariada — caixa violada". Dá para recuperar o código de quem
-- foi recusado pela tela. O que não casar com nenhum rótulo fica sem código,
-- e é mais honesto do que chutar "Outro": o relatório mostra a frase, e quem
-- medir qualidade sabe que aquela linha não entra na conta por motivo.
UPDATE `appointments`
SET `rejectionReasonCode` = 'NAO_COMPARECEU'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Não compareceu%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'FORA_DO_HORARIO'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Chegou fora do horário%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'SEM_AGENDAMENTO'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Veio sem agendamento%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'DOCUMENTO_IRREGULAR'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Documento fiscal irregular%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'DIVERGENCIA_PEDIDO'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Divergência com o pedido%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'CARGA_AVARIADA'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Carga avariada%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'DUPLICIDADE'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Nota em duplicidade%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'CANCELADA_FORNECEDOR'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Cancelada pelo fornecedor%';
--> statement-breakpoint
UPDATE `appointments`
SET `rejectionReasonCode` = 'OUTRO'
WHERE `status` = 'rejected' AND `rejectionReasonCode` IS NULL
  AND `rejectionReason` LIKE 'Outro motivo%';
