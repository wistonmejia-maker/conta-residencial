import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

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

const API_BASE = '/api'

export function UnitProvider({ children }: { children: ReactNode }) {
    const [units, setUnits] = useState<Unit[]>([])
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchUnits() {
            try {
                const res = await fetch(`${API_BASE}/units`)
                const data = await res.json()
                const unitList = data.units || data || []
                setUnits(unitList)

                // Select first unit by default or from localStorage
                const savedUnitId = localStorage.getItem('selectedUnitId')
                const savedUnit = unitList.find((u: Unit) => u.id === savedUnitId)

                if (savedUnit) {
                    setSelectedUnit(savedUnit)
                } else if (unitList.length > 0) {
                    // Saved unit doesn't exist anymore, use first unit
                    setSelectedUnit(unitList[0])
                    localStorage.setItem('selectedUnitId', unitList[0].id)
                } else {
                    // No units exist, clear localStorage
                    setSelectedUnit(null)
                    localStorage.removeItem('selectedUnitId')
                }
            } catch (error) {
                console.error('Error fetching units:', error)
            } finally {
                setIsLoading(false)
            }
        }
        fetchUnits()
    }, [])

    const handleSetSelectedUnit = (unit: Unit) => {
        setSelectedUnit(unit)
        localStorage.setItem('selectedUnitId', unit.id)
    }

    return (
        <UnitContext.Provider value={{ units, selectedUnit, setSelectedUnit: handleSetSelectedUnit, isLoading }}>
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
