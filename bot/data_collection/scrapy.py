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
    asyncio.run(main())
