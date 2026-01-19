const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps/api/src/services/ai.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Helper to insert telemetry log
function getTelemetryLog(type, unitIdVar = 'unitId') {
    return `
    const latencyMs = Date.now() - startTime;
    const usage = result.response.usageMetadata;

    await TelemetryService.logGeminiMetric({
        unitId: ${unitIdVar},
        modelName: 'gemini-2.0-flash',
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
        latencyMs,
        status: 'SUCCESS',
        requestType: '${type}'
    });`;
}

// 1. matchBankMovements
if (content.includes('export async function matchBankMovements')) {
    const reg = /(const result = await model\.generateContent\(prompt\);)(\s+)(const text = result\.response\.text\(\);)/;
    const telemetry = getTelemetryLog('CLASSIFICATION', 'undefined');
    content = content.replace(reg, `$1${telemetry}$2$3`);
}

// 2. generateMonthlyInsights
if (content.includes('export async function generateMonthlyInsights')) {
    content = content.replace('const model = genAI.getGenerativeModel({', 'const startTime = Date.now();\n    const model = genAI.getGenerativeModel({');
    const reg = /(const result = await model\.generateContent\(prompt\);)(\s+)(const text = result\.response\.text\(\);)/;
    const telemetry = getTelemetryLog('INSIGHTS');
    content = content.replace(reg, `$1${telemetry}$2$3`);
}

// 3. answerFinancialQuery
if (content.includes('export async function answerFinancialQuery')) {
    content = content.replace('const model = genAI.getGenerativeModel({', 'const startTime = Date.now();\n    const model = genAI.getGenerativeModel({');
    const reg = /(const result = await model\.generateContent\(prompt\);)(\s+)(return result\.response\.text\(\);)/;
    const telemetry = getTelemetryLog('CHAT', 'undefined');
    content = content.replace(reg, `$1${telemetry}$2$3`);
}

// 4. analyzeReportData
if (content.includes('export async function analyzeReportData')) {
    content = content.replace('const model = genAI.getGenerativeModel({', 'const startTime = Date.now();\n    const model = genAI.getGenerativeModel({');
    const reg = /(const result = await model\.generateContent\(prompt\);)(\s+)(return result\.response\.text\(\);)/;
    const telemetry = getTelemetryLog('INSIGHTS', 'undefined');
    content = content.replace(reg, `$1${telemetry}$2$3`);
}

// 5. extractBudgetFromDocument
if (content.includes('export async function extractBudgetFromDocument')) {
    content = content.replace('const model = genAI.getGenerativeModel({', 'const startTime = Date.now();\n    const model = genAI.getGenerativeModel({');
    const reg = /(const result = await model\.generateContent\(\[[\s\S]*?\]\);)(\s+)(const text = result\.response\.text\(\);)/;
    const telemetry = getTelemetryLog('CLASSIFICATION', 'undefined');
    content = content.replace(reg, `$1${telemetry}$2$3`);
}

// 6. analyzeBudgetDeeply
if (content.includes('export async function analyzeBudgetDeeply')) {
    content = content.replace('const model = genAI.getGenerativeModel({', 'const startTime = Date.now();\n    const model = genAI.getGenerativeModel({');
    const reg = /(const result = await model\.generateContent\(prompt\);)(\s+)(const text = result\.response\.text\(\);)/;
    const telemetry = getTelemetryLog('INSIGHTS', 'undefined');
    content = content.replace(reg, `$1${telemetry}$2$3`);
}

fs.writeFileSync(filePath, content);
console.log('Telemetry integration complete!');
