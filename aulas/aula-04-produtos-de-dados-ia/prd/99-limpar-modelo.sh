#!/usr/bin/env bash
# Limpa SÓ o modelo (prompt 1 da noite 4) e devolve o ambiente ao fim da noite 3.
#
# A noite 3 continua de pé: bronze, silver, gold, IA, job e dashboard.
# Some apenas o que o prompt do modelo criou, para você rodar de novo, do zero,
# quantas vezes quiser. (Rode antes do prompt 2: o Genie lê o score.)
#
# Uso:  bash aulas/aula-04-produtos-de-dados-ia/prd/99-limpar-modelo.sh <profile> [--apagar] [--gabarito] [pasta-do-bundle]
#       Sem --apagar ele só MOSTRA o que faria.
#       --gabarito: limpa o workspace mas NÃO mexe em arquivo nenhum (o bundle de
#       referência aulas/aula-03-modelagem-claude-code/claude-code/vertice guarda o src/ml de propósito).
#       pasta-do-bundle: onde está o SEU bundle vertice (padrão: claude-code/meu-vertice deste repositório).
#
# O que apaga:
#   1. as tabelas do modelo: ml.features_projeto_semana, ml.modelo_metricas e
#      gold.score_estouro_30d (+ as da versão antiga, quando tudo morava na gold)
#   2. as versões e o modelo registrado no Unity Catalog: ml.modelo_estouro_30d
#      (+ gold.modelo_estouro_30d, da versão antiga)
#   3. o experimento do MLflow (/Users/<você>/vertice)
#   4. no seu bundle: a pasta src/ml e as tarefas ml_* do job; e o redeploy
#   5. a conferência: sai com erro se sobrou alguma coisa
set -euo pipefail

PROFILE="${1:?uso: bash prd/99-limpar-modelo.sh <profile> [--apagar] [--gabarito] [pasta-do-bundle]}"
CONFIRMA="${2:-}"
GABARITO="${3:-}"
CATALOGO="${CATALOGO:-lakehouse_vertice}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
BUNDLE="${4:-$RAIZ/aulas/aula-03-modelagem-claude-code/claude-code/meu-vertice}"
# a versão atual: laboratório no schema ml, só o resultado na gold
TABELAS=(ml.features_projeto_semana ml.modelo_metricas gold.score_estouro_30d
         gold.features_projeto_semana gold.modelo_metricas)   # as duas últimas: versão antiga (tudo na gold)
MODELOS=("$CATALOGO.ml.modelo_estouro_30d"
         "$CATALOGO.gold.modelo_estouro_30d")                 # o segundo: versão antiga

echo "profile:  $PROFILE"
echo "tabelas:  ${TABELAS[*]}"
echo "modelos:  ${MODELOS[*]}"
[ "$GABARITO" = "--gabarito" ] && echo "bundle:   (gabarito: nenhum arquivo é tocado)" || echo "bundle:   $BUNDLE (src/ml e tarefas ml_*)"
echo
if [ "$CONFIRMA" != "--apagar" ]; then
  echo "Simulação. Nada foi apagado. Para apagar:  bash $0 $PROFILE --apagar [--gabarito]"
  exit 0
fi

sql() { printf '%s' "$1" > /tmp/_limpar_modelo.sql; python3 "$RAIZ/scripts/run_sql.py" /tmp/_limpar_modelo.sql --profile "$PROFILE" --quiet --continuar >/dev/null; }

echo "→ tabelas de ML..."
for t in "${TABELAS[@]}"; do sql "DROP TABLE IF EXISTS $CATALOGO.$t"; done

# O delete do modelo RECUSA enquanto houver versão viva ("is not empty").
# E um registro que falhou no meio deixa versão órfã: apague todas.
echo "→ versões e modelos..."
for MODELO in "${MODELOS[@]}"; do
  VERSOES=$(databricks model-versions list "$MODELO" --profile "$PROFILE" -o json 2>/dev/null \
            | grep -oE '"version": *[0-9]+' | grep -oE '[0-9]+' | sort -u || true)
  for v in $VERSOES; do databricks model-versions delete "$MODELO" "$v" --profile "$PROFILE" >/dev/null 2>&1 || true; done
  databricks registered-models delete "$MODELO" --profile "$PROFILE" >/dev/null 2>&1 || echo "   ($MODELO não existia)"
done

echo "→ experimento do MLflow..."
EU=$(databricks current-user me --profile "$PROFILE" -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["userName"])')
databricks workspace delete "/Users/$EU/vertice" --recursive --profile "$PROFILE" >/dev/null 2>&1 || echo "   (pasta não existia)"

if [ "$GABARITO" != "--gabarito" ] && [ -d "$BUNDLE" ]; then
  echo "→ código local do modelo no seu bundle..."
  rm -rf "$BUNDLE/src/ml"
  for f in "$BUNDLE"/resources/*.job.yml; do
    [ -f "$f" ] || continue
    # tira do job todo bloco de tarefa cujo task_key começa com ml_
    python3 - "$f" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
s = re.sub(r"\n(?:[ \t]*#[^\n]*\n)*[ \t]*- task_key: ml_[\s\S]*?(?=\n[ \t]*(?:#[^\n]*\n[ \t]*)*- task_key: |\Z)", "\n", s)
p.write_text(s.rstrip() + "\n")
PY
  done
  if [ -f "$BUNDLE/databricks.yml" ]; then
    echo "→ redeploy do seu bundle..."
    (cd "$BUNDLE" && databricks bundle deploy --profile "$PROFILE" 2>&1 | tail -3) || true
  fi
fi

echo
echo "── conferindo ──────────────────────────────────────────────"
RESTO=0; SOBRA_MODELO=0
for esquema in ml gold; do
  n=$(databricks tables list "$CATALOGO" "$esquema" --profile "$PROFILE" -o json 2>/dev/null \
      | grep -cE '"name": *"(features_projeto_semana|modelo_metricas|score_estouro_30d)"' || true)
  RESTO=$((RESTO + ${n:-0}))
  m=$(databricks registered-models list --catalog-name "$CATALOGO" --schema-name "$esquema" --profile "$PROFILE" -o json 2>/dev/null \
      | grep -c 'modelo_estouro_30d' || true)
  SOBRA_MODELO=$((SOBRA_MODELO + ${m:-0}))
done
echo "  tabelas do modelo que sobraram: $RESTO"
echo "  modelos que sobraram: $SOBRA_MODELO"
# o schema ml fica (vazio): o prompt 1 recria tudo com CREATE SCHEMA IF NOT EXISTS
if [ "$RESTO" != "0" ] || [ "$SOBRA_MODELO" != "0" ]; then echo "Sobrou coisa. NÃO comece o prompt 1 assim."; exit 1; fi
echo "Zerado. O prompt do modelo (bônus) tem que reconstruir tudo do nada: bonus/prompt-modelo-ml.md."
