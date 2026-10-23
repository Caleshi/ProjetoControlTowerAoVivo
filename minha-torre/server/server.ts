import { createApp, analytics, server } from '@databricks/appkit';
import { registrarRotaScore } from './routes/score';

// Leitura: config/queries/*.sql no SQL warehouse (gold da Vértice).
// Score do modelo: rota /api/score-estouro (a tabela pode não existir).
createApp({
  plugins: [analytics(), server()],
  // Sem cache: o número da tela é o da gold agora, não o de uma hora atrás.
  cache: { enabled: false },
  onPluginsReady(appkit) {
    registrarRotaScore(appkit);
  },
}).catch(console.error);
