import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assetsDir = path.resolve(__dirname, "../dist/client/assets");

console.log("🔍 Iniciando auditoría de seguridad en bundle de producción:", assetsDir);

if (!fs.existsSync(assetsDir)) {
  console.error("❌ Directorio de assets no encontrado. Ejecuta npm run build:client primero.");
  process.exit(1);
}

const suspiciousPatterns = [
  { name: "Anthropic Secret Key", regex: /sk-ant-[a-zA-Z0-9_\-]{20,}/i },
  { name: "Supabase Service Role Key", regex: /service_role/i },
  { name: "GitHub Personal Token", regex: /gh[pousr]_[a-zA-Z0-9]{36,}/i },
  { name: "WhatsApp / Meta Token", regex: /EAAG[a-zA-Z0-9]{30,}/i },
  { name: "Wompi Private Key", regex: /prv_[a-zA-Z0-9_\-]{10,}/i },
  { name: "Resend Secret Key", regex: /re_[a-zA-Z0-9_\-]{20,}/i },
  { name: "Bearer Token Pattern", regex: /Bearer\s+[a-zA-Z0-9_\-\.]{25,}/i },
];

let leaksFound = 0;
const files = fs.readdirSync(assetsDir);

for (const file of files) {
  const filePath = path.join(assetsDir, file);
  const content = fs.readFileSync(filePath, "utf8");

  console.log(`  📄 Auditando ${file} (${(content.length / 1024).toFixed(1)} KB)...`);

  for (const pattern of suspiciousPatterns) {
    if (pattern.regex.test(content)) {
      console.error(`🚨 ALERTA: Patrón sospechoso detectado '${pattern.name}' en archivo: ${file}`);
      leaksFound++;
    }
  }
}

if (leaksFound === 0) {
  console.log("✅ AUDITORÍA EXITOSA: Cero secretos o llaves privadas detectadas en el bundle del frontend.");
  process.exit(0);
} else {
  console.error(`❌ FALLO DE AUDITORÍA: Se detectaron ${leaksFound} posibles fugas de secretos.`);
  process.exit(1);
}
