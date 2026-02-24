import React, { useState, useEffect } from 'react';

const SmartSelect = ({ label, options, value, onChange, placeholder = "手動輸入...", isPrintMode }) => {
    const isCustom = !options.includes(value) && value !== '';
    const [mode, setMode] = useState(isCustom ? 'custom' : 'select');

    useEffect(() => {
        if (!options.includes(value) && value !== '') {
            setMode('custom');
        } else if (options.includes(value)) {
            setMode('select');
        }
    }, [value, options]);

    if (isPrintMode) {
        return (
            <div className="w-full mb-2">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
                <div className="text-sm text-gray-900 font-medium pl-1">{value || '-'}</div>
            </div>
        );
    }

    const handleSelectChange = (e) => {
        const val = e.target.value;
        if (val === 'OTHER_CUSTOM') {
            setMode('custom');
            onChange('');
        } else {
            setMode('select');
            onChange(val);
        }
    };

    return (
        <div className="w-full">
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{label}</label>
            {mode === 'select' ? (
                <select
                    className="w-full text-sm border-gray-200 rounded bg-gray-50 px-2 py-2 focus:ring-teal-500 focus:border-teal-500"
                    value={value}
                    onChange={handleSelectChange}
                >
                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    <option value="OTHER_CUSTOM">其他 (手動輸入)...</option>
                </select>
            ) : (
                <div className="flex gap-2">
                    <input
                        className="flex-1 text-sm border-teal-500 ring-1 ring-teal-500 rounded bg-white px-2 py-2 focus:ring-teal-600"
                        value={value}
                        placeholder={placeholder}
                        onChange={(e) => onChange(e.target.value)}
                        autoFocus
                    />
                    <button
                        onClick={() => { setMode('select'); onChange(options[0]); }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                    >
                        取消
                    </button>
                </div>
            )}
        </div>
    );
};

export default SmartSelect;
