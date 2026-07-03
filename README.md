# 1Nort — Painel Comercial (Energy Solar RJ)

Dashboard comercial com a identidade da **1Nort** (dark + âmbar), reconstruído
para rodar 100% estático no **GitHub Pages** — sem servidor, sem build.
Toda a filtragem e os cálculos acontecem no navegador.

---

## 🚀 Publicar no GitHub Pages (passo a passo)

1. Crie um repositório novo no GitHub (ex.: `painel-energysolar`).
2. Suba **todos os arquivos desta pasta** para a branch `main`:
   ```bash
   git init
   git add .
   git commit -m "Painel comercial 1Nort"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/painel-energysolar.git
   git push -u origin main
   ```
3. No GitHub, vá em **Settings → Pages**.
4. Em **Build and deployment → Source**, escolha **GitHub Actions**.
5. Pronto. O workflow (`.github/workflows/deploy.yml`) publica sozinho.
   Em ~1 min o painel fica no ar em:
   `https://SEU_USUARIO.github.io/painel-energysolar/`

> Não precisa configurar mais nada. A cada `git push` na `main`, republica.

### Testar localmente antes
Como usa módulos ES, precisa de um servidor local (não abra o `index.html`
direto no navegador via `file://`):
```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

---

## 🔌 Plugar os dados REAIS do Kommo

Hoje o painel lê **`leads.json`** — dados de demonstração. Para usar os dados
reais do cliente, você substitui esse arquivo. O formato de cada lead:

```json
{
  "id": 48640000,
  "name": "Nome do lead",
  "pipelineId": 11845336,
  "stageId": 202,
  "status": "won",              // "open" | "won" | "lost"
  "origin": "[Meta] Whatsapp",
  "product": "Residencial",
  "value": 22000,               // R$, ou null
  "createdAt": "2026-06-28T13:27:00.000Z",
  "updatedAt": "2026-06-28T13:27:00.000Z",
  "utmCampaign": "1N - RESIDENCIAL ENGAJAMENTO",
  "proposalAt": "2026-06-28T13:27:00.000Z",
  "visitAt": "2026-06-28T13:27:00.000Z",
  "rescueAt": null,
  "lossReason": null,
  "fields": {
    "payment": "A vista",
    "clientType": "Individual",
    "consumo": "1.110,00",
    "local": "MARICÁ",
    "telhado": "COLONIAL",
    "endereco": "Rua ...",
    "consultor": "LUAN E EVERTON"
  }
}
```

### Como gerar esse JSON do Kommo (você tem o acesso)

Duas opções:

**A) Script Node que puxa da API v4 do Kommo** (recomendado — repetível):
- Endpoint: `GET https://energysolar.kommo.com/api/v4/leads?with=custom_fields,contacts&limit=250`
- Pagine com `page=` até acabar.
- Mapeie os `custom_fields_values` (pelos IDs dos campos que **você** criou:
  Origem, Produto, Consumo, Local, Telhado, Agendamentos…) para as chaves
  do `fields` acima.
- `stageId` vem de `status_id`; `pipelineId` de `pipeline_id`.
- `status`: `won` se stage for "ganho", `lost` se "perdido", senão `open`.
- Salve o array como `leads.json` e faça `git push`.

**B) Exportação manual + conversão**: exporte os leads do Kommo em CSV/planilha
e converta pro JSON acima (posso te montar o conversor).

### Identidade / cliente
Ajuste nome do cliente, pipelines e campos em **`app.js`** (topo do arquivo:
`CLIENT`, `PIPELINES`, `ORIGINS`, `PRODUCTS`, `PROFILE_FIELDS`).

---

## 📁 Estrutura

```
index.html      entrypoint (carrega fontes + módulos)
styles.css      identidade visual 1Nort (dark + âmbar)
app.js          config do cliente + agregação (KPIs, forecast, heatmap…)
render.js       monta o DOM e reage aos filtros
leads.json      >>> TROQUE PELO EXPORT REAL DO KOMMO <<<
.github/workflows/deploy.yml   deploy automático
```

---

## O que este painel tem (paridade + melhorias sobre o original)

- 5 KPIs com variação vs período anterior
- Receita ganha / mês (área + linha média)
- Evolução leads × propostas × fechamentos
- Projeção 3 meses (forecast por origem)
- Desempenho por campanha (UTM)
- Perfil do cliente (produto, pagamento, tipo, telhado)
- Visão geral dos 5 funis
- Heatmap dia × hora de chegada de leads
- "Quem agir" (buckets de estagnação + fila de prioridade)
- Explorador com busca, filtros e link direto pro Kommo

Tudo com a marca 1Nort, tema escuro, e rodando no navegador.
