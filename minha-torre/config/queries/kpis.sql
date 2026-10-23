-- Os números do topo da Torre (fotografia de 16/10/2026), só projetos em andamento.
-- Nada do modelo aqui: o "alto risco em 30 dias" vem da rota /api/score-estouro,
-- porque a tabela do score pode não existir e uma query quebrada derruba o build.
SELECT COUNT(*)                                     AS projetos_em_andamento,
       COUNT_IF(situacao IN ('atenção', 'crítico')) AS projetos_em_risco,
       COUNT_IF(situacao = 'crítico')               AS projetos_criticos,
       COUNT_IF(melancia)                           AS projetos_melancia,
       SUM(estouro_previsto)                        AS estouro_previsto,
       SUM(valor_contrato)                          AS carteira
FROM lakehouse_vertice.gold.projeto_situacao_atual
WHERE status = 'em_andamento'
