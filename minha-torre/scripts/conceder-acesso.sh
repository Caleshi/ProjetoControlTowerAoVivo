#!/usr/bin/env bash
# O app é um USUÁRIO do Unity Catalog (um service principal) e nasce sem acesso
# a dado nenhum. `CAN_USE` no warehouse dá o computador, não o dado.
# Sem estes GRANTs o build falha no typegen (INSUFFICIENT_PERMISSIONS) e,
# depois, toda tela carrega vazia.
#
# O service principal muda a cada app criado: o script lê com `apps get`, nunca copie.
# O JSON é lido com Node (o app já exige Node; Python pode não estar instalado).
#
# Uso:  bash scripts/conceder-acesso.sh <perfil> [nome-do-app]
set -euo pipefail
# Git Bash no Windows reescreve "/api/2.0/..." como caminho de arquivo; isto desliga.
export MSYS_NO_PATHCONV=1
PERFIL="${1:?informe o profile}"
APP="${2:-minha-torre}"

APP_JSON=$(databricks apps get "$APP" --profile "$PERFIL" -o json)

SP=$(printf '%s' "$APP_JSON" | node -e '
  const app = JSON.parse(require("fs").readFileSync(0, "utf8"));
  process.stdout.write(app.service_principal_client_id);')

# O warehouse é o mesmo que o app usa (recurso sql-warehouse do databricks.yml).
WAREHOUSE=$(printf '%s' "$APP_JSON" | node -e '
  const app = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const r = (app.resources || []).find((x) => x.sql_warehouse);
  process.stdout.write(r ? r.sql_warehouse.id : "");')

echo "service principal do app $APP: $SP"
echo "warehouse: $WAREHOUSE"

rodar() {
  local sql="$1"
  local corpo
  corpo=$(node -e 'process.stdout.write(JSON.stringify({warehouse_id: process.argv[1], statement: process.argv[2], wait_timeout: "50s"}))' "$WAREHOUSE" "$sql")
  local estado
  estado=$(databricks api post /api/2.0/sql/statements --profile "$PERFIL" --json "$corpo" | node -e '
    const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const s = r.status || {};
    process.stdout.write(s.state + (s.error ? " · " + s.error.message : ""));')
  echo "  $estado  $sql"
  [[ "$estado" == SUCCEEDED* ]]
}

rodar "GRANT USE CATALOG ON CATALOG lakehouse_vertice TO \`$SP\`"
rodar "GRANT USE SCHEMA, SELECT ON SCHEMA lakehouse_vertice.gold TO \`$SP\`"
rodar "GRANT USE SCHEMA, SELECT ON SCHEMA lakehouse_vertice.silver TO \`$SP\`"
echo "pronto: agora rode  databricks apps deploy --profile $PERFIL"
