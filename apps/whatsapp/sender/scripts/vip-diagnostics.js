import { runVipDiagnostics } from "../src/services/vipJobSender.js"

const lids = process.argv.slice(2)

if (lids.length === 0) {
  console.log("Uso: node ./scripts/vip-diagnostics.js <lid1> <lid2> ...")
  process.exit(1)
}

for (const lid of lids) {
  // Executa sequencialmente para nao sobrecarregar o banco
  const result = await runVipDiagnostics(lid)
  console.log(JSON.stringify(result, null, 2))
}
