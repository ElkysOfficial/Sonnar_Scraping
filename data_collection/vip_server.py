"""
Servidor HTTP para busca VIP de vagas.
Recebe requisições do WhatsApp bot e retorna vagas personalizadas.

DINÂMICO: Detecta automaticamente todas as engines na pasta /engines/

Porta padrão: 3001

Endpoints:
  POST /vip/search - Busca vagas para keywords específicas
  GET /vip/health - Health check
  GET /vip/engines - Lista engines disponíveis

@author Sonar Bot
"""
import asyncio
import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

# Importa o serviço de busca VIP
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.controllers.vip_search import search_vip_jobs, list_available_engines

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Porta do servidor
PORT = 3001


class VIPSearchHandler(BaseHTTPRequestHandler):
    """Handler para requisições de busca VIP."""

    def _set_headers(self, status_code=200, content_type='application/json'):
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _send_json(self, data, status_code=200):
        self._set_headers(status_code)
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self._set_headers(200)

    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/vip/health':
            engines = list_available_engines()
            self._send_json({
                'status': 'ok',
                'service': 'VIP Job Search (Dynamic)',
                'port': PORT,
                'engines_count': len(engines),
                'engines': engines
            })
        elif parsed_path.path == '/vip/engines':
            engines = list_available_engines()
            self._send_json({
                'success': True,
                'total_engines': len(engines),
                'engines': engines,
                'message': f'{len(engines)} engines disponíveis para busca VIP'
            })
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/vip/search':
            self._handle_vip_search()
        else:
            self._send_json({'error': 'Not found'}, 404)

    def _handle_vip_search(self):
        """
        Processa requisição de busca VIP.

        Espera JSON no body:
        {
            "keywords": ["estágio", "frontend"],
            "max_results": 20,
            "client_id": "123456789@lid"
        }
        """
        try:
            # Lê o body da requisição
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            keywords = data.get('keywords', [])
            max_results = data.get('max_results', 20)
            client_id = data.get('client_id', 'unknown')

            if not keywords:
                self._send_json({
                    'success': False,
                    'error': 'Keywords são obrigatórias'
                }, 400)
                return

            logger.info(f"[VIP SEARCH] Requisição recebida - Cliente: {client_id}, Keywords: {keywords}")

            # Executa a busca de forma assíncrona
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            try:
                jobs = loop.run_until_complete(search_vip_jobs(keywords, max_results))
            finally:
                loop.close()

            logger.info(f"[VIP SEARCH] Busca concluída - {len(jobs)} vagas encontradas")

            self._send_json({
                'success': True,
                'client_id': client_id,
                'keywords': keywords,
                'total_jobs': len(jobs),
                'jobs': jobs
            })

        except json.JSONDecodeError:
            self._send_json({
                'success': False,
                'error': 'JSON inválido'
            }, 400)
        except Exception as e:
            logger.error(f"[VIP SEARCH] Erro: {e}")
            self._send_json({
                'success': False,
                'error': str(e)
            }, 500)

    def log_message(self, format, *args):
        """Sobrescreve para usar nosso logger."""
        logger.info(f"{self.address_string()} - {format % args}")


def run_server():
    """Inicia o servidor HTTP."""
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, VIPSearchHandler)

    # Descobre engines disponíveis
    engines = list_available_engines()

    logger.info("=" * 50)
    logger.info("   VIP JOB SEARCH SERVER (DINÂMICO)")
    logger.info("=" * 50)
    logger.info(f"   Porta: {PORT}")
    logger.info(f"   Engines disponíveis: {len(engines)}")
    for engine in engines:
        logger.info(f"     - {engine}")
    logger.info(f"   Endpoints:")
    logger.info(f"     POST /vip/search  - Busca vagas VIP")
    logger.info(f"     GET  /vip/health  - Health check")
    logger.info(f"     GET  /vip/engines - Lista engines")
    logger.info("=" * 50)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Servidor encerrado.")
        httpd.shutdown()


if __name__ == "__main__":
    run_server()
