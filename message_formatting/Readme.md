# Microserviço `message_formatting `

Este microserviço é responsável por formatar mensagens para serem enviadas em um bot do Discord, com foco principal na criação e manipulação de embeds.

### Funcionalidades:

-   **Criação de Embeds:** Gera embeds ricos e personalizados a partir de dados de vagas de emprego, utilizando a classe Job (ou Embed) para representar a estrutura das mensagens.

-   **Armazenamento de Embeds:** Utiliza um arquivo embeds.json para armazenar dados de embeds, permitindo a persistência e o gerenciamento das mensagens formatadas.

-   **Atualização de Embeds:** Permite a atualização do status de envio dos embeds, indicando se já foram enviados para o Discord.

-   **Monitoramento de Arquivos:** Monitora o arquivo embeds.json em busca de alterações(buscando manter ele atualizado em tempo real), recarregando os dados automaticamente quando necessário.

-   **Comandos Slash (desenvolvimento):** Suporte à implementação de comandos slash para interagir com o bot e controlar a formatação das mensagens.

### Estrutura do Projeto:

-   **Commands:** Contém os comandos, incluindo os slash commands, que provavelmente definem a estrutura e o conteúdo das mensagens.

-   **Controllers:** Responsável pela lógica de controle e manipulação dos dados relacionados à formatação das mensagens.

-   **Data:** Armazena dados estáticos, como o arquivo embeds.json, que pode conter templates ou informações para a formatação.

-   **Models:** Define os modelos de dados ou classes auxiliares, como a classe Job (ou Embed), que representam a estrutura das mensagens.

-   **Routes:** Configura as rotas da API para interagir com o microserviço e solicitar a formatação de mensagens.

-   **Utils:** Contém funções utilitárias reutilizáveis, como embedUtils.ts, que provavelmente auxilia na formatação dos embeds.

### Como utilizar:

**Configurar o ambiente:**

Certifique-se de ter o Node.js e o npm instalados.
Crie um arquivo .env na raiz do projeto e defina as seguintes variáveis de ambiente:

```
DISCORD_TOKEN: O token do seu bot Discord.
DISCORD_CHANNEL_ID: O ID do canal onde as mensagens serão enviadas.
```

**Instalar as dependências:**

Execute npm install na raiz do projeto para instalar todas as dependências listadas no arquivo package.json.

**Compilar o código:**

Execute npm run build para compilar o código TypeScript para JavaScript, gerando os arquivos na pasta dist.

**Iniciar o servidor:**

Execute node dist/server.js para iniciar o servidor da API.

**Interagir com a API:**

Utilize as rotas definidas em routes.ts para criar, obter e atualizar embeds.
