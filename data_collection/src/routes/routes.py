import os
import requests

CORE_BASE_URL = os.getenv("MESSAGE_FORMATTING_CORE_URL", "http://localhost:3100")

async def send_to_embed_service_job(job_data):
    try:
        response = requests.post(f"{CORE_BASE_URL}/jobs", json=job_data, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Erro ao enviar para o serviço de embed: {e}")
        return None
