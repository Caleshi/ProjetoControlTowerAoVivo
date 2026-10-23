import {
  useAnalyticsQuery,
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { useMemo, useState } from 'react';
import { CAUSAS, dias, horas, num, pct, reais, reaisCurto } from '../../lib/dados';

const SEMANAS_NO_MES = 4;
const JANELA_STATUS_DIAS = 90;
const DIAS_NO_MES = 30;

// Que causa do status cada papel destrava: SRE resolve a falta de SRE; qualquer
// outro papel repõe gente onde o status reclama de rotatividade.
const campoDaCausa = (papel: string) => (papel === 'sre' ? 'dias_falta_sre' : 'dias_rotatividade');
const nomeDaCausa = (papel: string) => (papel === 'sre' ? 'falta_sre' : 'rotatividade');

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: 'bom' | 'ruim' }) {
  const cor = destaque === 'bom' ? 'text-success' : destaque === 'ruim' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className={`text-lg font-semibold tabular-nums ${cor}`}>{valor}</span>
    </div>
  );
}

export function SimuladorPage() {
  const pessoas = useAnalyticsQuery('pessoas_ociosas', {});
  const projetos = useAnalyticsQuery('projetos_risco', {});

  const [pessoaId, setPessoaId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [horasOnboarding, setHorasOnboarding] = useState('40');

  const pessoa = pessoas.data?.find((p) => p.colaborador_id === pessoaId);
  const campo = pessoa ? campoDaCausa(pessoa.papel) : 'dias_falta_sre';

  // Destino: só atenção ou crítico, fora o projeto de origem. Para SRE, quem mais
  // sofre com falta de SRE primeiro; para os outros, quem mais sofre com rotatividade.
  const destinos = useMemo(() => {
    const lista = (projetos.data ?? []).filter(
      (p) => (p.situacao === 'atenção' || p.situacao === 'crítico') && p.projeto_id !== pessoa?.projeto_origem,
    );
    return pessoa ? [...lista].sort((a, b) => num(b[campo]) - num(a[campo])) : lista;
  }, [projetos.data, pessoa, campo]);

  const destino = destinos.find((p) => p.projeto_id === destinoId);

  const conta = useMemo(() => {
    if (!pessoa || !destino) return null;
    const custoHora = num(pessoa.custo_hora);
    const horasMes = num(pessoa.horas_paradas_semana) * SEMANAS_NO_MES;
    const ociosidadeEvitada = num(pessoa.custo_ocioso_semana) * SEMANAS_NO_MES;
    const diasImpacto = num(destino[campo]);
    const diasRecuperados = (diasImpacto / JANELA_STATUS_DIAS) * DIAS_NO_MES;
    const onboarding = Math.max(0, num(horasOnboarding)) * custoHora;
    return {
      custoHora,
      horasMes,
      ociosidadeEvitada,
      diasImpacto,
      diasRecuperados,
      onboarding,
      saldo: ociosidadeEvitada - onboarding,
    };
  }, [pessoa, destino, campo, horasOnboarding]);

  const carregando = pessoas.loading || projetos.loading;
  const erro = pessoas.error ?? projetos.error;

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Simulador de realocação</h2>
        <p className="text-sm text-muted-foreground">
          Mover uma pessoa parada para um projeto em risco: quanto deixa de ser pago em ociosidade e quantos dias de
          cronograma voltam.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível ler os dados do simulador</AlertTitle>
          <AlertDescription>{String(erro)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quem e para onde</CardTitle>
          <CardDescription>
            Pessoas com utilização abaixo de 20% nas últimas 12 semanas (gold.utilizacao_pessoa_semana, até 16/10/2026).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {carregando ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : pessoas.data && pessoas.data.length === 0 ? (
            <div className="md:col-span-3">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Ninguém parado</EmptyTitle>
                  <EmptyDescription>Nenhuma pessoa abaixo de 20% de utilização nas últimas 12 semanas.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="pessoa">Pessoa ociosa</Label>
                <Select
                  value={pessoaId}
                  onValueChange={(v) => {
                    setPessoaId(v);
                    setDestinoId('');
                  }}
                >
                  <SelectTrigger id="pessoa">
                    <SelectValue placeholder="Escolha uma pessoa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(pessoas.data ?? []).map((p) => (
                      <SelectItem key={`${p.colaborador_id}-${p.projeto_origem}`} value={p.colaborador_id}>
                        {p.colaborador_id} · {p.nome} · {p.papel} {p.senioridade} · {p.projeto_origem} · uso{' '}
                        {pct(p.utilizacao_media, 1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="destino">Projeto destino (atenção ou crítico)</Label>
                <Select value={destinoId} onValueChange={setDestinoId} disabled={!pessoa}>
                  <SelectTrigger id="destino">
                    <SelectValue placeholder={pessoa ? 'Escolha o projeto' : 'Escolha a pessoa primeiro'} />
                  </SelectTrigger>
                  <SelectContent>
                    {destinos.map((p) => (
                      <SelectItem key={p.projeto_id} value={p.projeto_id}>
                        {p.projeto_id} · {p.situacao} · {CAUSAS[p.causa_principal] ?? p.causa_principal} ·{' '}
                        {num(p[campo])} dias de {pessoa ? CAUSAS[nomeDaCausa(pessoa.papel)] : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding">Horas de onboarding</Label>
                <Input
                  id="onboarding"
                  type="number"
                  min={0}
                  step={1}
                  value={horasOnboarding}
                  onChange={(e) => setHorasOnboarding(e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {conta && pessoa && destino ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {pessoa.colaborador_id} ({pessoa.projeto_origem}) → {destino.projeto_id}, no mês
            </CardTitle>
            <CardDescription>
              {pessoa.nome}, {pessoa.papel} {pessoa.senioridade}, custo de {reais(conta.custoHora)} por hora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Linha rotulo="Horas no mês" valor={horas(conta.horasMes)} />
              <Linha rotulo="Ociosidade que deixa de ser paga" valor={reaisCurto(conta.ociosidadeEvitada)} destaque="bom" />
              <Linha rotulo="Dias de cronograma recuperados" valor={dias(conta.diasRecuperados, 1)} destaque="bom" />
              <Linha rotulo="Mobilização (onboarding)" valor={`− ${reaisCurto(conta.onboarding)}`} destaque="ruim" />
              <Linha
                rotulo="Saldo no mês"
                valor={reaisCurto(conta.saldo)}
                destaque={conta.saldo >= 0 ? 'bom' : 'ruim'}
              />
            </div>

            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Como a conta é feita</summary>
              <ul className="mt-2 space-y-1 list-disc pl-5 text-muted-foreground">
                <li>
                  Horas no mês = horas paradas por semana nas últimas 12 semanas ({horas(pessoa.horas_paradas_semana, 1)})
                  × {SEMANAS_NO_MES} semanas = {horas(conta.horasMes, 1)}.
                </li>
                <li>
                  Ociosidade que deixa de ser paga = custo ocioso médio por semana ({reais(pessoa.custo_ocioso_semana)}) ×{' '}
                  {SEMANAS_NO_MES} = {reais(conta.ociosidadeEvitada)}.
                </li>
                <li>
                  Dias recuperados = dias de impacto que o status semanal de {destino.projeto_id} atribuiu a{' '}
                  {CAUSAS[nomeDaCausa(pessoa.papel)]} nos últimos {JANELA_STATUS_DIAS} dias ({dias(conta.diasImpacto)}) ÷{' '}
                  {JANELA_STATUS_DIAS} × {DIAS_NO_MES} = {dias(conta.diasRecuperados, 1)}. SRE resolve falta de SRE; os outros
                  papéis cobrem rotatividade.
                </li>
                <li>
                  Mobilização = horas de onboarding ({num(horasOnboarding)} h) × custo da hora ({reais(conta.custoHora)}) ={' '}
                  {reais(conta.onboarding)}. O custo da hora sai da gold: custo ocioso ÷ horas ociosas.
                </li>
                <li>
                  Saldo = ociosidade evitada − mobilização = {reais(conta.saldo)}. Os dias de cronograma ficam fora do saldo:
                  virar dinheiro exigiria uma premissa (multa, receita adiantada) que a gold não tem.
                </li>
              </ul>
            </details>
          </CardContent>
        </Card>
      ) : (
        !carregando &&
        !erro && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Escolha uma pessoa e um projeto</EmptyTitle>
              <EmptyDescription>
                Para SRE, os projetos que mais pedem SRE no status semanal aparecem primeiro.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
    </div>
  );
}
