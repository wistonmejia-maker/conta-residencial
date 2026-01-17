import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUnits } from './api'

export interface Unit {
    id: string
    name: string
    address?: string
    logoUrl?: string
    taxId?: string
    defaultPaymentType?: string
}

interface UnitContextType {
    units: Unit[]
    selectedUnit: Unit | null
    setSelectedUnit: (unit: Unit) => void
    isLoading: boolean
}

const UnitContext = createContext<UnitContextType | undefined>(undefined)

export function UnitProvider({ children }: { children: ReactNode }) {
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)

    // Use React Query for units list
    const { data: unitsData, isLoading } = useQuery({
        queryKey: ['units'],
        queryFn: getUnits
    })

    const unitsList = (unitsData as any)?.units || []

    useEffect(() => {
        if (!isLoading && unitsList.length > 0) {
            const savedUnitId = localStorage.getItem('selectedUnitId')
            const savedUnit = unitsList.find((u: Unit) => u.id === savedUnitId)

            if (savedUnit) {
                // Ensure the selected unit has the latest data from the list
                setSelectedUnit(savedUnit)
            } else if (!selectedUnit) {
                // Initial load, no selection yet
                setSelectedUnit(unitsList[0])
                localStorage.setItem('selectedUnitId', unitsList[0].id)
            }
        }
        else if (!isLoading && unitsList.length === 0) {
            setSelectedUnit(null)
            localStorage.removeItem('selectedUnitId')
        }
    }, [unitsList, isLoading])

    const handleSetSelectedUnit = (unit: Unit) => {
        setSelectedUnit(unit)
        localStorage.setItem('selectedUnitId', unit.id)
    }

    return (
        <UnitContext.Provider value={{
            units: unitsList,
            selectedUnit,
            setSelectedUnit: handleSetSelectedUnit,
            isLoading
        }}>
            {children}
        </UnitContext.Provider>
    )
}

export function useUnit() {
    const context = useContext(UnitContext)
    if (context === undefined) {
        throw new Error('useUnit must be used within a UnitProvider')
    }
    return context
}
