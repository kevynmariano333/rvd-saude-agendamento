-- Sedex sai da lista de categorias da RVD e entram as transportadoras usadas na
-- operação. Registros já gravados como 'sedex' passam a 'correios' — o Sedex é
-- um serviço dos Correios, então a leitura do histórico continua verdadeira.
-- A coluna vira varchar antes da troca: um MODIFY direto para o enum novo
-- apagaria (ou recusaria) toda linha cujo valor não estivesse na lista nova.
ALTER TABLE `attendances` MODIFY COLUMN `classificationDetail` varchar(32) NOT NULL DEFAULT 'nao_aplicavel';--> statement-breakpoint
UPDATE `attendances` SET `classificationDetail` = 'correios' WHERE `classificationDetail` = 'sedex';--> statement-breakpoint
ALTER TABLE `attendances` MODIFY COLUMN `classificationDetail` enum('maternidade','hospital','mercado_livre','correios','braspress','excargo','rodonaves','br4','jamef','nao_aplicavel') NOT NULL DEFAULT 'nao_aplicavel';--> statement-breakpoint
ALTER TABLE `attendances` ADD `driverDocument` varchar(32);--> statement-breakpoint
ALTER TABLE `attendances` ADD `invoiceNumbersJson` text;
