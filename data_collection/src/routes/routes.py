import requests

async def send_to_embed_service_job(job_data):
    try:
        response = requests.post('http://localhost:3000/embeds/jobs', json=job_data, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Erro ao enviar para o serviço de embed: {e}")
        return None
