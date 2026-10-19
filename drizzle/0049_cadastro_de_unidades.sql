CREATE TABLE `unidadesDeEntrega` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnpj` varchar(14) NOT NULL,
	`sigla` varchar(20) NOT NULL,
	`nome` varchar(160) NOT NULL,
	`curto` varchar(20) NOT NULL,
	`artigo` enum('o','a') NOT NULL DEFAULT 'o',
	`grupo` varchar(80) NOT NULL,
	`razaoSocial` varchar(255) NOT NULL DEFAULT '',
	`endereco` varchar(255) NOT NULL DEFAULT '',
	`bairro` varchar(120) NOT NULL DEFAULT '',
	`cidade` varchar(120) NOT NULL DEFAULT '',
	`cep` varchar(9) NOT NULL DEFAULT '',
	`ativa` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unidadesDeEntrega_id` PRIMARY KEY(`id`),
	CONSTRAINT `unidades_cnpj_unique` UNIQUE(`cnpj`)
);
