/**
 * Logs
 *
 * @author Dev Gui
 */
import pkg from "../../package.json" with { type: "json" };

export function sayLog(message) {
  console.log("\x1b[36m[Sonar Bot | TALK]\x1b[0m", message);
}

export function inputLog(message) {
  console.log("\x1b[30m[Sonar Bot | INPUT]\x1b[0m", message);
}

export function infoLog(message) {
  console.log("\x1b[34m[Sonar Bot | INFO]\x1b[0m", message);
}

export function successLog(message) {
  console.log("\x1b[32m[Sonar Bot | SUCCESS]\x1b[0m", message);
}

export function errorLog(message) {
  console.log("\x1b[31m[Sonar Bot | ERROR]\x1b[0m", message);
}

export function warningLog(message) {
  console.log("\x1b[33m[Sonar Bot | WARNING]\x1b[0m", message);
}

export function bannerLog() {
  console.log(`\x1b[36m░▀█▀░█▀█░█░█░█▀▀░█▀▀░█░█░▀█▀░░█▀▄░█▀█░▀█▀\x1b[0m`);
  console.log(`░░█░░█▀█░█▀▄░█▀▀░▀▀█░█▀█░░█░░░█▀▄░█░█░░█░`);
  console.log(`\x1b[36m░░▀░░▀░▀░▀░▀░▀▀▀░▀▀▀░▀░▀░▀▀▀░░▀▀░░▀▀▀░░▀░\x1b[0m`);
  console.log(`\x1b[36m🤖 Versão: \x1b[0m${pkg.version}\n`);
}
