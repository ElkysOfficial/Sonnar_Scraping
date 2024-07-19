import keyring
import hikari
from hikari import intents
import asyncio
import csv

from engines.catho import get_catho_jobs
from engines.geekhunter import get_geekhunter_jobs
from engines.gupy import get_gupy_jobs
from engines.hipsters import get_hipsters_jobs
from engines.indeed import get_indeed_jobs
from engines.infojobs import get_infojobs_jobs
from engines.linkedin import get_linkedin_jobs
from engines.programathor import get_programathor_jobs
from engines.remoteok import get_remoteok_jobs
from engines.vagas import get_vagas_jobs

token = keyring.get_password('discord', 'token')
channel_id = keyring.get_password('discord', 'server-vagas')

try:
    with open ('job_vacancies.csv', 'r', newline='', encoding='utf-8') as f:
        csv_reader = csv.reader(f)
        sent_jobs = set(row[0] for row in csv_reader)
except FileNotFoundError:
    sent_jobs = set()

bot = hikari.GatewayBot(token, intents=intents.Intents.ALL)

@bot.listen()
async def on_started(event: hikari.StartedEvent) -> None:
    '''
    Assynchronous function that searches for new jobs every 60 seconds and sends them to the Discord channel.
    The function searches for vacancies in the following websites:
    * Catho
    * GeekHunter
    * Gupy
    * Hipsters
    * Indeed
    * InfoJobs
    * LinkedIn
    * ProgramaThor
    * RemoteOK
    * Vagas
    * 
    '''
    
    # Catho
    try:
        print('Iniciando buscas em Catho...')
        results = await get_catho_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLINK {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas na Catho: {e}')
        await asyncio.sleep(60)

    # GeekHunter
    try:
        print('Iniciando buscas em GeekHunter...')
        results = await get_geekhunter_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nLOCALIDADE: {result[2]}\nSTACKS: {result[3]}\nAREA: {result[4]}\nLINK: {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas na GeekHunter: {e}')
        await asyncio.sleep(60)

    # Gupy
    try:
        print('Iniciando buscas em Gupy...')
        results = await get_gupy_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nLINK {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas na Gupy: {e}')
        await asyncio.sleep(60)

    # Hipsters
    try:
        print('Iniciando buscas em Hipsters...')
        results = await get_hipsters_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nREGIME: {result[2]}\nEMPRESA: {result[3]}\nLOCALIDADE: {result[4]}\nLINK: {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas na Hipsters: {e}')
        await asyncio.sleep(60)

    # Indeed
    try:
        print('Iniciando buscas em Indeed...')
        results = await get_indeed_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nLINK {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas no Indeed: {e}')
        await asyncio.sleep(60)
 
    # InfoJobs
    try:
        print('Iniciando buscas em InfoJobs...')
        results = await get_infojobs_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nMODALIDADE: {result[4]}\nLINK: {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas no InfoJobs: {e}')
        await asyncio.sleep(60)

    # LinkedIn
    try:
        print('Iniciando buscas no LinkedIn...')
        results = await get_linkedin_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nLINK: {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas no LinkedIn: {e}')
        await asyncio.sleep(60)

    # ProgramaThor
    try:
        print('Iniciando buscas no ProgramaThor...')
        results = await get_programathor_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nSTACKS: {", ".join(result[4])}\nLINK: {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas no ProgramaThor: {e}')
        await asyncio.sleep(60)

    # RemoteOK
    try:
        print('Iniciando buscas no RemoteOK...')
        results = await get_remoteok_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nLOCALIDADE: {result[3]}\nSTACKS: {result[4]}\nLINK: {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas no RemoteOK: {e}')
        await asyncio.sleep(60)

    # Vagas
    try:
        print('Iniciando buscas no Vagas...')
        results = await get_vagas_jobs()
        for result in results:
            if result[0] not in sent_jobs:
                with open ('job_vacancies.csv', 'a+', newline='', encoding='utf-8') as f:
                    csv_writer = csv.writer(f)
                    sent_jobs.add(result[0])
                    csv_writer.writerow(result)
                job_info = f'{"-"*50}\nTÍTULO DA VAGA: {result[1]}\nEMPRESA: {result[2]}\nSENIORIDADE: {result[3]}\nLOCALIDADE: {result[4]}\nLINK {result[0]}'
                await bot.rest.create_message(channel_id, job_info)
                await asyncio.sleep(10)
        await asyncio.sleep(60)
    except Exception as e:
        print(f'Erro ao buscar vagas no Vagas: {e}')
        await asyncio.sleep(60)

bot.run()