import { useEffect, useState } from 'react';

/**
 * Utilidades das telas do Farol.
 *
 * O warehouse devolve TODO número como texto no JSON, mesmo quando o tipo gerado
 * pelo typegen diz `number`. Sem Number(), `+` concatena e o formato não aplica.
 * Tudo passa por num() antes de conta ou formato.
 */
export const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const decimal = (v: number, casas: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** R$ por extenso: R$ 7.530,80. */
export const reais = (v: unknown, casas = 2) =>
  num(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

/** R$ curto para KPI e tabela: R$ 6,5 mi, R$ 256,8 mil. */
export const reaisCurto = (v: unknown) => {
  const n = num(v);
  if (Math.abs(n) >= 1e6) return `R$ ${decimal(n / 1e6, 1)} mi`;
  if (Math.abs(n) >= 1e3) return `R$ ${decimal(n / 1e3, 1)} mil`;
  return reais(n, 0);
};

/** Índice (SPI, CPI) sempre com 2 casas. */
export const indice = (v: unknown) => decimal(num(v), 2);

export const pct = (v: unknown, casas = 0) => `${decimal(num(v) * 100, casas)}%`;

export const horas = (v: unknown, casas = 0) => `${decimal(num(v), casas)} h`;

export const dias = (v: unknown, casas = 0) => `${decimal(num(v), casas)} dias`;

export const CAUSAS: Record<string, string> = {
  change_freeze: 'change freeze',
  falta_sre: 'falta de SRE',
  dependencia_fornecedor: 'fornecedor atrasado',
  rotatividade: 'rotatividade',
  mudanca_escopo: 'escopo sem aditivo',
  bug_retrabalho: 'bug e retrabalho',
  aprovacao_cliente: 'aprovação do cliente',
  sem_bloqueio: '—',
  nao_reportado: 'não reportado',
};

export const FAROL: Record<string, string> = {
  verde: '🟢 verde',
  amarelo: '🟡 amarelo',
  vermelho: '🔴 vermelho',
};

/** Cor semântica da situação: crítico vermelho, atenção âmbar (tokens do tema, nada de hex). */
export const corSituacao = (s: string) =>
  s === 'crítico'
    ? 'bg-destructive text-destructive-foreground'
    : s === 'atenção'
      ? 'bg-warning text-warning-foreground'
      : 'bg-muted text-muted-foreground';

export interface LinhaScore {
  projeto_id: string;
  prob_estouro_30d: number;
  ranking: number;
  faixa_risco: string;
}

export interface Score {
  carregando: boolean;
  disponivel: boolean;
  linhas: LinhaScore[];
  porProjeto: Map<string, LinhaScore>;
}

/**
 * Score do modelo pela rota do servidor (a tabela pode não existir).
 * Sem o modelo, `disponivel` é false e a tela mostra "—".
 */
export function useScore(): Score {
  const [estado, setEstado] = useState<{ carregando: boolean; disponivel: boolean; linhas: LinhaScore[] }>({
    carregando: true,
    disponivel: false,
    linhas: [],
  });

  useEffect(() => {
    let vivo = true;
    fetch('/api/score-estouro')
      .then((r) => r.json())
      .then((j: { disponivel?: boolean; linhas?: LinhaScore[] }) => {
        if (!vivo) return;
        const linhas = (j.linhas ?? []).map((l) => ({
          projeto_id: String(l.projeto_id),
          prob_estouro_30d: num(l.prob_estouro_30d),
          ranking: num(l.ranking),
          faixa_risco: String(l.faixa_risco),
        }));
        setEstado({ carregando: false, disponivel: Boolean(j.disponivel), linhas });
      })
      .catch(() => {
        if (vivo) setEstado({ carregando: false, disponivel: false, linhas: [] });
      });
    return () => {
      vivo = false;
    };
  }, []);

  return { ...estado, porProjeto: new Map(estado.linhas.map((l) => [l.projeto_id, l])) };
}
