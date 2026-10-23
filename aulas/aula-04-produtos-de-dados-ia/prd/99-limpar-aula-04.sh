#!/usr/bin/env bash
# Apaga o app e o Lakebase da noite 4 (prompts 3 e 4), para ensaiar de novo do zero:
#   · o app do bundle (torre-app ou o seu minha-torre)
#   · o projeto Lakebase (com a tabela torre.decisoes)
#   · o bônus dos contratos, se você fez: silver.documentos_elementos, silver.contratos_clausulas,
#     gold.contratos (e as da versão antiga) e o Genie "Farol · Diretoria + Contratos"
# NÃO toca na bronze, silver e gold da noite 3, no modelo (use 99-limpar-modelo.sh),
# nem no Genie "Farol · Diretoria" (é recurso do bundle vertice).
#
# Uso:
#   bash aulas/aula-04-produtos-de-dados-ia/prd/99-limpar-aula-04.sh <perfil> [pasta-do-app] [projeto-lakebase]           # simula
#   bash aulas/aula-04-produtos-de-dados-ia/prd/99-limpar-aula-04.sh <perfil> [pasta-do-app] [projeto-lakebase] --apagar  # apaga
set -euo pipefail
PERFIL="${1:?informe o profile}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
APP_DIR="${2:-$RAIZ/aulas/aula-04-produtos-de-dados-ia/torre-app}"
LAKEBASE="${3:-farol-torre}"
APAGAR=false; [[ "${*: -1}" == "--apagar" ]] && APAGAR=true
GENIE="Farol · Diretoria + Contratos"

rodar() { if $APAGAR; then echo "→ $*"; "$@" || true; else echo "[simulação] $*"; fi; }

# 1. app (bundle do app)
rodar bash -c "cd '$APP_DIR' && databricks bundle destroy --auto-approve --profile '$PERFIL'"

# 2. Lakebase
# --purge: sem ele a exclusão é "suave" (7 dias) e o nome fica preso; create-project falha
rodar databricks postgres delete-project "projects/$LAKEBASE" --purge --profile "$PERFIL"

# 3. tabelas de contrato (bônus)
TMP=$(mktemp)
cat > "$TMP" <<SQL
DROP TABLE IF EXISTS lakehouse_vertice.gold.contratos;
DROP TABLE IF EXISTS lakehouse_vertice.silver.contratos_clausulas;
DROP TABLE IF EXISTS lakehouse_vertice.silver.documentos_elementos;
-- versão antiga (com o manual e as views de multa e avisos): podem existir em workspaces antigos
DROP VIEW  IF EXISTS lakehouse_vertice.gold.contratos_avisos;
DROP VIEW  IF EXISTS lakehouse_vertice.gold.contratos_multa_fornecedor;
DROP TABLE IF EXISTS lakehouse_vertice.gold.contratos_resumo;
DROP TABLE IF EXISTS lakehouse_vertice.gold.contratos_clausulas;
DROP TABLE IF EXISTS lakehouse_vertice.gold.manual_secoes;
DROP TABLE IF EXISTS lakehouse_vertice.gold.documentos_elementos
SQL
rodar python3 "$RAIZ/scripts/run_sql.py" "$TMP" --profile "$PERFIL" --quiet

# 4. Genie do bônus de contratos (pelo título exato; o "Farol · Diretoria" tem outro título)
SID=$(databricks api get "/api/2.0/genie/spaces?page_size=100" --profile "$PERFIL" \
      | python3 -c "import json,sys; print(next((s['space_id'] for s in json.load(sys.stdin).get('spaces', []) if s['title'] == '$GENIE'), ''))")
if [[ -n "$SID" ]]; then rodar databricks api delete "/api/2.0/genie/spaces/$SID" --profile "$PERFIL"; else echo "Genie '$GENIE' não existe"; fi
rm -f "$TMP"
$APAGAR || echo -e "\nNada foi apagado. Rode de novo com --apagar."
