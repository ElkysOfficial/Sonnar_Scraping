/**
 * Logs
 *
 * @author Dev Gui
 */
import pkg from "../../package.json" with { type: "json" };
import { LOG_LEVEL } from "../config.js";

const PURPLE = "\x1b[38;5;54m";
const RESET = "\x1b[0m";

const LOG_LEVELS = {
  talk: 10,
  input: 20,
  info: 30,
  success: 40,
  warning: 50,
  error: 60,
  none: 100
};

const CURRENT_LEVEL = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.success;

function shouldLog(level) {
  return LOG_LEVELS[level] >= CURRENT_LEVEL;
}


export function sayLog(message) {
  if (shouldLog('talk')) {
    console.log("\x1b[36m[Sonar Bot | TALK]\x1b[0m", message);
  }
}

export function inputLog(message) {
  if (shouldLog('input')) {
    console.log("\x1b[30m[Sonar Bot | INPUT]\x1b[0m", message);
  }
}

export function infoLog(message) {
  if (shouldLog('info')) {
    console.log(`${PURPLE}[Sonar Bot | INFO]${RESET}`, message);
  }
}

export function infoLogAlways(message) {
  console.log(`${PURPLE}[Sonar Bot | INFO]${RESET}`, message);
}

export function successLog(message) {
  if (shouldLog('success')) {
    console.log("\x1b[32m[Sonar Bot | SUCCESS]\x1b[0m", message);
  }
}

export function errorLog(message) {
  if (shouldLog('error')) {
    console.log("\x1b[31m[Sonar Bot | ERROR]\x1b[0m", message);
  }
}

export function warningLog(message) {
  if (shouldLog('warning')) {
    console.log("\x1b[33m[Sonar Bot | WARNING]\x1b[0m", message);
  }
}

export function bannerLog() {
  console.log(`${PURPLE}  ____   ___  _   _    _    ____     ____   ___ _____${RESET}`);
  console.log(`${PURPLE} / ___| / _ \\| \\ | |  / \\  |  _ \\   | __ ) / _ \\_   _|${RESET}`);
  console.log(`${PURPLE} \\___ \\| | | |  \\| | / _ \\ | |_) |  |  _ \\| | | || |${RESET}`);
  console.log(`${PURPLE}  ___) | |_| | |\\  |/ ___ \\|  _ <   | |_) | |_| || |${RESET}`);
  console.log(`${PURPLE} |____/ \\___/|_| \\_/_/   \\_\\_| \\_\\  |____/ \\___/ |_|${RESET}`);
  console.log(`${PURPLE}-- Versao: ${RESET}${pkg.version}\n`);
}
