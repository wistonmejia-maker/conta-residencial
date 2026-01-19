import { classifyAndExtractDocument } from '../src/services/ai.service';
import prisma from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function testTelemetry() {
    console.log('--- Testing Gemini Telemetry ---');

    // Use a dummy image buffer for classification test
    const dummyBuffer = Buffer.from('dummy data');
    const unitId = '08ce5f2c-97b4-4854-8058-6c17ba2419a4'; // Valid ID from DB

    try {
        console.log('Sending test request to Gemini...');
        const result = await classifyAndExtractDocument(dummyBuffer, 'image/jpeg', unitId);
        console.log('AI Result:', JSON.stringify(result, null, 2));

        console.log('Checking database for metrics...');
        const metrics = await (prisma as any).geminiMetric.findMany({
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        if (metrics.length > 0) {
            console.log('✅ Telemetry Success! Found metric record:');
            console.log(JSON.stringify(metrics[0], null, 2));
        } else {
            console.log('❌ Telemetry Error: No metric record found in database.');
        }
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testTelemetry();
