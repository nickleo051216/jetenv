import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

// --- 可搜尋的客戶選擇元件 ---
const SearchableClientSelect = ({ customers, onSelect, placeholder = "搜尋客戶名稱或統編..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    // 過濾客戶列表 (支援名稱、統編搜尋)
    const filteredCustomers = useMemo(() => {
        if (!search) return customers;
        const lowerSearch = search.toLowerCase();
        return customers.filter(c =>
            c.name?.toLowerCase().includes(lowerSearch) ||
            String(c.taxId || '').includes(search)
        );
    }, [customers, search]);

    // 點擊外部關閉下拉選單
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (customer) => {
        onSelect(customer);
        setIsOpen(false);
        setSearch('');
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    className="w-full text-xs border-gray-300 rounded py-1 pl-2 pr-8 shadow-sm focus:border-teal-500 focus:ring-teal-500"
                />
                <ChevronDown
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
                    {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">
                            {search ? '查無符合的客戶' : '尚無客戶資料'}
                        </div>
                    ) : (
                        filteredCustomers.map(c => (
                            <div
                                key={c.id}
                                onClick={() => handleSelect(c)}
                                className="px-3 py-2 cursor-pointer hover:bg-teal-50 transition-colors border-b border-gray-100 last:border-b-0"
                            >
                                <div className="text-sm font-medium text-gray-900">{c.name}</div>
                                <div className="text-xs text-gray-500 flex gap-2">
                                    {c.taxId && <span>統編：{c.taxId}</span>}
                                    {c.contact && <span>• {c.contact}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableClientSelect;
