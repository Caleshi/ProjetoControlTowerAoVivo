import {
  useAnalyticsQuery,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import type { ReactNode } from 'react';
import { CAUSAS, FAROL, corSituacao, dias, indice, num, pct, reaisCurto, useScore } from '../../lib/dados';

const FONTE = 'gold.projeto_situacao_atual · fotografia de 16/10/2026';

function Kpi({ titulo, valor, detalhe, carregando }: { titulo: string; valor: ReactNode; detalhe: string; carregando: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{carregando ? <Skeleton className="h-9 w-24" /> : valor}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detalhe}</CardContent>
    </Card>
  );
}

export function ProjetosPage() {
  const kpis = useAnalyticsQuery('kpis', {});
  const projetos = useAnalyticsQuery('projetos_risco', {});
  const score = useScore();

  const k = kpis.data?.[0];
  const altoRisco = score.linhas.filter((l) => l.faixa_risco === 'alto').length;

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Projetos em risco</h2>
        <p className="text-sm text-muted-foreground">
          {k
            ? `${num(k.projetos_em_risco)} de ${num(k.projetos_em_andamento)} projetos em andamento estão em atenção ou críticos.`
            : 'Projetos em andamento, do pior para o melhor.'}
        </p>
      </div>

      {kpis.error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível ler os indicadores</AlertTitle>
          <AlertDescription>{String(kpis.error)}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          titulo="Em risco"
          carregando={kpis.loading}
          valor={k ? `${num(k.projetos_em_risco)} de ${num(k.projetos_em_andamento)}` : '—'}
          detalhe={k ? `${num(k.projetos_criticos)} críticos · ${num(k.projetos_melancia)} melancias 🍉 · ${FONTE}` : FONTE}
        />
        <Kpi
          titulo="Estouro previsto"
          carregando={kpis.loading}
          valor={k ? reaisCurto(k.estouro_previsto) : '—'}
          detalhe={`EAC − orçamento, projetos em andamento · ${FONTE}`}
        />
        <Kpi
          titulo="Carteira em andamento"
          carregando={kpis.loading}
          valor={k ? reaisCurto(k.carteira) : '—'}
          detalhe={`Soma do valor de contrato · ${FONTE}`}
        />
        <Kpi
          titulo="Alto risco em 30 dias"
          carregando={score.carregando}
          valor={score.disponivel ? altoRisco : '—'}
          detalhe={
            score.disponivel
              ? 'Faixa "alto" do modelo de estouro (gold.score_estouro_30d)'
              : 'Sem o modelo de estouro neste workspace'
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projetos em andamento, do pior para o melhor</CardTitle>
          <CardDescription>
            Crítico com SPI ou CPI abaixo de 0,80; atenção abaixo de 0,90. 🍉 = farol do gerente verde com SPI abaixo de
            0,90. Causa principal = a que mais aparece no status semanal dos últimos 90 dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projetos.loading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
          {projetos.error && (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível ler os projetos</AlertTitle>
              <AlertDescription>{String(projetos.error)}</AlertDescription>
            </Alert>
          )}
          {projetos.data && projetos.data.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhum projeto em andamento</EmptyTitle>
                <EmptyDescription>Confira se o job vertice_farol rodou e a gold foi atualizada.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {projetos.data && projetos.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">SPI</TableHead>
                  <TableHead className="text-right">CPI</TableHead>
                  <TableHead className="text-right">Estouro</TableHead>
                  <TableHead className="text-right">Atraso</TableHead>
                  <TableHead>Farol do gerente</TableHead>
                  <TableHead>Farol calculado</TableHead>
                  <TableHead>Causa principal</TableHead>
                  <TableHead className="text-right">P(estouro)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projetos.data.map((p) => {
                  const s = score.porProjeto.get(p.projeto_id);
                  const melancia = String(p.melancia) === 'true';
                  return (
                    <TableRow key={p.projeto_id}>
                      <TableCell>
                        <div className="font-medium">{p.projeto_id}</div>
                        <div className="text-xs text-muted-foreground">{p.cliente}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={corSituacao(p.situacao)}>{p.situacao}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{indice(p.spi)}</TableCell>
                      <TableCell className="text-right tabular-nums">{indice(p.cpi)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(p.estouro_previsto) > 0 ? reaisCurto(p.estouro_previsto) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(p.atraso_projetado_dias) > 0 ? dias(p.atraso_projetado_dias) : '—'}
                      </TableCell>
                      <TableCell>
                        {FAROL[p.farol_do_gerente] ?? p.farol_do_gerente}
                        {melancia && <span title="Melancia: verde por fora, vermelho por dentro"> 🍉</span>}
                      </TableCell>
                      <TableCell>{FAROL[p.farol_calculado] ?? p.farol_calculado}</TableCell>
                      <TableCell>{CAUSAS[p.causa_principal] ?? p.causa_principal}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {score.disponivel && s ? pct(s.prob_estouro_30d) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
