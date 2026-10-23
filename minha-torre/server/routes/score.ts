// Probabilidade de estouro em 30 dias (o modelo da noite 4, gold.score_estouro_30d).
//
// Exceção consciente à regra "leitura é sempre config/queries/*.sql": a tabela
// vem do modelo e pode ainda não existir. Uma query em config/queries com tabela
// inexistente quebra o typegen e, com ele, o build do app inteiro. Aqui a rota
// responde { disponivel: false } e a tela mostra "—".

import { getExecutionContext, getWarehouseId } from '@databricks/appkit';
import type { Application } from 'express';

interface AppKitComServer {
  server: { extend(fn: (app: Application) => void): void };
}

export interface LinhaScore {
  projeto_id: string;
  prob_estouro_30d: number;
  ranking: number;
  faixa_risco: string;
}

// O contrato chama a tabela de score_estouro_30d; neste workspace ela nasceu como
// score_estouro_30_d. A rota aceita os dois nomes, nessa ordem.
const TABELAS = ['lakehouse_vertice.gold.score_estouro_30d', 'lakehouse_vertice.gold.score_estouro_30_d'];

const consulta = (tabela: string) => `
  SELECT projeto_id, prob_estouro_30d, ranking, faixa_risco
  FROM ${tabela}
  WHERE data_referencia = (SELECT MAX(data_referencia) FROM ${tabela})`;

async function lerScore(): Promise<{ disponivel: boolean; linhas: LinhaScore[]; motivo?: string }> {
  const { client } = getExecutionContext();
  const warehouseId = await getWarehouseId();
  let motivo = 'tabela do score não encontrada';

  for (const tabela of TABELAS) {
    const r = await client.statementExecution.executeStatement({
      warehouse_id: warehouseId,
      statement: consulta(tabela),
      wait_timeout: '30s',
    });
    if (r.status?.state !== 'SUCCEEDED') {
      motivo = r.status?.error?.message ?? String(r.status?.state);
      continue;
    }
    // O warehouse devolve tudo como texto: Number() antes de mandar para a tela.
    const linhas = (r.result?.data_array ?? []).map((l) => ({
      projeto_id: String(l[0] ?? ''),
      prob_estouro_30d: Number(l[1]),
      ranking: Number(l[2]),
      faixa_risco: String(l[3] ?? ''),
    }));
    return { disponivel: linhas.length > 0, linhas };
  }
  return { disponivel: false, linhas: [], motivo };
}

export function registrarRotaScore(appkit: AppKitComServer) {
  appkit.server.extend((app) => {
    app.get('/api/score-estouro', async (_req, res) => {
      try {
        res.json(await lerScore());
      } catch (err) {
        res.json({ disponivel: false, linhas: [], motivo: (err as Error).message });
      }
    });
  });
}
