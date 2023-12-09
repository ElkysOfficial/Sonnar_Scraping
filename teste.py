import hikari
import lightbulb
from hikari import intents
import asyncio

from engines.programathor import get_programathor_jobs
from engines.geekhunter import get_geekhunter_jobs
from engines.linkedin import get_linkedin_jobs
from engines.indeed import get_indeed_jobs

bot = hikari.GatewayBot(token="MTE0NTAxODA0ODEyNjkyMjc1NA.GCPKa9.gewm6zRpEy0eIojSh1Wg6aeCH7no9IRAuTHvOc", intents=intents.Intents.ALL)
channel_id = 1182746354611662992

sent_jobs = []

@bot.listen()
async def on_started(event: hikari.StartedEvent) -> None:
    
    # ProgramaThor
    results = await get_programathor_jobs()
    for result in results:
      if result[0] not in sent_jobs:
        sent_jobs.append(result[0])
        job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCAL: {result[3]}\nSTACKS: {", ".join(result[4])}\nLINK: {result[5]}'
        await bot.rest.create_message(channel_id, job_info)
        await asyncio.sleep(60)
    await asyncio.sleep(30)

    # GeekHunter
    results = await get_geekhunter_jobs()
    for result in results:
        if result[0] not in sent_jobs:
            sent_jobs.append(result[0])
            job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[0]}\nLOCAL: {result[1]}\nSTACKS: {result[2]}\nAREA: {result[3]}\nLINK: {result[4]}'
            await bot.rest.create_message(channel_id, job_info)
            await asyncio.sleep(60)
    await asyncio.sleep(30)

    # # LinkedIn
    # results = await get_linkedin_jobs()
    # for result in results:
    #     if result[0] not in sent_jobs:
    #         sent_jobs.append(result[0])
    #         job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCAL: {result[3]}\nLINK: {result[4]}'
    #         await bot.rest.create_message(channel_id, job_info)
    #         await asyncio.sleep(60)
    # await asyncio.sleep(30)

    # # Indeed
    # results = await get_indeed_jobs()
    # for result in results:
    #     if result[0] not in sent_jobs:
    #         sent_jobs.append(result[0])
    #         job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[3]}\nLOCAL: {result[4]}\nLINK {result[2]}'
    #         await bot.rest.create_message(channel_id, job_info)
    #         await asyncio.sleep(30)
    # await asyncio.sleep(30)

bot.run()