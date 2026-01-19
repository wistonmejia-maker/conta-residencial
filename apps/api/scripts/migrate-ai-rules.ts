import { AIRulesService } from '../src/services/aiRules.service';
import prisma from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script de migración: AI_RULES.md → Base de Datos
 * Spec v3.0 - Feedback de IA Dinámico
 * 
 * Este script migra las reglas existentes en AI_RULES.md a la tabla ai_feedback
 * para todas las unidades del sistema.
 */

async function migrateAIRules() {
    console.log('🔄 Iniciando migración de AI_RULES.md a base de datos...\n');

    // Leer AI_RULES.md (usar ruta absoluta)
    const rulesPath = 'c:/Users/MejIA/Documents/Proyectos Saas MejIA/conta_residencial_repo/AI_RULES.md';

    if (!fs.existsSync(rulesPath)) {
        console.error('❌ No se encontró AI_RULES.md en:', rulesPath);
        process.exit(1);
    }

    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    // Extraer reglas del archivo (parseo simple)
    // Buscar líneas que empiecen con - o * y tengan contenido significativo
    const rules = rulesContent
        .split('\n')
        .filter(line => {
            const trimmed = line.trim();
            return (trimmed.startsWith('-') || trimmed.startsWith('*')) &&
                !trimmed.includes('**') && // Excluir headers markdown
                trimmed.length > 10;
        })
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(rule => rule.length > 10);

    console.log(`📝 Encontradas ${rules.length} reglas en AI_RULES.md:\n`);
    rules.forEach((rule, idx) => {
        console.log(`   ${idx + 1}. ${rule.substring(0, 80)}${rule.length > 80 ? '...' : ''}`);
    });
    console.log('');

    // Obtener todas las unidades
    const units = await prisma.unit.findMany({
        select: { id: true, name: true }
    });

    console.log(`🏢 Migrando reglas a ${units.length} unidades...\n`);

    let totalMigrated = 0;

    for (const unit of units) {
        try {
            await AIRulesService.migrateRulesFromFile(unit.id, rules);
            console.log(`  ✅ ${unit.name} (${rules.length} reglas)`);
            totalMigrated += rules.length;
        } catch (error: any) {
            console.error(`  ❌ ${unit.name}: ${error.message}`);
        }
    }

    console.log(`\n✨ Migración completada!`);
    console.log(`📊 Total de reglas migradas: ${totalMigrated}`);
    console.log(`\n⚠️  IMPORTANTE: Actualiza AI_RULES.md con el disclaimer de deprecación`);
    console.log(`   Ver: docs/implementation_plan_v3.md (Sección 1.2.5)`);
}

migrateAIRules()
    .catch((error) => {
        console.error('💥 Error fatal durante la migración:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
