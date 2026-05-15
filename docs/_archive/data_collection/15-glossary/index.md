# 📖 Glossário

Termos técnicos que aparecem na documentação, em linguagem simples.

## Backoff exponencial
Quando uma request falha e o sistema vai tentar de novo, **dobra o tempo de espera a cada tentativa**. Ex.: 2s → 4s → 8s → 16s. Evita martelar um servidor que já está com problema.

## Batch / Lote
Conjunto de tarefas processadas juntas para reduzir overhead. Ex.: a engine roda 10 stacks por lote, espera 2h, roda os próximos 10.

## Bucket de tokens (token bucket)
Algoritmo para limitar taxa: imagine um balde que enche fichas a uma velocidade fixa. Cada request gasta 1 ficha. Sem ficha, espera. Garante "no máximo X requisições por segundo".

## Circuit breaker (disjuntor)
Mecanismo que **bloqueia chamadas a um serviço falhando**. Se 40% das requests a um site dão erro num período, o "disjuntor" abre e nem tenta mais por 15min. Reduz pressão e ajuda na recuperação.

## DLQ (Dead-Letter Queue)
Fila de "vagas com defeito persistente". URLs que falharam 3 vezes vão pra cá em vez de continuarem retentando. Ficam lá até alguém analisar.

## Engine
No nosso contexto, um arquivo Python que sabe extrair vagas de **um site específico**. Temos 17 engines. Veja [[ENGINES]].

## Fingerprint TLS / JA3
"Impressão digital" da forma como um cliente HTTP negocia conexão criptografada. Sites tipo Indeed/Cloudflare detectam clients suspeitos por essa impressão. Por isso usamos `curl_cffi` que **imita um Chrome real**.

## httpx
Biblioteca HTTP assíncrona moderna do Python. É o cliente padrão da nossa engine para sites que aceitam clientes "comuns".

## Idempotência
Propriedade de uma operação que pode ser executada várias vezes sem efeito colateral acumulado. Ex.: salvar a vaga URL X duas vezes = ainda só uma vaga URL X no banco.

## Jitter
**Aleatoriedade** adicionada a um intervalo de tempo. Ex.: em vez de retentar em "exatamente 4s", retenta em "4s ± 30%". Evita que muitos clientes tentem tudo ao mesmo tempo (efeito manada).

## JSON-LD
Forma estruturada de dados embutida em páginas HTML, padrão schema.org. Sites de vagas geralmente colocam um `<script type="application/ld+json">` com objeto `JobPosting` contendo descrição, salário, regime, etc. É a fonte mais confiável de dados.

## Listing
A página de **resultados de busca** (lista de cards). Contraposto ao "detail" (página individual de cada vaga).

## Parser
Código que **extrai informação de um formato bruto** (HTML, JSON, XML) e devolve uma estrutura limpa. Cada engine tem seu parser para o formato específico do site.

## Parser version
Constante `PARSER_VERSION` em cada engine, ex.: `"linkedin-2026.05.07"`. Quando você melhora o parser, **bumpe** a versão. O sistema usa isso para **reprocessar automaticamente** vagas antigas. Veja [[CHECKPOINT_AND_DLQ#Reenrichment automático]].

## Payload
Dados enviados ou recebidos numa requisição. Ex.: "payload da vaga" = dict com título, empresa, descrição, etc.

## Playwright
Ferramenta para automatizar **navegadores reais** (Chromium). Usada como último recurso quando até `curl_cffi` falha. Cara em RAM/CPU.

## Policy (no nosso código)
Conjunto unificado de **rate-limit + retry + circuit breaker** aplicado a todas as chamadas HTTP. O wrapper `fetch()` aplica a "policy" automaticamente.

## Quarentena
Período em que um domínio com circuit aberto **não recebe nenhuma request**. Default: 15min na primeira abertura, dobra a cada nova abertura, cap em 2h.

## Rate-limit
Limite de "X requisições por segundo (ou minuto)". Tanto pode ser um limite **que nós impomos a nós mesmos** (para não sermos bloqueados), quanto um limite **que o site nos impõe** (e responde 429 quando ultrapassamos).

## Reenrichment
Processo de **reprocessar** vagas que foram salvas mas com dados incompletos (descrição vazia, regime errado), tipicamente após melhorar o parser. Ver [[CHECKPOINT_AND_DLQ]].

## Retry
**Tentar de novo** uma operação que falhou.

## RPC (Remote Procedure Call)
No contexto Supabase: funções SQL que rodam no banco e podem ser invocadas pelo cliente. Usamos RPCs para servir dados ao dashboard sem expor as tabelas brutas.

## Schema.org
Vocabulário padronizado para descrever dados estruturados na web. `JobPosting` é o tipo schema.org para vagas, e o JSON-LD que extraímos das páginas segue esse padrão.

## Seed
Os **dados básicos** de uma vaga extraídos do listing (URL, título, empresa). Usamos como ponto de partida antes de buscar a página de detalhe e enriquecer com mais campos.

## Sinks (sinks de persistência)
Os **destinos** onde gravamos os dados. Temos 3: JSON local, CSV append-only, tabela do Supabase. Salvar em sinks múltiplos = redundância (se um cair, os outros têm a vaga).

## Stack
No projeto Sonnar, uma "tecnologia" alvo de busca: Python, Java, JavaScript, etc. Cada engine roda contra cada stack ativa.

## Streaming (no contexto da engine)
Em vez de a engine devolver toda a lista no fim, ela **invoca um callback a cada vaga** assim que parsear. Garante que uma queda no meio não perde tudo.

## Token (no contexto Supabase)
Chave de autenticação. Temos 2: `anon key` (frontend, sujeito a RLS) e `service role key` (backend, bypassa RLS). **Nunca exponha o service role no frontend.**

## TTL (Time-to-live)
Tempo de validade de algo. Ex.: cache com TTL=5min expira após 5 minutos.

## Worker
Um **processo** que executa trabalho. Hoje a engine roda como 1 worker. Em arquiteturas escaladas, você pode ter múltiplos workers consumindo da mesma fila com `SELECT FOR UPDATE SKIP LOCKED`.

## 429
Código HTTP "Too Many Requests". Indica que o site recebeu requisições demais e está nos pedindo para diminuir.

## 5xx
Códigos HTTP de **erro do servidor** (500, 502, 503, 504). Tipicamente temporários — vale retry.
