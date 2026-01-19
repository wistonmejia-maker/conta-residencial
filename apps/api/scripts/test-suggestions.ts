import { logAIQuery, getSuggestedQuestions } from '../src/services/ai.service';
import prisma from '../src/lib/prisma';

async function testSuggestions() {
    console.log('--- Testing Chatbot Dynamic Suggestions ---');

    // Use a test unit ID or the actual one we found earlier
    const unitId = '08ce5f2c-97b4-4854-8058-6c17ba2419a4';

    try {
        console.log('Cleaning up old test logs (optional)...');
        // Not cleaning up to preserve production data if this is running against it, 
        // but we will add new queries with unique patterns to verify frequency.

        const testQueries = [
            "¿Cuál es el saldo actual?",
            "¿Cuál es el saldo actual?",
            "¿Cuál es el saldo actual?", // 3 times
            "Ver facturas de este mes",
            "Ver facturas de este mes", // 2 times
            "¿Quién es el proveedor más caro?" // 1 time
        ];

        console.log('Logging test queries...');
        for (const query of testQueries) {
            await logAIQuery(unitId, query, 'CHAT');
        }

        console.log('Fetching suggestions...');
        const suggestions = await getSuggestedQuestions(unitId);

        console.log('Top Suggestions found:');
        console.log(JSON.stringify(suggestions, null, 2));

        // Validation
        if (suggestions[0] === "¿Cuál es el saldo actual?" && suggestions[1] === "Ver facturas de este mes") {
            console.log('✅ Suggestions Logic Verified! (Top frequency matches expected)');
        } else {
            console.log('❌ Suggestions Logic Mismatch. Check frequency calculation.');
            console.log('Expected top: "¿Cuál es el saldo actual?", then "Ver facturas de este mes"');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testSuggestions();
