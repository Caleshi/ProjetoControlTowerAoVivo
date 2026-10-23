import { Alert, AlertDescription, AlertTitle, GenieChat } from '@databricks/appkit-ui/react';

export function PerguntarPage() {
  return (
    <div className="space-y-4 w-full max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Perguntar</h2>
        <p className="text-sm text-muted-foreground">
          Pergunte em português ao Genie “Farol · Diretoria”: quais projetos atrasam e de quais clientes, quanto custa,
          quem está parado e o que vai dar errado no próximo mês.
        </p>
      </div>

      <Alert>
        <AlertTitle>Resposta gerada por IA: confira o SQL</AlertTitle>
        <AlertDescription>
          O Genie responde em seu nome, com as suas permissões no Unity Catalog, e mostra o SQL que rodou. Os números
          oficiais da carteira vêm da métrica governada gold.mv_projetos.
        </AlertDescription>
      </Alert>

      <div className="h-[600px] rounded-md border">
        <GenieChat alias="default" placeholder="Ex.: O que vai dar errado no próximo mês, e o que eu faço agora?" />
      </div>
    </div>
  );
}
