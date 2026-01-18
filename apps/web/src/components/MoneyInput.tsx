import React, { useState, useEffect } from 'react';
import { formatInputMoney, parseInputMoney } from '../lib/format';

interface MoneyInputProps {
    value: number | string;
    onChange: (value: number) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    id?: string;
    name?: string;
    required?: boolean;
}

/**
 * Money Input Component with onBlur formatting
 * 
 * - While typing: shows raw numbers
 * - On blur: formats with thousands separator (e.g., 157.005)
 * - On focus: shows raw value for easy editing
 * - Stores numeric value internally
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({
    value,
    onChange,
    placeholder = '0',
    className = '',
    disabled = false,
    id,
    name,
    required = false
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Sync display value when external value changes
    useEffect(() => {
        if (!isFocused) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            setDisplayValue(numValue && numValue > 0 ? formatInputMoney(numValue) : '');
        }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;

        // Allow only numbers and separators
        const cleaned = rawValue.replace(/[^\d.,]/g, '');
        setDisplayValue(cleaned);

        // Parse and notify parent
        const numericValue = parseInputMoney(cleaned);
        onChange(numericValue);
    };

    const handleFocus = () => {
        setIsFocused(true);
        // Show raw number for easier editing
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (numValue && numValue > 0) {
            setDisplayValue(numValue.toString());
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
        // Format on blur
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        setDisplayValue(numValue && numValue > 0 ? formatInputMoney(numValue) : '');
    };

    return (
        <input
            type="text"
            inputMode="numeric"
            id={id}
            name={name}
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={className}
        />
    );
};

export default MoneyInput;
