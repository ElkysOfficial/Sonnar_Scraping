/**
 * Funções de comunicação
 * com a API do Spider X.
 *
 * @author Dev Gui
 */
import axios from "axios";

import * as config from "../config.js";
import { getSpiderApiToken } from "../utils/database.js";

let { SPIDER_API_TOKEN, SPIDER_API_BASE_URL } = config;
let cachedSpiderToken = null;
let tokenLoaded = false;

async function resolveSpiderToken() {
  if (!tokenLoaded) {
    const token = await getSpiderApiToken();
    if (token) {
      cachedSpiderToken = token;
    }
    tokenLoaded = true;
  }
  return cachedSpiderToken || SPIDER_API_TOKEN;
}

function isTokenConfigured(token) {
  return token && token.trim() !== "" && token !== "seu_token_aqui";
}

async function requireSpiderToken() {
  const token = await resolveSpiderToken();
  if (!isTokenConfigured(token)) {
    throw new Error(messageIfTokenNotConfigured);
  }
  return token;
}

const messageIfTokenNotConfigured = `Token da API do Spider X não configurado!
      
Para configurar, entre na pasta: \`src\` 
e edite o arquivo \`config.js\`:

Procure por:

\`export const SPIDER_API_TOKEN = "seu_token_aqui";\`

ou

Use o comando:

/set-spider-api-token seu_token_aqui

Não esqueça de ver se a / é seu prefixo!

Para obter o seu token, 
crie uma conta em: https://api.spiderx.com.br
e contrate um plano!`;

export async function play(type, search) {
  if (!search) {
    throw new Error("Você precisa informar o que deseja buscar!");
  }

  const token = await requireSpiderToken();

  const { data } = await axios.get(
    `${SPIDER_API_BASE_URL}/downloads/play-${type}?search=${encodeURIComponent(
      search
    )}&api_key=${token}`
  );

  return data;
}

export async function download(type, url) {
  if (!url) {
    throw new Error("Você precisa informar uma URL do que deseja buscar!");
  }

  const token = await requireSpiderToken();

  const { data } = await axios.get(
    `${SPIDER_API_BASE_URL}/downloads/${type}?url=${encodeURIComponent(
      url
    )}&api_key=${token}`
  );

  return data;
}

export async function gemini(text) {
  if (!text) {
    throw new Error("Você precisa informar o parâmetro de texto!");
  }

  const token = await requireSpiderToken();

  const { data } = await axios.post(
    `${SPIDER_API_BASE_URL}/ai/gemini?api_key=${token}`,
    {
      text,
    }
  );

  return data.response;
}

export async function gpt5Mini(text) {
  if (!text) {
    throw new Error("Você precisa informar o parâmetro de texto!");
  }

  const token = await requireSpiderToken();

  const { data } = await axios.post(
    `${SPIDER_API_BASE_URL}/ai/gpt-5-mini?api_key=${token}`,
    {
      text,
    }
  );

  return data.response;
}

export async function attp(text) {
  if (!text) {
    throw new Error("Você precisa informar o parâmetro de texto!");
  }

  const token = await requireSpiderToken();

  return `${SPIDER_API_BASE_URL}/stickers/attp?text=${encodeURIComponent(
    text
  )}&api_key=${token}`;
}

export async function ttp(text) {
  if (!text) {
    throw new Error("Você precisa informar o parâmetro de texto!");
  }

  const token = await requireSpiderToken();

  return `${SPIDER_API_BASE_URL}/stickers/ttp?text=${encodeURIComponent(
    text
  )}&api_key=${token}`;
}

export async function search(type, search) {
  if (!search) {
    throw new Error("Você precisa informar o parâmetro de pesquisa!");
  }

  const token = await requireSpiderToken();

  const { data } = await axios.get(
    `${SPIDER_API_BASE_URL}/search/${type}?search=${encodeURIComponent(
      search
    )}&api_key=${token}`
  );

  return data;
}

export async function welcome(title, description, imageURL) {
  if (!title || !description || !imageURL) {
    throw new Error(
      "Você precisa informar o título, descrição e URL da imagem!"
    );
  }

  const token = await requireSpiderToken();

  return `${SPIDER_API_BASE_URL}/canvas/welcome?title=${encodeURIComponent(
    title
  )}&description=${encodeURIComponent(
    description
  )}&image_url=${encodeURIComponent(imageURL)}&api_key=${token}`;
}

export async function exit(title, description, imageURL) {
  if (!title || !description || !imageURL) {
    throw new Error(
      "Você precisa informar o título, descrição e URL da imagem!"
    );
  }

  const token = await requireSpiderToken();

  return `${SPIDER_API_BASE_URL}/canvas/goodbye?title=${encodeURIComponent(
    title
  )}&description=${encodeURIComponent(
    description
  )}&image_url=${encodeURIComponent(imageURL)}&api_key=${token}`;
}

export async function imageAI(description) {
  if (!description) {
    throw new Error("Você precisa informar a descrição da imagem!");
  }

  const token = await requireSpiderToken();

  const { data } = await axios.get(
    `${SPIDER_API_BASE_URL}/ai/flux?text=${encodeURIComponent(
      description
    )}&api_key=${token}`
  );

  return data;
}

export async function canvas(type, imageURL) {
  if (!imageURL) {
    throw new Error("Você precisa informar a URL da imagem!");
  }

  const token = await requireSpiderToken();

  return `${SPIDER_API_BASE_URL}/canvas/${type}?image_url=${encodeURIComponent(
    imageURL
  )}&api_key=${token}`;
}

export async function setProxy(name) {
  try {
    if (!name) {
      throw new Error("Você precisa informar o nome da nova proxy!");
    }

    const token = await requireSpiderToken();

    const { data } = await axios.post(
      `${SPIDER_API_BASE_URL}/internal/set-node-js-proxy-active?api_key=${token}`,
      {
        name,
      }
    );

    return data.success;
  } catch (error) {
    console.error("Erro ao definir a proxy:", error);
    throw new Error(
      "Não foi possível definir a proxy! Verifique se o nome está correto e tente novamente!"
    );
  }
}

export async function updatePlanUser(email, plan) {
  const token = await requireSpiderToken();

  const { data } = await axios.post(
    `${SPIDER_API_BASE_URL}/internal/update-plan-user?api_key=${token}`,
    {
      email,
      plan,
    }
  );

  return data;
}

export async function toGif(buffer) {
  if (!buffer) {
    throw new Error("Você precisa informar o buffer do arquivo!");
  }

  const token = await requireSpiderToken();

  const formData = new FormData();
  const blob = new Blob([buffer], { type: "image/webp" });
  formData.append("file", blob, "sticker.webp");

  const { data } = await axios.post(
    `${SPIDER_API_BASE_URL}/utilities/to-gif?api_key=${token}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return data.url;
}
