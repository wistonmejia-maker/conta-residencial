import { createContext, useContext, useState, useCallback, type ReactNode, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { scanGmail, getScanStatus } from './api/gmail';

export interface AIAction {
    id: string;
    timestamp: Date;
    type: 'match' | 'extract' | 'analyze' | 'chat' | 'scan';
    page: string;
    description: string;
    itemsAffected: number;
    success: boolean;
    details?: string;
}

interface ScanState {
    jobId: string | null;
    unitId: string | null;
    status: 'IDLE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress: number;
    message: string;
    minimized: boolean;
    totalEmails: number;
    processedEmails: number;
}

interface AIContextType {
    // History
    actions: AIAction[];
    addAction: (action: Omit<AIAction, 'id' | 'timestamp'>) => void;
    clearHistory: () => void;
    getRecentActions: (limit?: number) => AIAction[];

    // Scanning
    scanState: ScanState;
    startBackgroundScan: (unitId: string) => Promise<void>;
    minimizeScanUI: () => void;
    maximizeScanUI: () => void;
    dismissScanUI: () => void;
}

const AIHistoryContext = createContext<AIContextType | null>(null);

export function AIHistoryProvider({ children }: { children: ReactNode }) {
    const [actions, setActions] = useState<AIAction[]>([]);
    const queryClient = useQueryClient();

    // Global Scan State
    const [scanState, setScanState] = useState<ScanState>({
        jobId: null,
        unitId: null,
        status: 'IDLE',
        progress: 0,
        message: '',
        minimized: false,
        totalEmails: 0,
        processedEmails: 0
    });

    const addAction = useCallback((action: Omit<AIAction, 'id' | 'timestamp'>) => {
        const id = 'ai-' + Date.now() + '-' + Math.random().toString(36).substring(7);
        const newAction: AIAction = {
            ...action,
            id,
            timestamp: new Date()
        };
        setActions(prev => [newAction, ...prev].slice(0, 50));
    }, []);

    const clearHistory = useCallback(() => {
        setActions([]);
    }, []);

    const getRecentActions = useCallback((limit = 10) => {
        return actions.slice(0, limit);
    }, [actions]);

    // Scanning Logic
    const startBackgroundScan = useCallback(async (unitId: string) => {
        setScanState({
            jobId: null,
            unitId: unitId,
            status: 'PENDING',
            progress: 0,
            message: 'Iniciando escaneo...',
            minimized: false,
            totalEmails: 0,
            processedEmails: 0
        });

        try {
            const res = await scanGmail(unitId);
            if (res.jobId) {
                setScanState(prev => ({ ...prev, jobId: res.jobId, status: 'PROCESSING', message: 'Conectando con Gmail...' }));
            } else {
                setScanState(prev => ({ ...prev, status: 'FAILED', message: 'No se obtuvo ID del trabajo.' }));
            }
        } catch (error) {
            console.error(error);
            setScanState(prev => ({ ...prev, status: 'FAILED', message: 'Error al iniciar escaneo.' }));
        }
    }, []);

    const minimizeScanUI = useCallback(() => setScanState(prev => ({ ...prev, minimized: true })), []);
    const maximizeScanUI = useCallback(() => setScanState(prev => ({ ...prev, minimized: false })), []);
    const dismissScanUI = useCallback(() => setScanState(prev => ({ ...prev, jobId: null, unitId: null, status: 'IDLE' })), []);

    // Polling Effect
    useEffect(() => {
        if (!scanState.jobId || scanState.status === 'COMPLETED' || scanState.status === 'FAILED') return;

        const interval = setInterval(async () => {
            try {
                const status = await getScanStatus(scanState.jobId!);

                if (status.status === 'PROCESSING') {
                    setScanState(prev => ({
                        ...prev,
                        status: 'PROCESSING',
                        progress: status.progress,
                        totalEmails: status.totalItems,
                        processedEmails: status.processedCount,
                        message: `Procesando correos (${status.processedCount}/${status.totalItems || '?'})`
                    }));
                } else if (status.status === 'COMPLETED') {
                    setScanState(prev => ({
                        ...prev,
                        status: 'COMPLETED',
                        progress: 100,
                        message: `¡Escaneo completado! Procesados: ${status.processedCount}`,
                        processedEmails: status.processedCount
                    }));

                    // Refresh unit data to update Last Scan indicator
                    queryClient.invalidateQueries({ queryKey: ['units'] });

                    // Log to history
                    addAction({
                        type: 'scan',
                        page: 'Invoices',
                        description: `Escaneo de Gmail completado. ${status.processedCount} items procesados.`,
                        itemsAffected: status.processedCount,
                        success: true
                    });
                } else if (status.status === 'FAILED') {
                    setScanState(prev => ({
                        ...prev,
                        status: 'FAILED',
                        message: `Error: ${status.error}`
                    }));
                    addAction({
                        type: 'scan',
                        page: 'Invoices',
                        description: `Escaneo de Gmail fallido.`,
                        itemsAffected: 0,
                        success: false,
                        details: status.error
                    });
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [scanState.jobId, scanState.status, addAction]);

    return (
        <AIHistoryContext.Provider value={{ actions, addAction, clearHistory, getRecentActions, scanState, startBackgroundScan, minimizeScanUI, maximizeScanUI, dismissScanUI }}>
            {children}
        </AIHistoryContext.Provider>
    );
}

export function useAI() {
    const context = useContext(AIHistoryContext);
    if (!context) {
        throw new Error('useAI must be used within AIProvider');
    }
    return context;
}

export const useAIHistory = useAI;
