import keyring
import hikari
from hikari import intents
import asyncio

from engines.geekhunter import get_geekhunter_jobs
from engines.gupy import get_gupy_jobs
from engines.indeed import get_indeed_jobs
from engines.infojobs import get_infojobs_jobs
from engines.linkedin import get_linkedin_jobs
from engines.programathor import get_programathor_jobs

token = keyring.get_password('bot_vagas', 'token')
channel_id = keyring.get_password('bot_vagas', 'channel')
sent_jobs = []

bot = hikari.GatewayBot(token, intents=intents.Intents.ALL)
@bot.listen()

async def on_started(event: hikari.StartedEvent) -> None:
    '''
    Assynchronous function that searches for new jobs every 60 seconds and sends them to the Discord channel.
    The function searches for vacancies in the following websites:
    * GeekHunter
    * Gupy
    * Indeed
    * InfoJobs
    * LinkedIn
    * ProgramaThor
    '''
 
    # GeekHunter
    results = await get_geekhunter_jobs()
    for result in results:
        if result[4] not in sent_jobs:
            sent_jobs.append(result[4])
            job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[0]}\nLOCALIDADE: {result[1]}\nSTACKS: {result[2]}\nAREA: {result[3]}\nLINK: {result[4]}'
            await bot.rest.create_message(channel_id, job_info)
            await asyncio.sleep(5)
    await asyncio.sleep(30)

    # ProgramaThor
    results = await get_programathor_jobs()
    for result in results:
      if result[0] not in sent_jobs:
        sent_jobs.append(result[0])
        job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nSTACKS: {", ".join(result[4])}\nLINK: {result[5]}'
        await bot.rest.create_message(channel_id, job_info)
        await asyncio.sleep(5)
    await asyncio.sleep(30)

    # LinkedIn
    results = await get_linkedin_jobs()
    for result in results:
        if result[0] not in sent_jobs:
            sent_jobs.append(result[0])
            job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nLINK: {result[4]}'
            await bot.rest.create_message(channel_id, job_info)
            await asyncio.sleep(5)
    await asyncio.sleep(30)

    # Indeed
    results = await get_indeed_jobs()
    for result in results:
        if result[0] not in sent_jobs:
            sent_jobs.append(result[0])
            job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[3]}\nLOCALIDADE: {result[4]}\nLINK {result[2]}'
            await bot.rest.create_message(channel_id, job_info)
            await asyncio.sleep(5)
    await asyncio.sleep(30)\
    
    # Gupy
    results = await get_gupy_jobs()
    for result in results:
        if result[0] not in sent_jobs:
            sent_jobs.append(result[0])
            job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nLINK {result[4]}'
            await bot.rest.create_message(channel_id, job_info)
            await asyncio.sleep(5)
    await asyncio.sleep(30)

    # InfoJobs
    results = await get_infojobs_jobs()
    for result in results:
        if result[0] not in sent_jobs:
            sent_jobs.append(result[0])
            job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nMODALIDADE: {result[4]}\nLINK: {result[5]}'
            await bot.rest.create_message(channel_id, job_info)
            await asyncio.sleep(5)
    await asyncio.sleep(30)

bot.run()