import asyncio
from dotenv import load_dotenv

load_dotenv()  # carrega .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

from src.controllers.controllers import scrape_jobs

async def main():
    """Função principal assíncrona para executar o scraping."""
    scraping_task = asyncio.create_task(scrape_jobs())

    # Aguarde a conclusão da tarefa de scraping antes de encerrar o programa
    await scraping_task

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        # PM2 stop/restart envia SIGINT — encerramento esperado, nao e erro.
        # Sem este catch, o KeyboardInterrupt vazava como traceback gigante
        # no log de erro do PM2 a cada parada do servico.
        print("scraper encerrado.")
