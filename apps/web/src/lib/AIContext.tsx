import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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

interface AIHistoryContextType {
    actions: AIAction[];
    addAction: (action: Omit<AIAction, 'id' | 'timestamp'>) => void;
    clearHistory: () => void;
    getRecentActions: (limit?: number) => AIAction[];
}

const AIHistoryContext = createContext<AIHistoryContextType | null>(null);

export function AIHistoryProvider({ children }: { children: ReactNode }) {
    const [actions, setActions] = useState<AIAction[]>([]);

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

    return (
        <AIHistoryContext.Provider value={{ actions, addAction, clearHistory, getRecentActions }}>
            {children}
        </AIHistoryContext.Provider>
    );
}

export function useAIHistory() {
    const context = useContext(AIHistoryContext);
    if (!context) {
        throw new Error('useAIHistory must be used within AIHistoryProvider');
    }
    return context;
}
