import { createApp, analytics, genie, server } from '@databricks/appkit';
import { registrarRotaScore } from './routes/score';

// Leitura: config/queries/*.sql no SQL warehouse (gold da Vértice).
// Score do modelo: rota /api/score-estouro (a tabela pode não existir).
// Conversa: o Genie "Farol · Diretoria" (do bundle vertice), no alias "default",
// lido de DATABRICKS_GENIE_SPACE_ID e executado em nome de quem está logado.
createApp({
  plugins: [analytics(), genie(), server()],
  // Sem cache: o número da tela é o da gold agora, não o de uma hora atrás.
  cache: { enabled: false },
  onPluginsReady(appkit) {
    registrarRotaScore(appkit);
  },
}).catch(console.error);
