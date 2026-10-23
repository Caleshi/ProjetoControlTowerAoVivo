-- Projetos em andamento, do pior para o melhor: crítico, depois atenção, depois ok;
-- dentro de cada grupo, o menor entre SPI e CPI primeiro.
-- A causa principal é a que mais aparece no status semanal dos últimos 90 dias
-- (desde 18/07/2026), sem contar "sem_bloqueio" e "nao_reportado". Os dias de
-- impacto por falta de SRE e por rotatividade são o que o simulador usa.
WITH causa AS (
  SELECT projeto_id,
         causa_bloqueio,
         COUNT(*)                         AS semanas,
         SUM(COALESCE(dias_impacto, 0))   AS dias
  FROM lakehouse_vertice.gold.status_estruturado
  WHERE data_status >= DATE'2026-07-18'
    AND causa_bloqueio NOT IN ('sem_bloqueio', 'nao_reportado')
  GROUP BY projeto_id, causa_bloqueio
),
por_projeto AS (
  SELECT projeto_id,
         MAX_BY(causa_bloqueio, semanas)                                  AS causa_principal,
         SUM(CASE WHEN causa_bloqueio = 'falta_sre'    THEN dias ELSE 0 END) AS dias_falta_sre,
         SUM(CASE WHEN causa_bloqueio = 'rotatividade' THEN dias ELSE 0 END) AS dias_rotatividade
  FROM causa
  GROUP BY projeto_id
)
SELECT p.projeto                                AS projeto_id,
       p.nome_projeto,
       p.cliente,
       p.situacao,
       p.spi,
       p.cpi,
       p.estouro_previsto,
       p.atraso_projetado_dias,
       p.farol_do_gerente,
       p.farol_calculado,
       p.melancia,
       COALESCE(c.causa_principal, 'sem_bloqueio') AS causa_principal,
       COALESCE(c.dias_falta_sre, 0)               AS dias_falta_sre,
       COALESCE(c.dias_rotatividade, 0)            AS dias_rotatividade
FROM lakehouse_vertice.gold.projeto_situacao_atual p
LEFT JOIN por_projeto c ON c.projeto_id = p.projeto
WHERE p.status = 'em_andamento'
ORDER BY CASE p.situacao WHEN 'crítico' THEN 0 WHEN 'atenção' THEN 1 ELSE 2 END,
         LEAST(p.spi, p.cpi)
