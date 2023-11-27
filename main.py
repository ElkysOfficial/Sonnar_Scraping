import discord
import asyncio
import keyring
from discord.ext import commands

# Import search engines scrapping functions
from engines.programathor import get_programathor_jobs

# Discord Bot definitions
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)
channel_id = 1147029744043442287

# Scrapping definitions
sent_jobs = []

async def search_jobs():
    '''
    DOCSTRING
    '''

    await bot.wait_until_ready()
    channel = bot.get_channel(channel_id)
    while not bot.is_closed():

        # ProgramaThor
        results_programathor = await get_programathor_jobs()
        for resultado in results_programathor:
            if resultado[0] not in sent_jobs:
                sent_jobs.append(resultado[0])
                job_info = f'{"-"*100}\n\nTÍTULO DA VAGA: {resultado[1]}\nEMPRESA: {resultado[2]}\nLOCAL: {resultado[3]}\nSTACKS: {", ".join(resultado[4])}\nLINK: {resultado[5]}'
                await channel.send(job_info)
                await asyncio.sleep(60)
        await asyncio.sleep(60)
        
@bot.event
async def on_ready():
    bot.loop.create_task(search_jobs())

bot.run(keyring.get_password('discord', 'token'))