import asyncio
from dotenv import load_dotenv

load_dotenv()  # carrega .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# uvloop: event loop em C que substitui o default do asyncio. Speedup
# tipico de 20-30% em codigo I/O-bound (todo o scraper). Disponivel apenas
# em Linux/macOS — em Windows (dev) cai gracilmente no asyncio default.
try:
    import uvloop
    uvloop.install()
except ImportError:
    pass

from src.controllers.controllers import scrape_jobs


def _silenciar_cancelamento(loop, context):
    """Handler de excecao do loop asyncio.

    O PM2 para o scraper com SIGINT, o que cancela as tasks de fundo
    (metrics, tracker, core-flush). O CancelledError resultante e
    encerramento esperado, nao erro — sem este filtro o asyncio loga um
    traceback gigante no shutdown. Qualquer outra excecao segue normal
    para o handler padrao.
    """
    exc = context.get("exception")
    if isinstance(exc, asyncio.CancelledError):
        return
    loop.default_exception_handler(context)


async def main():
    """Função principal assíncrona para executar o scraping."""
    asyncio.get_running_loop().set_exception_handler(_silenciar_cancelamento)
    scraping_task = asyncio.create_task(scrape_jobs())

    # Aguarde a conclusão da tarefa de scraping antes de encerrar o programa
    await scraping_task

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        # PM2 stop/restart envia SIGINT — encerramento esperado, nao e erro.
        # Sem este catch, o KeyboardInterrupt/CancelledError vazava como
        # traceback gigante no log de erro do PM2 a cada parada do servico.
        print("scraper encerrado.")
