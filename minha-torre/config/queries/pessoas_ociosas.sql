-- Gente parada nas últimas 12 semanas (semanas de 31/07 a 16/10/2026): utilização abaixo de 20%.
-- Horas paradas e custo ocioso são MÉDIAS por semana. A gold não guarda o custo da hora:
-- ele sai do próprio custo ocioso (custo ocioso ÷ horas ociosas).
SELECT u.colaborador_id,
       u.nome,
       u.papel,
       u.senioridade,
       u.projeto_id                                          AS projeto_origem,
       p.nome_projeto                                        AS projeto_origem_nome,
       SUM(u.horas_apontadas) / SUM(u.horas_disponiveis)     AS utilizacao_media,
       SUM(u.horas_ociosas) / COUNT(DISTINCT u.semana)       AS horas_paradas_semana,
       SUM(u.custo_ocioso) / COUNT(DISTINCT u.semana)        AS custo_ocioso_semana,
       SUM(u.custo_ocioso) / SUM(u.horas_ociosas)            AS custo_hora
FROM lakehouse_vertice.gold.utilizacao_pessoa_semana u
LEFT JOIN lakehouse_vertice.gold.projeto_situacao_atual p ON p.projeto = u.projeto_id
WHERE u.semana > DATE'2026-07-24'
GROUP BY u.colaborador_id, u.nome, u.papel, u.senioridade, u.projeto_id, p.nome_projeto
HAVING SUM(u.horas_apontadas) / SUM(u.horas_disponiveis) < 0.2
ORDER BY utilizacao_media
