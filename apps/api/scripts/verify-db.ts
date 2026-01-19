import prisma from '../src/lib/prisma';

async function verifyDB() {
    console.log('🔍 Verificando base de datos...\n');

    try {
        // 1. Verificar registros en AIFeedback
        const totalRules = await prisma.aIFeedback.count();
        const migratedRules = await prisma.aIFeedback.count({
            where: { comment: 'Migrado desde AI_RULES.md' }
        });

        console.log(`📊 Reglas AI totales en DB: ${totalRules}`);
        console.log(`📊 Reglas migradas desde archivo: ${migratedRules}`);

        // 2. Verificar campo version
        const firstRule = await prisma.aIFeedback.findFirst();
        if (firstRule) {
            console.log(`✅ Campo 'version' detectado: ${firstRule.version !== undefined ? 'Sí' : 'No'}`);
            console.log(`✅ Valor de versión: ${firstRule.version}`);
        } else {
            console.log('⚠️ No hay reglas en la base de datos para verificar.');
        }

        // 3. Verificar unidades
        const unitsCount = await prisma.unit.count();
        console.log(`🏢 Unidades registradas: ${unitsCount}`);

        console.log('\n✨ Verificación de DB completada.');
    } catch (error: any) {
        console.error('❌ Error durante la verificación:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

verifyDB();
