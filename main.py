import discord
import asyncio
import keyring
from discord.ext import commands

# Import search engines scrapping functions
from engines.programathor import get_programathor_jobs
from engines.geekhunter import get_geekhunter_jobs
from engines.linkedin import get_linkedin_jobs

# Discord Bot definitions
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)
channel_id = 1147029744043442287

# Scrapping definitions
sent_jobs = []

async def search_jobs():
    '''
    Assynchronous function that searches for new jobs every 60 seconds and sends them to the Discord channel.
    The function searches for vacancies in the following websites:
    * ProgramaThor
    * GeekHunter
    * LinkedIn
    '''

    await bot.wait_until_ready()
    channel = bot.get_channel(channel_id)
    while not bot.is_closed():

        # ProgramaThor
        results = await get_programathor_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                sent_jobs.append(result[0])
                job_info = f'{"-"*50}\n\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCAL: {result[3]}\nSTACKS: {", ".join(result[4])}\nLINK: {result[5]}'
                await channel.send(job_info)
                await asyncio.sleep(60)
        await asyncio.sleep(60)

        # GeekHunter
        results = await get_geekhunter_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                sent_jobs.append(result[0])
                job_info = f'{"-"*50}\n\nTÍTULO DA VAGA: {result[0]}\nLOCAL: {result[1]}\nSTACKS: {result[2]}\nAREA: {result[3]}\nLINK: {result[4]}'
                await channel.send(job_info)
                await asyncio.sleep(60)
        await asyncio.sleep(60)

        # LinkedIn
        results = await get_linkedin_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                sent_jobs.append(result[0])
                job_info = f'{"-"*50}\n\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCAL: {result[3]}\nLINK: {result[4]}'
                await channel.send(job_info)
                await asyncio.sleep(60)
        await asyncio.sleep(60)
        
@bot.event
async def on_ready():
    bot.loop.create_task(search_jobs())

bot.run(keyring.get_password('bot_vagas', 'token'))