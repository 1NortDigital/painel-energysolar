# Setup do fluxo n8n — Kommo → Painel (GitHub Pages)

Importe **`n8n-workflow.json`** no n8n (menu → Import from File) e siga abaixo.
O fluxo roda de hora em hora: busca todos os leads do Kommo (com paginação),
normaliza pro formato do painel e faz commit do `leads.json` no seu repositório.

---

## 1. Variáveis (n8n → Settings → Variables)

Crie estas 5 variáveis. Assim os tokens não ficam espalhados nos nós.

| Variável | Valor | Onde pegar |
|---|---|---|
| `KOMMO_SUBDOMAIN` | `energysolar` | é o subdomínio da conta (energysolar.kommo.com) |
| `KOMMO_TOKEN` | token longa duração | Kommo → Configurações → Integrações → crie uma integração privada e gere o **token de longa duração** |
| `GH_OWNER` | seu usuário/org GitHub | ex.: `matheus1nort` |
| `GH_REPO` | nome do repo do painel | ex.: `painel-energysolar` |
| `GH_BRANCH` | `main` | branch onde o Pages publica |
| `GH_TOKEN` | Personal Access Token | GitHub → Settings → Developer settings → **Fine-grained token** com permissão **Contents: Read and write** só nesse repo |

> Se sua versão do n8n não tiver Variables, troque `{{ $vars.XXX }}` por
> credenciais/valores fixos direto nos nós HTTP.

---

## 2. Mapear os custom fields (nó "5. Normalizar")

O nó de normalização mapeia os campos **pelo NOME** que aparece no Kommo —
não pelo ID. Abra o Code node "5. Normalizar → base64" e confira o `FIELD_MAP`
e o `DATE_MAP` no topo. Se algum campo tiver nome diferente no CRM, ajuste ali:

```js
const FIELD_MAP = {
  'Origem': 'origin',
  'Produto': 'product',
  'Método de pagamento': 'payment',
  // ... nome EXATO no Kommo à esquerda, chave do painel à direita
};
```

**Ganho / perdido:** ajuste `WON_STAGE_IDS` e `LOST_STAGE_IDS` com os IDs reais
dos estágios de fechamento. Para descobrir os IDs:
`GET https://SUBDOMINIO.kommo.com/api/v4/leads/pipelines` (com o Bearer token) —
lista pipelines e seus `statuses` com `id` e `name`.

---

## 3. Como o fluxo funciona (para você entender/depurar)

1. **Cron** dispara de hora em hora.
2. **Init** define `page=1`.
3. **Kommo — busca página** faz `GET /api/v4/leads?with=contacts&limit=250&page=N`.
4. **Acumula** junta os leads e checa `_links.next`.
5. **Tem próxima?** → se sim, volta pro passo 3 (paginação); se não, segue.
6. **Normalizar** converte tudo pro schema do painel e gera **base64**.
7. **GitHub — sha atual** pega o SHA do `leads.json` existente (necessário p/ update).
8. **Commit** faz `PUT` na Contents API → novo `leads.json` no repo.
9. GitHub Pages republica sozinho em ~1 min.

> **Custom fields na listagem:** dependendo da conta, o `GET /leads` pode não
> trazer `custom_fields_values` sem o parâmetro certo. Se vier vazio, adicione
> `with=custom_fields_values` na query do nó 3 (alguns tenants usam
> `with=contacts,custom_fields`). Teste com 1 lead primeiro (passo 4).

---

## 4. Testar antes de automatizar

1. Desligue o Cron (desative o nó) e rode o fluxo manual (**Execute Workflow**).
2. No nó **5. Normalizar**, veja o output: confira `totalLeads` e abra 1 item
   pra checar se `origin`, `value`, `status` e `fields.local` vieram certos.
3. Se algo vier `null` que não deveria: o nome no `FIELD_MAP` não bate com o
   Kommo — corrija o nome exato.
4. Rode até o fim uma vez. Confira no GitHub que o `leads.json` foi commitado.
5. Abra o painel no Pages — deve refletir os dados reais.
6. Reative o Cron.

---

## 5. Pontos de atenção

- **Rate limit do Kommo:** ~7 req/s. Com `limit=250` e poucos milhares de leads,
  são poucas páginas — tranquilo. Se tiver dezenas de milhares, aumente o
  intervalo do Cron.
- **Histórico de commits:** cada execução gera 1 commit. Se incomodar, depois
  migramos pra Cloudflare R2 (sem commit) — o painel só troca a URL do `fetch`.
- **Dados sensíveis:** o `leads.json` fica público no repo (nomes, valores,
  telefones). Se for sensível, me avisa que a gente protege (repo privado +
  outro método de servir, ou token na URL).
- **Fuso:** o painel usa a hora local do navegador pro heatmap. Os timestamps
  do Kommo (`created_at`) são epoch UTC — o `new Date(unix*1000)` converte certo.

---

## ✅ CONFIRMADO com os dados reais (Energy Solar RJ)

Este setup já foi ajustado ao Kommo real deste cliente:

- **Ganho/perdido:** `142` (ganho) e `143` (perdido) em TODOS os pipelines — já cravado.
- **Campos custom reais mapeados:** Origem, Produto, Consumo [R$], Local,
  Aumentar Consumo, utm_campaign/source/medium. (Não existem "Método de
  pagamento", "Tipo de cliente", "Endereço", "Consultor" — foram removidos do
  mapa efetivo; se criar depois, o FIELD_MAP já está pronto pra eles.)
- **Proposta/Visita por STAGE** (Funil de vendas), não só por custom field:
  - Proposta: proposta agendada (91219187), Proposta apresentada (95677371),
    negociação (91219211), visita agendada (91219203) e adiante.
  - Visita: visita agendada (91219203), negociação (91219211) e adiante.

### ⚠️ Sobre o valor do negócio (receita/ticket)
No lead de exemplo o `price` estava 0. Para a **Receita ganha** e o **Ticket
médio** do painel ficarem corretos, o campo de valor do lead (preço nativo do
Kommo) precisa estar preenchido nos leads GANHOS. Se o valor da venda mora num
custom field em vez do preço nativo, me avise para apontar o mapeamento pra lá.
