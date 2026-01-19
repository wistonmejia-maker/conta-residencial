const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps/api/src/services/ai.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const functions = [
    { name: 'classifyAndExtractDocument', type: 'CLASSIFICATION', unitVar: 'unitId' },
    { name: 'extractBankTransactions', type: 'CLASSIFICATION', unitVar: 'undefined' },
    { name: 'matchBankMovements', type: 'CLASSIFICATION', unitVar: 'undefined' },
    { name: 'generateMonthlyInsights', type: 'INSIGHTS', unitVar: 'undefined' },
    { name: 'answerFinancialQuery', type: 'CHAT', unitVar: 'undefined' },
    { name: 'analyzeReportData', type: 'INSIGHTS', unitVar: 'undefined' },
    { name: 'extractBudgetFromDocument', type: 'CLASSIFICATION', unitVar: 'undefined' },
    { name: 'analyzeBudgetDeeply', type: 'INSIGHTS', unitVar: 'undefined' }
];

functions.forEach(fn => {
    const startPattern = `export async function ${fn.name}`;
    const startIndex = content.indexOf(startPattern);
    if (startIndex === -1) return;

    // Find first { and last } of the function
    let braceCount = 0;
    let foundFirstBrace = false;
    let functionBodyStart = -1;
    let functionBodyEnd = -1;

    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
            if (!foundFirstBrace) {
                foundFirstBrace = true;
                functionBodyStart = i + 1;
            }
            braceCount++;
        } else if (content[i] === '}') {
            braceCount--;
            if (foundFirstBrace && braceCount === 0) {
                functionBodyEnd = i;
                break;
            }
        }
    }

    if (functionBodyStart !== -1 && functionBodyEnd !== -1) {
        let body = content.substring(functionBodyStart, functionBodyEnd);

        // Wrap body in try/catch if not already
        if (!body.includes('try {')) {
            const wrappedBody = `
    try {${body}
    } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        await TelemetryService.logGeminiMetric({
            unitId: ${fn.unitVar},
            modelName: 'gemini-2.0-flash',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs,
            status: 'ERROR',
            errorMessage: error.message,
            requestType: '${fn.type}'
        });
        logger.error('Error in ${fn.name}', { error: error.message, stack: error.stack });
        throw error;
    }`;
            content = content.substring(0, functionBodyStart) + wrappedBody + content.substring(functionBodyEnd);
        }
    }
});

fs.writeFileSync(filePath, content);
console.log('Error telemetry integration complete!');
