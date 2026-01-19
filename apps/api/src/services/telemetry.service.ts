import prisma from '../lib/prisma';
import logger from '../lib/logger';

export interface GeminiMetricData {
    unitId?: string;
    modelName: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    status: 'SUCCESS' | 'ERROR';
    errorMessage?: string;
    requestType: 'CLASSIFICATION' | 'INSIGHTS' | 'CHAT' | 'BUDGET_ANALYSIS' | 'GENERAL';
}

/**
 * Service for collecting and persisting AI performance and cost metrics (Spec v3.0 - Phase 2.2)
 */
export class TelemetryService {
    /**
     * Persists a Gemini API call metric to the database
     */
    static async logGeminiMetric(data: GeminiMetricData): Promise<void> {
        try {
            await (prisma as any).geminiMetric.create({
                data: {
                    unitId: data.unitId,
                    modelName: data.modelName,
                    promptTokens: data.promptTokens,
                    completionTokens: data.completionTokens,
                    totalTokens: data.totalTokens,
                    latencyMs: data.latencyMs,
                    status: data.status,
                    errorMessage: data.errorMessage,
                    requestType: data.requestType
                }
            });

            // Log for visibility in Winston as well
            logger.info('Gemini Metric Logged', {
                type: data.requestType,
                model: data.modelName,
                tokens: data.totalTokens,
                latency: `${data.latencyMs}ms`,
                unitId: data.unitId,
                status: data.status
            });
        } catch (error: any) {
            // Non-critical error, we don't want to break the main flow for telemetry
            logger.error('Failed to log Gemini metric', {
                error: error.message,
                metricData: data
            });
        }
    }
}
