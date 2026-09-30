-- O motivo que o Agiliza informou e o portal jogou fora.
--
-- Quando o código de backlog do Agiliza não tinha par na lista fechada daqui, a
-- importação gravava `backlogReasonCode` nulo — e o relatório passava a escrever
-- "Motivo não informado" numa nota em que o motivo foi informado. O dado nunca
-- se perdeu: a descrição de toda nota importada guarda o código de origem entre
-- parênteses, que é de onde este UPDATE o recupera.
--
-- Mexe só em nota que tem a frase exata que a importação escreveu, e só onde o
-- código está vazio: nota com motivo já reconhecido não é tocada. `REGEXP_REPLACE`
-- ficou de fora de propósito — ele exige MySQL 8, e o resto do arquivo não.
UPDATE `appointments`
SET `backlogReasonCode` = LEFT(
  UPPER(
    REPLACE(
      REPLACE(
        TRIM(
          SUBSTRING_INDEX(
            SUBSTRING_INDEX(`backlogReason`, 'código de origem: ', -1),
            ')',
            1
          )
        ),
        ' ',
        '_'
      ),
      '-',
      '_'
    )
  ),
  60
)
WHERE `backlogReasonCode` IS NULL
  AND `backlogReason` LIKE '%sem correspondência na lista do portal (código de origem: %'
  AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(`backlogReason`, 'código de origem: ', -1), ')', 1)) <> ''
  AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(`backlogReason`, 'código de origem: ', -1), ')', 1)) <> 'não informado';
