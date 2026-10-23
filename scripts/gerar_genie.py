#!/usr/bin/env python3
"""Gera o Genie Agent do Projeto Farol (noite 4, prompt 2) como JSON versionado.

Uso:  python3 scripts/gerar_genie.py --profile <perfil>

Escreve resources/farol.geniespace.json, que o bundle publica no deploy
(resources/genie.genie_space.yml). O modelo de IA é o mesmo da noite 1: o que
muda é tudo que está embaixo dele: a gold com as 3 ferramentas integradas, a
métrica governada, o score do modelo (se existir) e estas instruções.

O score do modelo (gold.score_estouro_30_d) entra SÓ se a tabela existir: o
script pergunta com `databricks tables exists`. Sem ela, nenhuma instrução nem
exemplo fala de score, e o Genie não tenta ler uma tabela que não existe.

Neste workspace a gold veio do upload de arquivos, e os nomes diferem do gabarito:
  - projeto_situacao_atual guarda o código do projeto em `projeto` e o nome em
    `nome_projeto`; as outras tabelas usam `projeto_id`.
  - a tabela de entregas é gold.entregas_fornecedor (não há silver).
  - o score se chama score_estouro_30_d (com _d).

Ordem: o Genie só publica com as tabelas existindo (mv_projetos nasce na
tarefa metricas_governadas). Do zero: deploy → run → deploy.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

SAIDA = pathlib.Path(__file__).resolve().parents[1] / "resources" / "farol.geniespace.json"
G = "lakehouse_vertice.gold"
SCORE = f"{G}.score_estouro_30_d"


def ident(prefixo: str, n: int) -> str:
    return f"{prefixo}{n:0{32 - len(prefixo)}d}"   # 32 caracteres hex, únicos e ordenados


def tabela_existe(nome: str, profile: str) -> bool:
    r = subprocess.run(["databricks", "tables", "exists", nome, "--profile", profile, "-o", "json"],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(f"databricks tables exists falhou: {r.stderr.strip()}")
    return bool(json.loads(r.stdout).get("table_exists"))


E_COMMERCE = ("(lower(tipo_projeto) LIKE '%commerce%' OR lower(tipo_projeto) LIKE '%checkout%' "
              "OR lower(tipo_projeto) LIKE '%marketplace%')")

INSTRUCOES = [
    "Você é o analista da Torre de Controle (Projeto Farol) da Vértice Tecnologia, empresa de tecnologia com 520 pessoas e 60 projetos de clientes (varejo, financeiro, saúde, logística, indústria). Quem pergunta é o dono da empresa ou alguém da diretoria. Responda em português, com números em reais (R$) e índices com 2 casas.",
    "HOJE é 16/10/2026 (sexta-feira). Nunca use current_date(). 'Últimos 90 dias' = data >= DATE'2026-07-18'. 'Últimas 12 semanas' = semana > DATE'2026-07-24'. 'Últimas 8 semanas' = semana > DATE'2026-08-21'. 'Próximo mês' = de 16/10/2026 a 15/11/2026.",
    "Nomes das colunas: em projeto_situacao_atual o código do projeto (ex.: PRJ-011) está na coluna `projeto` e o nome na coluna `nome_projeto`. Em todas as outras tabelas o código está em `projeto_id`. Para juntar: projeto_situacao_atual.projeto = <outra tabela>.projeto_id.",
    "Definições: SPI = EV / PV (abaixo de 1 é atraso). CPI = EV / AC (abaixo de 1 é estouro de custo). EAC = orçamento / CPI. Estouro previsto = EAC - orçamento, só quando positivo. Margem projetada = (valor do contrato - EAC) / valor do contrato. Atraso projetado = duração baseline / SPI - duração baseline. Regras de corte: SPI ou CPI < 0,9 = atenção, < 0,8 = crítico. 'Atrasado' ou 'em risco' = situacao 'atenção' ou 'crítico'.",
    "Para totais da carteira HOJE (SPI, CPI, EAC, estouro previsto, margem, atraso médio, carteira, contagem de projetos em risco, críticos e melancias), use a metric view mv_projetos com MEASURE(). Ela já filtra os projetos em andamento. Projetos concluídos nunca entram em contagens de risco nem no estouro previsto.",
    "Rankings e listas de projeto (maior estouro, pior SPI, maior atraso, quais projetos): use a tabela projeto_situacao_atual com WHERE status = 'em_andamento', ORDER BY e LIMIT. A metric view mv_projetos é para totais, não para ranking.",
    "Para evolução no tempo use fato_projeto_semana. PV, EV e AC em fato_projeto_semana são ACUMULADOS até a semana: nunca some semanas diferentes do mesmo projeto. Para o valor de uma semana, filtre a semana.",
    "Farol: farol_do_gerente é o que o gerente publicou. farol_calculado segue a regra do manual (verde com SPI >= 0,95, amarelo >= 0,90, vermelho abaixo). 'Melancia' = farol do gerente verde com SPI < 0,9: use a coluna melancia de projeto_situacao_atual.",
    "'Por que o projeto X atrasou?' e 'principal causa de bloqueio': use status_estruturado (causa_bloqueio, bloqueio, quem_destrava, dias_impacto), contando as causas dos últimos 90 dias (data_status >= DATE'2026-07-18') e ignorando 'sem_bloqueio' e 'nao_reportado'. Mostre também o SPI de projeto_situacao_atual. Se a causa for falta_sre, procure SREs com utilização abaixo de 20% em outros projetos (utilizacao_pessoa_semana, papel = 'sre').",
    "Gente parada: utilizacao_pessoa_semana (utilizacao, horas_ociosas, custo_ocioso, papel). Utilização baixa = abaixo de 20% nas últimas 12 semanas, calculada como SUM(horas_apontadas) / SUM(horas_disponiveis) agrupando por pessoa. Papel de SRE é papel = 'sre'.",
    "Fornecedores: gold.entregas_fornecedor. O nome em `fornecedor` já está normalizado (fornecedor_como_veio é o texto original). Fator de atraso = prazo_real_dias / prazo_prometido_dias, e o fornecedor que mais atrasa é o de maior média desse fator. em_atraso = prometida antes de hoje e não entregue. Agrupe por fornecedor.",
    "Change freeze de varejo (Black Friday): de 01/11/2026 a 10/01/2027 nenhum deploy sobe em produção nos projetos de e-commerce em andamento (tipo_projeto com commerce, checkout ou marketplace). Todo projeto desses em andamento é afetado, sem filtrar por data de término.",
    "Quando perguntarem por projeto, responda com o código (ex.: PRJ-011), o nome e o cliente. Pergunta no singular ('qual fornecedor', 'qual projeto') pede UMA linha: ORDER BY ... LIMIT 1.",
    "Quando perguntarem QUAIS CLIENTES, devolva cada cliente uma vez só (SELECT DISTINCT cliente ou GROUP BY cliente).",
]

INSTRUCOES_SEM_SCORE = [
    "O que vai dar errado no próximo mês: junte (1) as entregas de consultoria em atraso (gold.entregas_fornecedor com em_atraso) e (2) os projetos de e-commerce em andamento que o change freeze de varejo trava a partir de 01/11/2026. Para cada item, diga o que fazer agora.",
]

INSTRUCOES_COM_SCORE = [
    f"O que vai dar errado no próximo mês: junte (1) o modelo de estouro em 30 dias, {SCORE} (prob_estouro_30d de 0 a 1, ranking, faixa_risco alto/medio/baixo e principais_fatores em português), na data_referencia mais recente, mostrando os projetos com situacao = 'ok' e faixa_risco 'alto' ou 'medio' (os que a regra de corte ainda não vê) com principais_fatores, (2) as entregas de consultoria em atraso (gold.entregas_fornecedor com em_atraso) e (3) os projetos de e-commerce em andamento que o change freeze de varejo trava a partir de 01/11/2026. Para cada item, diga o que fazer agora.",
    f"Probabilidade de estouro, risco em 30 dias, 'qual projeto vai estourar', 'qual a chance': use {SCORE} na data_referencia mais recente, com join em projeto_situacao_atual (p.projeto = s.projeto_id) para nome, cliente e situação. Mostre a probabilidade em %. Projeto que já está abaixo de 0,9 hoje tem prob 1,0.",
]

# As 4 perguntas do dono, uma SQL de exemplo para cada.
EXEMPLOS = [
    ("Quais projetos estão atrasados, e de quais clientes?",
     f"SELECT projeto, nome_projeto, cliente, situacao, ROUND(spi, 2) AS spi, ROUND(cpi, 2) AS cpi, atraso_projetado_dias "
     f"FROM {G}.projeto_situacao_atual WHERE status = 'em_andamento' AND situacao IN ('crítico', 'atenção') ORDER BY least(spi, cpi)"),
    ("Quanto esse atraso vai me custar?",
     f"SELECT MEASURE(estouro_previsto) AS estouro_previsto, MEASURE(projetos_em_risco) AS projetos_em_risco, "
     f"MEASURE(margem_projetada) AS margem_projetada FROM {G}.mv_projetos"),
    ("Tenho gente parada enquanto outro projeto pede gente?",
     f"SELECT colaborador_id, nome, papel, projeto_id, ROUND(SUM(horas_apontadas) / SUM(horas_disponiveis), 3) AS utilizacao, "
     f"SUM(horas_ociosas) AS horas_ociosas, SUM(custo_ocioso) AS custo_ocioso "
     f"FROM {G}.utilizacao_pessoa_semana WHERE semana > DATE'2026-07-24' "
     f"GROUP BY colaborador_id, nome, papel, projeto_id HAVING SUM(horas_apontadas) / SUM(horas_disponiveis) < 0.2 ORDER BY utilizacao"),
]

PROXIMO_MES_FORNECEDOR_E_FREEZE = (
    f"SELECT 'entrega de fornecedor atrasada' AS risco, e.projeto_id, p.nome_projeto, "
    f"concat(e.fornecedor, ': ', e.item, ' (', CAST(datediff(DATE'2026-10-16', e.data_prometida) AS STRING), ' dias de atraso)') AS detalhe, "
    f"'cobrar o fornecedor e aplicar a multa do contrato' AS o_que_fazer "
    f"FROM {G}.entregas_fornecedor e JOIN {G}.projeto_situacao_atual p ON p.projeto = e.projeto_id WHERE e.em_atraso "
    f"UNION ALL "
    f"SELECT 'change freeze da Black Friday', projeto, nome_projeto, "
    f"'deploy em produção travado de 01/11/2026 a 10/01/2027', 'antecipar o que der para subir até 31/10' "
    f"FROM {G}.projeto_situacao_atual WHERE status = 'em_andamento' AND {E_COMMERCE}")

EXEMPLO_PROXIMO_MES_SEM_SCORE = ("O que vai dar errado no próximo mês, e o que eu faço agora?",
                                 PROXIMO_MES_FORNECEDOR_E_FREEZE)

EXEMPLOS_COM_SCORE = [
    ("O que vai dar errado no próximo mês, e o que eu faço agora?",
     f"SELECT 'risco de estouro em 30 dias (modelo)' AS risco, s.projeto_id, p.nome_projeto, "
     f"concat(CAST(ROUND(s.prob_estouro_30d * 100) AS INT), '% de chance: ', s.principais_fatores) AS detalhe, "
     f"'olhar agora, antes de cruzar 0,9' AS o_que_fazer "
     f"FROM {SCORE} s JOIN {G}.projeto_situacao_atual p ON p.projeto = s.projeto_id "
     f"WHERE s.data_referencia = (SELECT MAX(data_referencia) FROM {SCORE}) "
     f"AND p.situacao = 'ok' AND s.faixa_risco IN ('alto', 'medio') "
     f"UNION ALL {PROXIMO_MES_FORNECEDOR_E_FREEZE}"),
    ("Qual a chance de o PRJ-024 estourar?",
     f"SELECT s.projeto_id, p.nome_projeto, p.cliente, p.situacao, ROUND(s.prob_estouro_30d, 2) AS prob_estouro_30d, s.faixa_risco, "
     f"s.principais_fatores FROM {SCORE} s JOIN {G}.projeto_situacao_atual p ON p.projeto = s.projeto_id "
     f"WHERE s.projeto_id = 'PRJ-024' AND s.data_referencia = (SELECT MAX(data_referencia) FROM {SCORE})"),
]

PERGUNTAS = ["Quais projetos estão atrasados, e de quais clientes?",
             "Quanto esse atraso vai me custar?",
             "Tenho gente parada enquanto outro projeto pede gente?",
             "O que vai dar errado no próximo mês, e o que eu faço agora?"]

TABELAS = [f"{G}.fato_projeto_semana", f"{G}.projeto_situacao_atual", f"{G}.status_estruturado",
           f"{G}.utilizacao_pessoa_semana", f"{G}.entregas_fornecedor"]
METRICAS = [f"{G}.mv_projetos"]


def montar(com_score: bool) -> dict:
    tabelas = TABELAS + ([SCORE] if com_score else [])
    instrucoes = INSTRUCOES + (INSTRUCOES_COM_SCORE if com_score else INSTRUCOES_SEM_SCORE)
    exemplos = EXEMPLOS + (EXEMPLOS_COM_SCORE if com_score else [EXEMPLO_PROXIMO_MES_SEM_SCORE])
    return {
        "version": 2,
        "config": {"sample_questions": [{"id": ident("b1", i), "question": [q]} for i, q in enumerate(PERGUNTAS, 1)]},
        "data_sources": {
            "tables": [{"identifier": t} for t in sorted(tabelas)],
            "metric_views": [{"identifier": m} for m in sorted(METRICAS)],
        },
        "instructions": {
            "text_instructions": [{"id": ident("c1", 1), "content": [l + "\n" for l in instrucoes]}],
            "example_question_sqls": [{"id": ident("d1", i), "question": [q], "sql": [s]}
                                      for i, (q, s) in enumerate(exemplos, 1)],
        },
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--profile", required=True, help="profile da CLI (para conferir se o score existe)")
    args = ap.parse_args()
    com_score = tabela_existe(SCORE, args.profile)
    SAIDA.write_text(json.dumps(montar(com_score), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ok: {SAIDA} ({'com' if com_score else 'sem'} o score do modelo)")
