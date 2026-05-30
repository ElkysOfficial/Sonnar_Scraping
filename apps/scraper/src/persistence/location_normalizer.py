"""
Normaliza strings de localidade para (state_code, country_code).

state_code   → UF brasileira ('SP', 'RJ'...) ou None
country_code → ISO-3166 alpha-2 ('BR', 'US', 'PT'...) ou None

Regras:
  - "Sao Paulo - SP"             → ('SP', 'BR')
  - "Rio de Janeiro, RJ, Brasil" → ('RJ', 'BR')
  - "Lisboa, Portugal"           → (None, 'PT')
  - "Remote"                     → (None, None)
  - ""                           → (None, None)
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional, Tuple


BR_STATES = {
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
    'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
    'SP', 'SE', 'TO',
}

# Estados/territórios US (ISO 3166-2:US, sem prefixo)
US_STATES = {
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
    'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
    'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
    'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
    'WI', 'WY', 'DC', 'PR',
}

# Nome por extenso -> sigla US (JSON-LD do Dice frequentemente entrega
# addressRegion como "New York" em vez de "NY"). Chaves em lowercase
# sem acentos para casar com a saida de _normalize().
US_STATE_NAMES = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
    'puerto rico': 'PR',
}

# Nome em portugues -> UF (para casos sem sigla explicita)
BR_STATE_NAMES = {
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
    'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
    'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
    'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
    'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO',
    'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
    'sergipe': 'SE', 'tocantins': 'TO',
}

# Pais (em PT/EN/local) -> ISO-3166 alpha-2
COUNTRY_NAMES = {
    'brasil': 'BR', 'brazil': 'BR',
    'estados unidos': 'US', 'united states': 'US', 'eua': 'US', 'usa': 'US', 'us': 'US',
    'reino unido': 'GB', 'united kingdom': 'GB', 'uk': 'GB', 'inglaterra': 'GB', 'england': 'GB',
    'portugal': 'PT',
    'espanha': 'ES', 'spain': 'ES',
    'franca': 'FR', 'france': 'FR',
    'alemanha': 'DE', 'germany': 'DE', 'deutschland': 'DE',
    'italia': 'IT', 'italy': 'IT',
    'holanda': 'NL', 'paises baixos': 'NL', 'netherlands': 'NL',
    'irlanda': 'IE', 'ireland': 'IE',
    'canada': 'CA',
    'mexico': 'MX',
    'argentina': 'AR',
    'chile': 'CL',
    'colombia': 'CO',
    'uruguai': 'UY', 'uruguay': 'UY',
    'paraguai': 'PY', 'paraguay': 'PY',
    'peru': 'PE',
    'venezuela': 'VE',
    'australia': 'AU',
    'nova zelandia': 'NZ', 'new zealand': 'NZ',
    'india': 'IN',
    'japao': 'JP', 'japan': 'JP',
    'china': 'CN',
    'coreia do sul': 'KR', 'south korea': 'KR', 'korea': 'KR',
    'israel': 'IL',
    'singapura': 'SG', 'singapore': 'SG',
    'emirados arabes': 'AE', 'uae': 'AE',
    'arabia saudita': 'SA',
    'africa do sul': 'ZA', 'south africa': 'ZA',
    'belgica': 'BE', 'belgium': 'BE',
    'suica': 'CH', 'switzerland': 'CH',
    'suecia': 'SE', 'sweden': 'SE',
    'noruega': 'NO', 'norway': 'NO',
    'dinamarca': 'DK', 'denmark': 'DK',
    'finlandia': 'FI', 'finland': 'FI',
    'polonia': 'PL', 'poland': 'PL',
    'austria': 'AT',
    'grecia': 'GR', 'greece': 'GR',
    'turquia': 'TR', 'turkey': 'TR',
    'russia': 'RU',
    'ucrania': 'UA', 'ukraine': 'UA',
    'romenia': 'RO', 'romania': 'RO',  # ROU pais - colide com sigla RO de Rondonia, tratado abaixo
    'republica tcheca': 'CZ', 'czech republic': 'CZ', 'czechia': 'CZ',
    'hungria': 'HU', 'hungary': 'HU',
    'bulgaria': 'BG',
    'croacia': 'HR', 'croatia': 'HR',
    'servia': 'RS', 'serbia': 'RS',
    'bolivia': 'BO',
    'equador': 'EC', 'ecuador': 'EC',
    'costa rica': 'CR',
    'panama': 'PA',  # colide com UF Para PA - tratado pelo contexto BR
    'guatemala': 'GT',
    'cuba': 'CU',
    'jamaica': 'JM',
    'egito': 'EG', 'egypt': 'EG',
    'marrocos': 'MA', 'morocco': 'MA',  # colide com UF Maranhao MA
    'nigeria': 'NG',
    'quenia': 'KE', 'kenya': 'KE',
    'tailandia': 'TH', 'thailand': 'TH',
    'vietna': 'VN', 'vietnam': 'VN',
    'filipinas': 'PH', 'philippines': 'PH',
    'indonesia': 'ID',
    'malasia': 'MY', 'malaysia': 'MY',
    'taiwan': 'TW',
    'hong kong': 'HK',
    # v3.10.1: nomes locais / paises adicionais (RemoteOK, WeWorkRemotely)
    'espana': 'ES',
    'kazakhstan': 'KZ', 'cazaquistao': 'KZ',
    'paquistao': 'PK', 'pakistan': 'PK',
    'bangladesh': 'BD',
    'sri lanka': 'LK',
    'nepal': 'NP',
    'bahamas': 'BS',
    'jamaica': 'JM',
    'estonia': 'EE', 'estonia ': 'EE',
    'letonia': 'LV', 'latvia': 'LV',
    'lituania': 'LT', 'lithuania': 'LT',
    'eslovaquia': 'SK', 'slovakia': 'SK',
    'eslovenia': 'SI', 'slovenia': 'SI',
    'islandia': 'IS', 'iceland': 'IS',
    'luxemburgo': 'LU', 'luxembourg': 'LU',
    'malta': 'MT',
    'cipre': 'CY', 'cyprus': 'CY',
    'libano': 'LB', 'lebanon': 'LB',
    'jordania': 'JO', 'jordan': 'JO',
    'iraque': 'IQ', 'iraq': 'IQ',
    'ira': 'IR', 'iran': 'IR',
    'ganha': 'GH', 'ghana': 'GH',
    'mocambique': 'MZ', 'mozambique': 'MZ',
    'angola': 'AO',
}

# Cidades US comuns que aparecem em listings sem "United States" explicito
# (RemoteOK frequentemente entrega "Baltimore," ou "New York,"). Mapeia
# direto para state_code US.
US_CITY_TO_STATE = {
    'new york': 'NY', 'manhattan': 'NY', 'brooklyn': 'NY', 'queens': 'NY',
    'los angeles': 'CA', 'san francisco': 'CA', 'san diego': 'CA',
    'san jose': 'CA', 'sacramento': 'CA', 'oakland': 'CA',
    'san francisco bay area': 'CA', 'los angeles metropolitan area': 'CA',
    'chicago': 'IL', 'houston': 'TX', 'dallas': 'TX', 'austin': 'TX',
    'fort worth': 'TX', 'san antonio': 'TX', 'el paso': 'TX',
    'phoenix': 'AZ', 'tucson': 'AZ', 'mesa': 'AZ',
    'philadelphia': 'PA', 'pittsburgh': 'PA',
    'baltimore': 'MD',
    'washington': 'DC', 'washington dc': 'DC',
    'boston': 'MA', 'cambridge': 'MA',
    'seattle': 'WA', 'tacoma': 'WA',
    'denver': 'CO', 'boulder': 'CO',
    'atlanta': 'GA',
    'miami': 'FL', 'orlando': 'FL', 'tampa': 'FL', 'jacksonville': 'FL',
    'detroit': 'MI', 'cleveland': 'OH', 'columbus': 'OH', 'cincinnati': 'OH',
    'minneapolis': 'MN', 'st paul': 'MN',
    'portland': 'OR',
    'las vegas': 'NV', 'reno': 'NV',
    'nashville': 'TN', 'memphis': 'TN',
    'charlotte': 'NC', 'raleigh': 'NC',
    'indianapolis': 'IN',
    'milwaukee': 'WI',
    'kansas city': 'MO', 'st louis': 'MO',
    'salt lake city': 'UT',
    'new orleans': 'LA',
    'honolulu': 'HI',
    'anchorage': 'AK',
}

# Cidades nao-US que aparecem como "Cidade," sem pais explicito.
WORLD_CITY_TO_COUNTRY = {
    'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB', 'edinburgh': 'GB',
    'glasgow': 'GB', 'liverpool': 'GB', 'bristol': 'GB',
    'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR',
    'berlin': 'DE', 'munich': 'DE', 'hamburg': 'DE', 'frankfurt': 'DE', 'cologne': 'DE',
    'madrid': 'ES', 'barcelona': 'ES', 'valencia': 'ES', 'sevilla': 'ES',
    'lisbon': 'PT', 'lisboa': 'PT', 'porto': 'PT',
    'rome': 'IT', 'roma': 'IT', 'milan': 'IT', 'milano': 'IT',
    'amsterdam': 'NL', 'rotterdam': 'NL',
    'brussels': 'BE',
    'zurich': 'CH', 'geneva': 'CH',
    'vienna': 'AT',
    'dublin': 'IE',
    'stockholm': 'SE',
    'oslo': 'NO', 'copenhagen': 'DK', 'helsinki': 'FI',
    'warsaw': 'PL', 'krakow': 'PL',
    'prague': 'CZ',
    'budapest': 'HU',
    'athens': 'GR',
    'istanbul': 'TR', 'ankara': 'TR',
    'moscow': 'RU', 'st petersburg': 'RU',
    'kyiv': 'UA', 'kiev': 'UA',
    'tel aviv': 'IL', 'jerusalem': 'IL',
    'dubai': 'AE', 'abu dhabi': 'AE',
    'riyadh': 'SA',
    'tokyo': 'JP', 'osaka': 'JP', 'kyoto': 'JP',
    'seoul': 'KR', 'busan': 'KR',
    'beijing': 'CN', 'shanghai': 'CN', 'guangzhou': 'CN', 'shenzhen': 'CN',
    'hong kong': 'HK',
    'taipei': 'TW',
    'singapore': 'SG',
    'bangkok': 'TH',
    'jakarta': 'ID',
    'manila': 'PH', 'metro manila': 'PH',
    'kuala lumpur': 'MY',
    'mumbai': 'IN', 'delhi': 'IN', 'bangalore': 'IN', 'bengaluru': 'IN',
    'hyderabad': 'IN', 'chennai': 'IN', 'kolkata': 'IN', 'pune': 'IN',
    'gurgaon': 'IN', 'noida': 'IN', 'surat': 'IN', 'ahmedabad': 'IN',
    'karachi': 'PK', 'lahore': 'PK', 'islamabad': 'PK',
    'dhaka': 'BD',
    'nairobi': 'KE',
    'lagos': 'NG', 'abuja': 'NG',
    'cape town': 'ZA', 'johannesburg': 'ZA',
    'cairo': 'EG',
    'sydney': 'AU', 'melbourne': 'AU', 'brisbane': 'AU', 'perth': 'AU',
    'auckland': 'NZ', 'wellington': 'NZ',
    'toronto': 'CA', 'vancouver': 'CA', 'montreal': 'CA', 'ottawa': 'CA',
    'calgary': 'CA',
    'mexico city': 'MX', 'guadalajara': 'MX',
    'buenos aires': 'AR',
    'santiago': 'CL',
    'bogota': 'CO', 'medellin': 'CO',
    'lima': 'PE',
    'caracas': 'VE',
    'nassau': 'BS',
    'almaty': 'KZ', 'astana': 'KZ',
}

# Macro-regioes metropolitanas BR -> UF.
# LinkedIn frequentemente devolve essas strings como ``addressLocality``
# com ``addressRegion=null``. Tambem usado para tokens "Cidade e Regiao"
# de capitais/grandes cidades.
BR_METRO_REGIONS = {
    'sao paulo e regiao': 'SP',
    'grande sao paulo': 'SP',
    'regiao metropolitana de sao paulo': 'SP',
    'rio de janeiro e regiao': 'RJ',
    'grande rio': 'RJ',
    'regiao metropolitana do rio de janeiro': 'RJ',
    'belo horizonte e regiao': 'MG',
    'grande belo horizonte': 'MG',
    'regiao metropolitana de belo horizonte': 'MG',
    'porto alegre e regiao': 'RS',
    'grande porto alegre': 'RS',
    'regiao metropolitana de porto alegre': 'RS',
    'curitiba e regiao': 'PR',
    'grande curitiba': 'PR',
    'regiao metropolitana de curitiba': 'PR',
    'salvador e regiao': 'BA',
    'grande salvador': 'BA',
    'recife e regiao': 'PE',
    'grande recife': 'PE',
    'fortaleza e regiao': 'CE',
    'grande fortaleza': 'CE',
    'brasilia e regiao': 'DF',
    'grande brasilia': 'DF',
    'distrito federal e regiao': 'DF',
    'manaus e regiao': 'AM',
    'belem e regiao': 'PA',
    'goiania e regiao': 'GO',
    'grande goiania': 'GO',
    'florianopolis e regiao': 'SC',
    'grande florianopolis': 'SC',
    'vitoria e regiao': 'ES',
    'grande vitoria': 'ES',
    'natal e regiao': 'RN',
    'joao pessoa e regiao': 'PB',
    'maceio e regiao': 'AL',
    'aracaju e regiao': 'SE',
    'teresina e regiao': 'PI',
    'sao luis e regiao': 'MA',
    'cuiaba e regiao': 'MT',
    'campo grande e regiao': 'MS',
    'palmas e regiao': 'TO',
    'rio branco e regiao': 'AC',
    'porto velho e regiao': 'RO',
    'boa vista e regiao': 'RR',
    'macapa e regiao': 'AP',
    'campinas e regiao': 'SP',
    'santos e regiao': 'SP',
    'sao jose dos campos e regiao': 'SP',
    'ribeirao preto e regiao': 'SP',
    'sorocaba e regiao': 'SP',
}

# Cidades e bairros BR mais frequentes em job postings -> UF.
# Engines como Michael Page entregam ``addressLocality`` sem ``addressRegion``,
# resultando em strings tipo "Curitiba, Brazil, BR" - sem UF nenhuma. Sem este
# mapa, ficamos com state_code=None mesmo tendo a cidade exata.
# Inclui capitais, regioes metropolitanas, polos industriais e bairros de
# capitais que aparecem como ``addressLocality`` em vagas reais.
BR_CITY_TO_UF = {
    # SP
    'sao paulo': 'SP', 'campinas': 'SP', 'sao bernardo do campo': 'SP',
    'sao caetano do sul': 'SP', 'santo andre': 'SP', 'diadema': 'SP',
    'maua': 'SP', 'guarulhos': 'SP', 'osasco': 'SP', 'barueri': 'SP',
    'cotia': 'SP', 'embu das artes': 'SP', 'taboao da serra': 'SP',
    'sorocaba': 'SP', 'jundiai': 'SP', 'indaiatuba': 'SP', 'piracicaba': 'SP',
    'cabreuva': 'SP', 'sao jose dos campos': 'SP', 'taubate': 'SP',
    'jacarei': 'SP', 'caraguatatuba': 'SP', 'sao jose do rio preto': 'SP',
    'ribeirao preto': 'SP', 'araraquara': 'SP', 'sao carlos': 'SP',
    'limeira': 'SP', 'americana': 'SP', 'bauru': 'SP', 'franca': 'SP',
    'mogi das cruzes': 'SP', 'mogi guacu': 'SP', 'santos': 'SP',
    'sao vicente': 'SP', 'guaruja': 'SP', 'praia grande': 'SP',
    'presidente prudente': 'SP', 'aracatuba': 'SP', 'marilia': 'SP',
    'itu': 'SP', 'salto': 'SP', 'valinhos': 'SP', 'vinhedo': 'SP',
    'paulinia': 'SP', 'hortolandia': 'SP', 'sumare': 'SP',
    # RJ (cidades + bairros frequentes em postings)
    'rio de janeiro': 'RJ', 'niteroi': 'RJ', 'duque de caxias': 'RJ',
    'sao goncalo': 'RJ', 'nova iguacu': 'RJ', 'petropolis': 'RJ',
    'volta redonda': 'RJ', 'macae': 'RJ', 'cabo frio': 'RJ',
    'campos dos goytacazes': 'RJ', 'nova friburgo': 'RJ', 'angra dos reis': 'RJ',
    'botafogo': 'RJ', 'copacabana': 'RJ', 'ipanema': 'RJ', 'leblon': 'RJ',
    'barra da tijuca': 'RJ', 'centro do rio de janeiro': 'RJ',
    # MG
    'belo horizonte': 'MG', 'contagem': 'MG', 'uberlandia': 'MG',
    'juiz de fora': 'MG', 'betim': 'MG', 'montes claros': 'MG',
    'ribeirao das neves': 'MG', 'uberaba': 'MG', 'governador valadares': 'MG',
    'ipatinga': 'MG', 'sete lagoas': 'MG', 'divinopolis': 'MG',
    'pocos de caldas': 'MG', 'patos de minas': 'MG', 'nova lima': 'MG',
    # RS
    'porto alegre': 'RS', 'caxias do sul': 'RS', 'pelotas': 'RS',
    'canoas': 'RS', 'santa maria': 'RS', 'gravatai': 'RS',
    'novo hamburgo': 'RS', 'sao leopoldo': 'RS', 'rio grande': 'RS',
    'passo fundo': 'RS', 'viamao': 'RS', 'alvorada': 'RS', 'sapucaia do sul': 'RS',
    # PR
    'curitiba': 'PR', 'londrina': 'PR', 'maringa': 'PR',
    'ponta grossa': 'PR', 'cascavel': 'PR', 'sao jose dos pinhais': 'PR',
    'foz do iguacu': 'PR', 'colombo': 'PR', 'guarapuava': 'PR',
    'paranagua': 'PR', 'araucaria': 'PR', 'pinhais': 'PR',
    # SC (sao jose pode ser ambiguo - cobertura por chave longa primeiro)
    'florianopolis': 'SC', 'joinville': 'SC', 'blumenau': 'SC',
    'sao jose': 'SC', 'criciuma': 'SC', 'chapeco': 'SC', 'itajai': 'SC',
    'lages': 'SC', 'palhoca': 'SC', 'balneario camboriu': 'SC',
    'jaragua do sul': 'SC', 'tubarao': 'SC',
    # BA
    'salvador': 'BA', 'feira de santana': 'BA', 'vitoria da conquista': 'BA',
    'camacari': 'BA', 'itabuna': 'BA', 'juazeiro': 'BA', 'lauro de freitas': 'BA',
    'ilheus': 'BA', 'jequie': 'BA',
    # PE
    'recife': 'PE', 'jaboatao dos guararapes': 'PE', 'olinda': 'PE',
    'caruaru': 'PE', 'paulista': 'PE', 'petrolina': 'PE', 'cabo de santo agostinho': 'PE',
    # CE
    'fortaleza': 'CE', 'caucaia': 'CE', 'juazeiro do norte': 'CE',
    'sobral': 'CE', 'maracanau': 'CE',
    # GO
    'goiania': 'GO', 'aparecida de goiania': 'GO', 'anapolis': 'GO',
    'rio verde': 'GO', 'luziania': 'GO',
    # DF
    'brasilia': 'DF', 'ceilandia': 'DF', 'taguatinga': 'DF',
    # PA
    'belem': 'PA', 'ananindeua': 'PA', 'santarem': 'PA', 'maraba': 'PA',
    # AM
    'manaus': 'AM', 'parintins': 'AM',
    # ES
    'vitoria': 'ES', 'vila velha': 'ES', 'serra': 'ES', 'cariacica': 'ES',
    'cachoeiro de itapemirim': 'ES',
    # MA
    'sao luis': 'MA', 'imperatriz': 'MA',
    # RN
    'natal': 'RN', 'mossoro': 'RN', 'parnamirim': 'RN',
    # PB
    'joao pessoa': 'PB', 'campina grande': 'PB',
    # AL
    'maceio': 'AL', 'arapiraca': 'AL',
    # SE
    'aracaju': 'SE',
    # PI
    'teresina': 'PI', 'parnaiba': 'PI',
    # MT
    'cuiaba': 'MT', 'varzea grande': 'MT', 'rondonopolis': 'MT', 'sinop': 'MT',
    # MS
    'campo grande': 'MS', 'dourados': 'MS', 'tres lagoas': 'MS',
    # RO
    'porto velho': 'RO', 'ji-parana': 'RO',
    # AC
    'rio branco': 'AC',
    # AP
    'macapa': 'AP',
    # RR
    'boa vista': 'RR',
    # TO
    'palmas': 'TO',
}

# Codigos ISO-3166 alpha-2 dos paises mais frequentes em postings.
# Usado para fallback quando a string termina em ", BR" / ", US" / etc.
# (caso comum: Michael Page entrega "Cidade, Region, BR").
ISO_COUNTRY_CODES = {
    'BR', 'US', 'GB', 'PT', 'ES', 'FR', 'DE', 'IT', 'AR', 'CA', 'MX',
    'CL', 'CO', 'UY', 'PY', 'PE', 'VE', 'NL', 'IE', 'AU', 'NZ', 'IN',
    'JP', 'CN', 'KR', 'IL', 'SG', 'AE', 'SA', 'ZA', 'BE', 'CH', 'SE',
    'NO', 'DK', 'FI', 'PL', 'AT', 'GR', 'TR', 'RU', 'UA', 'CZ', 'HU',
    'BG', 'HR', 'RS', 'BO', 'EC', 'CR', 'GT', 'CU', 'JM', 'EG', 'NG',
    'KE', 'TH', 'VN', 'PH', 'ID', 'MY', 'TW', 'HK',
}

# Tokens que indicam vaga remota global (sem localidade fisica)
REMOTE_TOKENS = {'remote', 'remoto', 'remotamente', 'home office', 'anywhere', 'worldwide'}


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def _normalize(text: str) -> str:
    return _strip_accents(text or '').lower().strip()


# Regex precompilados
_RE_UF_DASH    = re.compile(r'\b([A-Za-z][\w\s\-]*?)\s*-\s*([A-Z]{2})\b')
_RE_UF_COMMA   = re.compile(r',\s*([A-Z]{2})(?:\s*,|\s*$|\s*-)')
_RE_UF_LOOSE   = re.compile(r'\b([A-Z]{2})\b')


def _detect_country(normalized: str) -> Optional[str]:
    """Match por substring contra COUNTRY_NAMES, do nome mais longo pro mais curto."""
    if not normalized:
        return None
    # ordena por tamanho decrescente para evitar match parcial ('us' antes de 'usa')
    for name in sorted(COUNTRY_NAMES.keys(), key=len, reverse=True):
        # word boundary aproximado: cercado por nao-letra
        if re.search(rf'(?:^|[^a-z]){re.escape(name)}(?:[^a-z]|$)', normalized):
            return COUNTRY_NAMES[name]
    return None


def _detect_uf(raw: str) -> Optional[str]:
    """Procura UF brasileira na string original (preserva caixa)."""
    if not raw:
        return None

    # 1) Padrao "Cidade - UF"
    for match in _RE_UF_DASH.finditer(raw):
        candidate = match.group(2).upper()
        if candidate in BR_STATES:
            return candidate

    # 2) Padrao ", UF,"  ou  ", UF$"
    for match in _RE_UF_COMMA.finditer(raw):
        candidate = match.group(1).upper()
        if candidate in BR_STATES:
            return candidate

    # 3) Sigla isolada como token MAIUSCULO (mais permissivo)
    tokens_upper = re.findall(r'\b[A-Z]{2}\b', raw)
    for token in tokens_upper:
        if token in BR_STATES:
            return token

    # 4) Nome do estado por extenso
    normalized = _normalize(raw)
    for name in sorted(BR_STATE_NAMES.keys(), key=len, reverse=True):
        if re.search(rf'(?:^|[^a-z]){re.escape(name)}(?:[^a-z]|$)', normalized):
            return BR_STATE_NAMES[name]

    # 5) Macro-regiao metropolitana ("Porto Alegre e Regiao", "Grande SP", ...)
    for name in sorted(BR_METRO_REGIONS.keys(), key=len, reverse=True):
        if re.search(rf'(?:^|[^a-z]){re.escape(name)}(?:[^a-z]|$)', normalized):
            return BR_METRO_REGIONS[name]

    # 6) Cidade conhecida sem UF explicita ("Curitiba, Brazil, BR" -> PR).
    # Ordena do nome mais longo pro mais curto: "sao jose dos campos" tem
    # que casar antes de "sao jose" (ambiguidade SP vs SC).
    for name in sorted(BR_CITY_TO_UF.keys(), key=len, reverse=True):
        if re.search(rf'(?:^|[^a-z]){re.escape(name)}(?:[^a-z]|$)', normalized):
            return BR_CITY_TO_UF[name]

    return None


def normalize_location(raw_location: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Recebe uma string de localidade (ex: "Sao Paulo - SP") e devolve
    (state_code, country_code).

    Heuristica:
      1. Tenta detectar UF brasileira; se acha, country = 'BR'.
      2. Caso contrario, tenta detectar pais por nome.
      3. Tokens de remote sem outra info → (None, None).

    Casos especiais:
      - "PA, US" / "CA, US" (sem cidade): primeira sigla eh tratada como
        state US porque o country eh explicito.
      - "Pittsburgh, PA, US": pega state US no token do meio.
      - UFs brasileiras com sigla coincidente (PA, MA, MS, MT, MG, SC,
        AL, AM, RO, RJ, ...) sao desambiguadas pelo country explicito.
    """
    if not raw_location:
        return None, None

    raw = str(raw_location).strip()
    if not raw:
        return None, None

    normalized = _normalize(raw)

    # Detecta país primeiro (info mais confiável quando vier explícita)
    country = _detect_country(normalized)

    # Quando country eh US (explicito), procura state US em qualquer
    # posicao da string - inclusive antes da virgula final como em "PA, US".
    if country == 'US':
        for token in re.findall(r'\b([A-Z]{2})\b', raw):
            if token in US_STATES and token != 'US':
                return token, 'US'
        # Fallback: nome do estado por extenso (ex.: "New York, New York,
        # United States" - JSON-LD do Dice). Ordena do nome mais longo pro
        # mais curto pra evitar match parcial ("virginia" antes de "west virginia").
        for name in sorted(US_STATE_NAMES.keys(), key=len, reverse=True):
            if re.search(rf'(?:^|[^a-z]){re.escape(name)}(?:[^a-z]|$)', normalized):
                return US_STATE_NAMES[name], 'US'
        return None, 'US'

    # Tenta UF brasileira (ambígua com US - só vale se country for BR ou desconhecido)
    if country in (None, 'BR'):
        uf = _detect_uf(raw)
        if uf:
            return uf, 'BR'

    # Estado US: padrão "City, ST" / "City, ST, US"
    us_match = re.search(r',\s*([A-Z]{2})(?:\s*,|\s*$)', raw)
    if us_match and us_match.group(1) in US_STATES:
        return us_match.group(1), country or 'US'

    # Estado US: padrao "City - ST" (sem virgula nem mencao explicita de pais).
    # Cobre strings tipo "Venice - CA", "Austin - TX", "Saratoga Springs - NY"
    # vindas de ``company.location`` do GeekHunter para empresas estrangeiras.
    # So aplica quando country nao foi resolvido pra outra coisa.
    if country is None:
        dash_match = re.search(r'-\s*([A-Z]{2})\s*$', raw)
        if dash_match and dash_match.group(1) in US_STATES and dash_match.group(1) not in BR_STATES:
            return dash_match.group(1), 'US'

    # UK: codigos de pais/regiao em sufixo apos hifen ("Manchester - EN",
    # "Wolverhampton - WM"). Sem detalhe de subdivisao - so atribui country.
    if country is None:
        uk_match = re.search(r'-\s*(EN|WLS|NIR|WM|GL|YH|EM|EE|SE|SW|NE|NW|LDN)\s*$', raw)
        if uk_match:
            return None, 'GB'

    # UK: formato ZipRecruiter "Cidade, REGIAO, GB" (ex: "London, ENG, GB",
    # "Edinburgh, SCT, GB"). Mapeia subdivisao ISO 3166-2:GB-* (4 paises do UK)
    # para state_code dedicado em vez de None.
    if country in (None, 'GB'):
        uk_subdiv = re.search(r',\s*(ENG|SCT|WLS|NIR)\s*,\s*GB\s*$', raw, re.I)
        if uk_subdiv:
            return uk_subdiv.group(1).upper(), 'GB'

    if country:
        return None, country

    # v3.10.2: string igual a sigla ISO alpha-2 ("BR", "US", "DE"). WWR
    # frequentemente entrega "Headquarters: BR" / "Headquarters: US".
    iso_only = re.match(r'^([A-Z]{2})$', raw)
    if iso_only and iso_only.group(1) in ISO_COUNTRY_CODES:
        return None, iso_only.group(1)

    # v3.10.2: state US por nome completo sem cidade ("Florida",
    # "WEST VIRGINIA"). Antes so funcionava como sufixo combinado.
    if country is None:
        for name in sorted(US_STATE_NAMES.keys(), key=len, reverse=True):
            if normalized == name:
                return US_STATE_NAMES[name], 'US'

    # v3.10.1: cidade US conhecida sem pais explicito ("Baltimore,",
    # "New York,", "San Francisco Bay Area"). Aplicado SO quando nao
    # houve match de pais e a cidade nao colide com UF brasileira.
    for city in sorted(US_CITY_TO_STATE.keys(), key=len, reverse=True):
        if re.search(rf'(?:^|[^a-z]){re.escape(city)}(?:[^a-z]|$)', normalized):
            return US_CITY_TO_STATE[city], 'US'

    # v3.10.1: cidade nao-US conhecida ("London,", "Mumbai", "Metro Manila").
    for city in sorted(WORLD_CITY_TO_COUNTRY.keys(), key=len, reverse=True):
        if re.search(rf'(?:^|[^a-z]){re.escape(city)}(?:[^a-z]|$)', normalized):
            return None, WORLD_CITY_TO_COUNTRY[city]

    # Fallback: ISO alpha-2 explicito no fim da string (", BR", ", US").
    # Cobre engines que serializam JSON-LD como "Cidade, Region, BR" sem
    # nome do pais por extenso. Aplicado por ultimo pra nao colidir com
    # UFs brasileiras (BR nao eh UF, US/GB/etc. tampouco).
    iso_match = re.search(r',\s*([A-Z]{2})\s*$', raw)
    if iso_match and iso_match.group(1) in ISO_COUNTRY_CODES:
        return None, iso_match.group(1)

    # Vaga remota sem indicador de país: nao da pra atribuir
    return None, None
