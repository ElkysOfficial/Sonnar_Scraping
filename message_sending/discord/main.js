const Discord = require('discord.js');
const {GatewayIntentBits} = Discord
const token = 'MTE0NTAxODA0ODEyNjkyMjc1NA.GH8p2Y.lYjjNlVboexlZPfKmuhCkOBy0ypwNKXnG5fXFQ';
const channelId = '1182746354611662992';

const client = new Discord.Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function fetchAndSendEmbeds() {
  try {

    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;

    const response = await fetch('http://localhost:3000/embeds');
    if (!response.ok) {
      throw new Error(`Erro ao buscar embeds: ${response.status} ${response.statusText}`);
    }
    const embeds = await response.json(); 

    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error(`Canal não encontrado com o ID: ${channelId}`);
      return;
    }

    for (const embedData of embeds) {
      await channel.send({ embeds: [embedData] }); 
      await new Promise(resolve => setTimeout(resolve, 60000)); 
    }
  } catch (error) {
    console.error('Erro ao buscar ou enviar embeds:', error);
  }
}

client.on('ready', async () => {
  console.log(`Logado como ${client.user.tag}!`);

  while (true) {
    await fetchAndSendEmbeds();
  }

});

client.login(token);
