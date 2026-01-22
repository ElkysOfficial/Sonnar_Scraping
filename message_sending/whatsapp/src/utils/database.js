/**
 * Funções úteis para trabalhar
 * com dados.
 *
 * @author Dev Gui
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PREFIX, SPIDER_API_TOKEN } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databasePath = path.resolve(__dirname, "..", "..", "database");

const ANTI_LINK_GROUPS_FILE = "anti-link-groups";
const AUTO_RESPONDER_FILE = "auto-responder";
const AUTO_RESPONDER_GROUPS_FILE = "auto-responder-groups";
const AUTO_STICKER_GROUPS_FILE = "auto-sticker-groups";
const CONFIG_FILE = "config";
const EXIT_GROUPS_FILE = "exit-groups";
const GROUP_RESTRICTIONS_FILE = "group-restrictions";
const INACTIVE_GROUPS_FILE = "inactive-groups";
const MUTE_FILE = "muted";
const ONLY_ADMINS_FILE = "only-admins";
const PREFIX_GROUPS_FILE = "prefix-groups";
const RESTRICTED_MESSAGES_FILE = "restricted-messages";
const WELCOME_GROUPS_FILE = "welcome-groups";

function createIfNotExists(fullPath, formatIfNotExists = []) {
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, JSON.stringify(formatIfNotExists));
  }
}

function readJSON(jsonFile, formatIfNotExists = []) {
  const fullPath = path.resolve(databasePath, `${jsonFile}.json`);

  createIfNotExists(fullPath, formatIfNotExists);

  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function writeJSON(jsonFile, data, formatIfNotExists = []) {
  const fullPath = path.resolve(databasePath, `${jsonFile}.json`);

  createIfNotExists(fullPath, formatIfNotExists);

  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf8");
}

export function activateExitGroup(groupId) {
  const filename = EXIT_GROUPS_FILE;

  const exitGroups = readJSON(filename);

  if (!exitGroups.includes(groupId)) {
    exitGroups.push(groupId);
  }

  writeJSON(filename, exitGroups);
}

export function deactivateExitGroup(groupId) {
  const filename = EXIT_GROUPS_FILE;

  const exitGroups = readJSON(filename);

  const index = exitGroups.indexOf(groupId);

  if (index === -1) {
    return;
  }

  exitGroups.splice(index, 1);

  writeJSON(filename, exitGroups);
}

export function isActiveExitGroup(groupId) {
  const filename = EXIT_GROUPS_FILE;

  const exitGroups = readJSON(filename);

  return exitGroups.includes(groupId);
}

export function activateWelcomeGroup(groupId) {
  const filename = WELCOME_GROUPS_FILE;

  const welcomeGroups = readJSON(filename);

  if (!welcomeGroups.includes(groupId)) {
    welcomeGroups.push(groupId);
  }

  writeJSON(filename, welcomeGroups);
}

export function deactivateWelcomeGroup(groupId) {
  const filename = WELCOME_GROUPS_FILE;

  const welcomeGroups = readJSON(filename);

  const index = welcomeGroups.indexOf(groupId);

  if (index === -1) {
    return;
  }

  welcomeGroups.splice(index, 1);

  writeJSON(filename, welcomeGroups);
}

export function isActiveWelcomeGroup(groupId) {
  const filename = WELCOME_GROUPS_FILE;

  const welcomeGroups = readJSON(filename);

  return welcomeGroups.includes(groupId);
}

export function activateGroup(groupId) {
  const filename = INACTIVE_GROUPS_FILE;

  const inactiveGroups = readJSON(filename);

  const index = inactiveGroups.indexOf(groupId);

  if (index === -1) {
    return;
  }

  inactiveGroups.splice(index, 1);

  writeJSON(filename, inactiveGroups);
}

export function deactivateGroup(groupId) {
  const filename = INACTIVE_GROUPS_FILE;

  const inactiveGroups = readJSON(filename);

  if (!inactiveGroups.includes(groupId)) {
    inactiveGroups.push(groupId);
  }

  writeJSON(filename, inactiveGroups);
}

export function isActiveGroup(groupId) {
  const filename = INACTIVE_GROUPS_FILE;

  const inactiveGroups = readJSON(filename);

  return !inactiveGroups.includes(groupId);
}

export function getAutoResponderResponse(match) {
  const filename = AUTO_RESPONDER_FILE;

  const responses = readJSON(filename);

  const matchUpperCase = match.toLocaleUpperCase();

  const data = responses.find(
    (response) => response.match.toLocaleUpperCase() === matchUpperCase
  );

  if (!data) {
    return null;
  }

  return data.answer;
}

export function activateAutoResponderGroup(groupId) {
  const filename = AUTO_RESPONDER_GROUPS_FILE;

  const autoResponderGroups = readJSON(filename);

  if (!autoResponderGroups.includes(groupId)) {
    autoResponderGroups.push(groupId);
  }

  writeJSON(filename, autoResponderGroups);
}

export function deactivateAutoResponderGroup(groupId) {
  const filename = AUTO_RESPONDER_GROUPS_FILE;

  const autoResponderGroups = readJSON(filename);

  const index = autoResponderGroups.indexOf(groupId);

  if (index === -1) {
    return;
  }

  autoResponderGroups.splice(index, 1);

  writeJSON(filename, autoResponderGroups);
}

export function isActiveAutoResponderGroup(groupId) {
  const filename = AUTO_RESPONDER_GROUPS_FILE;

  const autoResponderGroups = readJSON(filename);

  return autoResponderGroups.includes(groupId);
}

export function activateAntiLinkGroup(groupId) {
  const filename = ANTI_LINK_GROUPS_FILE;

  const antiLinkGroups = readJSON(filename);

  if (!antiLinkGroups.includes(groupId)) {
    antiLinkGroups.push(groupId);
  }

  writeJSON(filename, antiLinkGroups);
}

export function deactivateAntiLinkGroup(groupId) {
  const filename = ANTI_LINK_GROUPS_FILE;

  const antiLinkGroups = readJSON(filename);

  const index = antiLinkGroups.indexOf(groupId);

  if (index === -1) {
    return;
  }

  antiLinkGroups.splice(index, 1);

  writeJSON(filename, antiLinkGroups);
}

export function isActiveAntiLinkGroup(groupId) {
  const filename = ANTI_LINK_GROUPS_FILE;

  const antiLinkGroups = readJSON(filename);

  return antiLinkGroups.includes(groupId);
}

export function activateAutoStickerGroup(groupId) {
  const filename = AUTO_STICKER_GROUPS_FILE;

  const autoStickerGroups = readJSON(filename);

  if (!autoStickerGroups.includes(groupId)) {
    autoStickerGroups.push(groupId);
  }

  writeJSON(filename, autoStickerGroups);
}

export function deactivateAutoStickerGroup(groupId) {
  const filename = AUTO_STICKER_GROUPS_FILE;

  const autoStickerGroups = readJSON(filename);

  const index = autoStickerGroups.indexOf(groupId);

  if (index === -1) {
    return;
  }

  autoStickerGroups.splice(index, 1);

  writeJSON(filename, autoStickerGroups);
}

export function isActiveAutoStickerGroup(groupId) {
  const filename = AUTO_STICKER_GROUPS_FILE;

  const autoStickerGroups = readJSON(filename);

  return autoStickerGroups.includes(groupId);
}

export function muteMember(groupId, memberId) {
  const filename = MUTE_FILE;

  const mutedMembers = readJSON(filename, JSON.stringify({}));

  if (!mutedMembers[groupId]) {
    mutedMembers[groupId] = [];
  }

  if (!mutedMembers[groupId]?.includes(memberId)) {
    mutedMembers[groupId].push(memberId);
  }

  writeJSON(filename, mutedMembers);
}

export function unmuteMember(groupId, memberId) {
  const filename = MUTE_FILE;

  const mutedMembers = readJSON(filename, JSON.stringify({}));

  if (!mutedMembers[groupId]) {
    return;
  }

  const index = mutedMembers[groupId].indexOf(memberId);

  if (index !== -1) {
    mutedMembers[groupId].splice(index, 1);
  }

  writeJSON(filename, mutedMembers);
}

export function checkIfMemberIsMuted(groupId, memberId) {
  const filename = MUTE_FILE;

  const mutedMembers = readJSON(filename, JSON.stringify({}));

  if (!mutedMembers[groupId]) {
    return false;
  }

  return mutedMembers[groupId]?.includes(memberId);
}

export function activateOnlyAdmins(groupId) {
  const filename = ONLY_ADMINS_FILE;

  const onlyAdminsGroups = readJSON(filename, []);

  if (!onlyAdminsGroups.includes(groupId)) {
    onlyAdminsGroups.push(groupId);
  }

  writeJSON(filename, onlyAdminsGroups);
}

export function deactivateOnlyAdmins(groupId) {
  const filename = ONLY_ADMINS_FILE;

  const onlyAdminsGroups = readJSON(filename, []);

  const index = onlyAdminsGroups.indexOf(groupId);
  if (index === -1) {
    return;
  }

  onlyAdminsGroups.splice(index, 1);

  writeJSON(filename, onlyAdminsGroups);
}

export function isActiveOnlyAdmins(groupId) {
  const filename = ONLY_ADMINS_FILE;

  const onlyAdminsGroups = readJSON(filename, []);

  return onlyAdminsGroups.includes(groupId);
}

export function readGroupRestrictions() {
  return readJSON(GROUP_RESTRICTIONS_FILE, {});
}

export function saveGroupRestrictions(restrictions) {
  writeJSON(GROUP_RESTRICTIONS_FILE, restrictions, {});
}

export function isActiveGroupRestriction(groupId, restriction) {
  const restrictions = readGroupRestrictions();

  if (!restrictions[groupId]) {
    return false;
  }

  return restrictions[groupId][restriction] === true;
}

export function updateIsActiveGroupRestriction(groupId, restriction, isActive) {
  const restrictions = readGroupRestrictions();

  if (!restrictions[groupId]) {
    restrictions[groupId] = {};
  }

  restrictions[groupId][restriction] = isActive;

  saveGroupRestrictions(restrictions);
}

export function readRestrictedMessageTypes() {
  return readJSON(RESTRICTED_MESSAGES_FILE, {
    sticker: "stickerMessage",
    video: "videoMessage",
    image: "imageMessage",
    audio: "audioMessage",
    product: "productMessage",
    document: "documentMessage",
    event: "eventMessage",
  });
}

export function setPrefix(groupJid, prefix) {
  const filename = PREFIX_GROUPS_FILE;

  const prefixGroups = readJSON(filename, {});

  prefixGroups[groupJid] = prefix;

  writeJSON(filename, prefixGroups, {});
}

export function getPrefix(groupJid) {
  const filename = PREFIX_GROUPS_FILE;

  const prefixGroups = readJSON(filename, {});

  return prefixGroups[groupJid] || PREFIX;
}

export function listAutoResponderItems() {
  const filename = AUTO_RESPONDER_FILE;
  const responses = readJSON(filename, []);

  return responses.map((item, index) => ({
    key: index + 1,
    match: item.match,
    answer: item.answer,
  }));
}

export function addAutoResponderItem(match, answer) {
  const filename = AUTO_RESPONDER_FILE;
  const responses = readJSON(filename, []);

  const matchUpperCase = match.toLocaleUpperCase();

  const existingItem = responses.find(
    (response) => response.match.toLocaleUpperCase() === matchUpperCase
  );

  if (existingItem) {
    return false;
  }

  responses.push({
    match: match.trim(),
    answer: answer.trim(),
  });

  writeJSON(filename, responses, []);

  return true;
}

export function removeAutoResponderItemByKey(key) {
  const filename = AUTO_RESPONDER_FILE;
  const responses = readJSON(filename, []);

  const index = key - 1;

  if (index < 0 || index >= responses.length) {
    return false;
  }

  responses.splice(index, 1);

  writeJSON(filename, responses, []);

  return true;
}

export function setSpiderApiToken(token) {
  const filename = CONFIG_FILE;

  const config = readJSON(filename, {});

  config.spider_api_token = token;

  writeJSON(filename, config, {});
}

export function getSpiderApiToken() {
  const filename = CONFIG_FILE;

  const config = readJSON(filename, {});

  return config.spider_api_token || SPIDER_API_TOKEN;
}

// ======= ASSINANTES VIP (Vagas Personalizadas) =======
const VIP_SUBSCRIBERS_FILE = "vip-subscribers";
const VIP_PENDING_FILE = "vip-pending-subscribers";

/**
 * Normaliza filtros VIP com valores padrão
 */
function normalizeVipFilters(filtersInput) {
  if (!filtersInput || typeof filtersInput !== "object") {
    return {
      roles: [],
      stacks: [],
      seniority: [],
      locations: [],
      workMode: [],
      contract: [],
      languages: [],
      weights: { roles: 20, stacks: 30, seniority: 15, locations: 10, workMode: 10, contract: 10, languages: 5 },
      must: { roles: true, stacks: true, workMode: false, contract: false, languages: false },
      ignoreUnknown: true
    };
  }

  return {
    roles: filtersInput.roles || [],
    stacks: filtersInput.stacks || [],
    seniority: filtersInput.seniority || [],
    locations: filtersInput.locations || [],
    workMode: filtersInput.workMode || [],
    contract: filtersInput.contract || [],
    languages: filtersInput.languages || [],
    weights: filtersInput.weights || { roles: 20, stacks: 30, seniority: 15, locations: 10, workMode: 10, contract: 10, languages: 5 },
    must: filtersInput.must || { roles: true, stacks: true, workMode: false, contract: false, languages: false },
    ignoreUnknown: filtersInput.ignoreUnknown !== false
  };
}

/**
 * Retorna todos os VIPs aprovados como objeto indexado por nome
 * Estrutura: { "Nome Completo": { lid, stacks, filters, addedAt, ... } }
 */
export function getVipSubscribersObject() {
  return readJSON(VIP_SUBSCRIBERS_FILE, {});
}

/**
 * Retorna array de VIPs para compatibilidade
 * @param {boolean} onlyActive - Se true, retorna apenas VIPs ativos (default: true)
 */
export function getVipSubscribers(onlyActive = true) {
  const data = readJSON(VIP_SUBSCRIBERS_FILE, {});

  // Se for array (formato antigo), converte para novo formato
  if (Array.isArray(data)) {
    const newFormat = {};
    for (const subscriber of data) {
      const name = subscriber.name || `VIP_${subscriber.lid.replace("@lid", "")}`;
      newFormat[name] = {
        lid: subscriber.lid,
        stacks: subscriber.stacks || subscriber.filters?.stacks || [],
        filters: subscriber.filters || normalizeVipFilters({ stacks: subscriber.stacks || [] }),
        addedAt: subscriber.addedAt || new Date().toISOString(),
        active: true
      };
    }
    writeJSON(VIP_SUBSCRIBERS_FILE, newFormat, {});
    return Object.entries(newFormat).map(([name, d]) => ({ name, ...d }));
  }

  const allSubscribers = Object.entries(data).map(([name, subscriberData]) => ({
    name,
    ...subscriberData
  }));

  // Filtra apenas ativos se solicitado
  if (onlyActive) {
    return allSubscribers.filter(s => s.active !== false);
  }

  return allSubscribers;
}

/**
 * Adiciona/atualiza VIP aprovado
 * @param {string} name - Nome completo do cliente (obrigatório)
 * @param {string} lid - LID do WhatsApp
 * @param {object} filtersInput - Filtros do VIP
 * @returns {boolean} true se criou, false se atualizou
 */
export function addVipSubscriber(name, lid, filtersInput) {
  if (!name || !name.trim()) {
    throw new Error("Nome é obrigatório para adicionar VIP");
  }
  if (!lid) {
    throw new Error("LID é obrigatório para adicionar VIP");
  }

  const subscribers = getVipSubscribersObject();
  const filters = normalizeVipFilters(filtersInput);
  const stacks = filters.stacks || [];
  const now = new Date().toISOString();
  const normalizedName = name.trim();

  const existingName = Object.keys(subscribers).find(n => subscribers[n].lid === lid);

  if (existingName) {
    const existingData = subscribers[existingName];
    delete subscribers[existingName];

    subscribers[normalizedName] = {
      lid,
      stacks,
      filters,
      addedAt: existingData.addedAt || now,
      updatedAt: now,
      active: true
    };
    writeJSON(VIP_SUBSCRIBERS_FILE, subscribers, {});
    return false;
  }

  subscribers[normalizedName] = {
    lid,
    stacks,
    filters,
    addedAt: now,
    active: true
  };

  writeJSON(VIP_SUBSCRIBERS_FILE, subscribers, {});
  return true;
}

/**
 * Ativa ou desativa um VIP
 * @param {string} lid - LID do VIP
 * @param {boolean} active - true para ativar, false para desativar
 */
export function setVipActive(lid, active) {
  const subscribers = getVipSubscribersObject();
  const name = Object.keys(subscribers).find(n => subscribers[n].lid === lid);

  if (!name) return false;

  subscribers[name].active = active;
  subscribers[name].updatedAt = new Date().toISOString();
  writeJSON(VIP_SUBSCRIBERS_FILE, subscribers, {});
  return true;
}

/**
 * Ativa ou desativa um VIP pelo nome
 */
export function setVipActiveByName(name, active) {
  const subscribers = getVipSubscribersObject();

  if (!subscribers[name]) return false;

  subscribers[name].active = active;
  subscribers[name].updatedAt = new Date().toISOString();
  writeJSON(VIP_SUBSCRIBERS_FILE, subscribers, {});
  return true;
}

/**
 * Remove um assinante VIP pelo LID
 */
export function removeVipSubscriber(lid) {
  const subscribers = getVipSubscribersObject();
  const nameToRemove = Object.keys(subscribers).find(name => subscribers[name].lid === lid);

  if (!nameToRemove) return false;

  delete subscribers[nameToRemove];
  writeJSON(VIP_SUBSCRIBERS_FILE, subscribers, {});
  return true;
}

/**
 * Remove um assinante VIP pelo nome
 */
export function removeVipSubscriberByName(name) {
  const subscribers = getVipSubscribersObject();

  if (!subscribers[name]) return false;

  delete subscribers[name];
  writeJSON(VIP_SUBSCRIBERS_FILE, subscribers, {});
  return true;
}

/**
 * Verifica se um usuário é assinante VIP
 */
export function getVipSubscriber(lid) {
  const subscribers = getVipSubscribers();
  return subscribers.find((s) => s.lid === lid) || null;
}

/**
 * Busca VIP pelo nome
 */
export function getVipSubscriberByName(name) {
  const subscribers = getVipSubscribersObject();
  if (!subscribers[name]) return null;
  return { name, ...subscribers[name] };
}

/**
 * Verifica se um LID é VIP aprovado
 */
export function isVipSubscriber(lid) {
  return getVipSubscriber(lid) !== null;
}

/**
 * Obtém assinantes VIP por stack
 */
export function getSubscribersByStack(stack) {
  const subscribers = getVipSubscribers();
  const stackLower = stack.toLowerCase();

  return subscribers.filter((s) =>
    (s.filters?.stacks || s.stacks || []).some((st) => st.toLowerCase() === stackLower || st.toLowerCase() === "todas")
  );
}

// ======= VIP PENDENTES (Aguardando Aprovação) =======

/**
 * Retorna todos os VIPs pendentes de aprovação
 */
export function getVipPendingSubscribers() {
  return readJSON(VIP_PENDING_FILE, []);
}

/**
 * Busca um pendente pelo LID
 */
export function getVipPendingByLid(lid) {
  const pending = getVipPendingSubscribers();
  return pending.find(p => p.lid === lid && p.status === "pending") || null;
}

/**
 * Busca um pendente pelo número do cliente
 */
export function getVipPendingByNumber(clientNumber) {
  const pending = getVipPendingSubscribers();
  const normalized = clientNumber.replace("@lid", "").replace("@s.whatsapp.net", "");
  return pending.find(p => {
    const pendingNumber = p.lid?.replace("@lid", "").replace("@s.whatsapp.net", "") || "";
    return pendingNumber === normalized && p.status === "pending";
  }) || null;
}

/**
 * Adiciona um cliente como pendente de aprovação VIP
 * NÃO adiciona como VIP aprovado - apenas aguarda confirmação do pagamento
 */
export function addVipPendingSubscriber(name, lid, filtersInput, paymentProof = null) {
  const pending = getVipPendingSubscribers();
  const filters = normalizeVipFilters(filtersInput);
  const stacks = filters.stacks || [];
  const now = new Date().toISOString();

  const idx = pending.findIndex(p => p.lid === lid && p.status === "pending");

  const payload = {
    name: name?.trim() || "",
    lid,
    stacks,
    filters,
    paymentProof,
    status: "pending",
    requestedAt: now,
    decidedAt: null,
    decidedBy: null
  };

  if (idx !== -1) {
    pending[idx] = { ...pending[idx], ...payload, requestedAt: pending[idx].requestedAt || now };
    writeJSON(VIP_PENDING_FILE, pending, []);
    return false;
  }

  pending.push(payload);
  writeJSON(VIP_PENDING_FILE, pending, []);
  return true;
}

/**
 * Atualiza o comprovante de pagamento de um pendente
 */
export function updateVipPendingPaymentProof(lid, paymentProof) {
  const pending = getVipPendingSubscribers();
  const idx = pending.findIndex(p => p.lid === lid && p.status === "pending");
  if (idx === -1) return false;

  pending[idx].paymentProof = paymentProof;
  pending[idx].paymentReceivedAt = new Date().toISOString();
  writeJSON(VIP_PENDING_FILE, pending, []);
  return true;
}

/**
 * Aprova um VIP pendente - move para a lista de aprovados
 */
export function approveVipSubscriber(lid, decidedBy) {
  const pending = getVipPendingSubscribers();
  const idx = pending.findIndex(p => p.lid === lid && p.status === "pending");
  if (idx === -1) return { ok: false, reason: "not_found" };

  const pendingSubscriber = pending[idx];

  pending[idx].status = "approved";
  pending[idx].decidedAt = new Date().toISOString();
  pending[idx].decidedBy = decidedBy || null;
  writeJSON(VIP_PENDING_FILE, pending, []);

  addVipSubscriber(pendingSubscriber.name, pendingSubscriber.lid, pendingSubscriber.filters);

  return {
    ok: true,
    subscriber: {
      name: pendingSubscriber.name,
      lid: pendingSubscriber.lid,
      filters: pendingSubscriber.filters
    }
  };
}

/**
 * Rejeita um VIP pendente
 */
export function rejectVipSubscriber(lid, decidedBy, reason = null) {
  const pending = getVipPendingSubscribers();
  const idx = pending.findIndex(p => p.lid === lid && p.status === "pending");
  if (idx === -1) return { ok: false, reason: "not_found" };

  pending[idx].status = "rejected";
  pending[idx].decidedAt = new Date().toISOString();
  pending[idx].decidedBy = decidedBy || null;
  pending[idx].rejectReason = reason || null;

  writeJSON(VIP_PENDING_FILE, pending, []);

  return { ok: true, subscriber: pending[idx] };
}
