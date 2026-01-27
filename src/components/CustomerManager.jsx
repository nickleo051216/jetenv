import React, { useState, useEffect, useMemo } from 'react';
import { query, collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Edit, Plus, RotateCcw, Trash2, Search } from 'lucide-react';

import { db, appId } from '../firebase';
import { N8N_MOEA_API_URL } from '../constants';

const CustomerManager = () => {
    const [customers, setCustomers] = useState([]);
    const [form, setForm] = useState({ name: '', taxId: '', contact: '', phone: '', fax: '', address: '', email: '' });
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [duplicateWarning, setDuplicateWarning] = useState(null);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'customers'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(docs);
        });
        return () => unsubscribe();
    }, []);

    // 檢查重複
    const checkDuplicate = (name, taxId) => {
        if (!name && !taxId) {
            setDuplicateWarning(null);
            return;
        }

        const duplicate = customers.find(c => {
            if (editingId && c.id === editingId) return false; // 排除正在編輯的項目
            if (name && c.name && c.name.toLowerCase() === name.toLowerCase()) return true;
            if (taxId && c.taxId && c.taxId === taxId) return true;
            return false;
        });

        if (duplicate) {
            setDuplicateWarning(`⚠️ 發現相似客戶：「${duplicate.name}」(統編: ${duplicate.taxId || '無'})`);
        } else {
            setDuplicateWarning(null);
        }
    };

    // 監聽表單變化檢查重複
    useEffect(() => {
        checkDuplicate(form.name, form.taxId);
    }, [form.name, form.taxId, customers, editingId]);

    // 篩選客戶
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers;
        const lower = searchTerm.toLowerCase();
        return customers.filter(c =>
            String(c.name || '').toLowerCase().includes(lower) ||
            String(c.taxId || '').toLowerCase().includes(lower) ||
            String(c.contact || '').toLowerCase().includes(lower) ||
            String(c.phone || '').toLowerCase().includes(lower) ||
            String(c.address || '').toLowerCase().includes(lower)
        );
    }, [customers, searchTerm]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name) return;

        // 重複警告確認
        if (duplicateWarning && !editingId) {
            if (!confirm(`${duplicateWarning}\n\n確定仍要新增嗎？`)) return;
        }

        if (editingId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', editingId), form);
            setEditingId(null);
        } else {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), form);
        }
        setForm({ name: '', taxId: '', contact: '', phone: '', fax: '', address: '', email: '' });
        setDuplicateWarning(null);
    };

    const handleEdit = (customer) => {
        setForm(customer);
        setEditingId(customer.id);
    };

    const handleCancel = () => {
        setEditingId(null);
        setForm({ name: '', taxId: '', contact: '', phone: '', fax: '', address: '', email: '' });
        setDuplicateWarning(null);
    };

    const handleDelete = async (id) => {
        if (confirm('刪除此客戶？')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', id));
    };

    return (
        <div className="space-y-6 w-full">
            {/* 新增/編輯表單 */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200 w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-teal-800 flex items-center">
                        {editingId ? <Edit className="w-5 h-5 mr-1" /> : <Plus className="w-5 h-5 mr-1" />}
                        {editingId ? '編輯客戶資料' : '新增客戶'}
                    </h3>
                    {editingId && (
                        <button onClick={handleCancel} className="text-xs flex items-center text-gray-500 hover:text-gray-700">
                            <RotateCcw className="w-3 h-3 mr-1" /> 取消編輯
                        </button>
                    )}
                </div>

                {/* 重複警告 */}
                {duplicateWarning && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                        {duplicateWarning}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input className="input-std md:col-span-2" placeholder="公司名稱 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    <div className="flex gap-2 items-center">
                        <input className="input-std flex-1" placeholder="統一編號 (8碼)" value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} maxLength={8} />
                        <button
                            type="button"
                            onClick={async () => {
                                if (!form.taxId || form.taxId.length !== 8) {
                                    alert('請輸入正確的 8 碼統編');
                                    return;
                                }
                                try {
                                    const res = await fetch(`${N8N_MOEA_API_URL}?taxId=${form.taxId}`);
                                    const data = await res.json();
                                    if (data.found && data.data) {
                                        setForm(prev => ({
                                            ...prev,
                                            name: data.data.name || prev.name,
                                            address: data.data.address || prev.address,
                                            contact: data.data.representative || prev.contact
                                        }));
                                        alert(`✅ 已帶入：${data.data.name}`);
                                    } else {
                                        alert('❌ 查無此統編資料');
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert('查詢失敗，請稍後再試');
                                }
                            }}
                            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm whitespace-nowrap"
                        >
                            🔍 查詢
                        </button>
                    </div>
                    <input className="input-std" placeholder="聯絡人" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
                    <input className="input-std" placeholder="電話" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                    <input className="input-std" placeholder="傳真" value={form.fax} onChange={e => setForm({ ...form, fax: e.target.value })} />
                    <input className="input-std md:col-span-2" placeholder="地址" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                    <input className="input-std md:col-span-4" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    <button className={`text-white py-2 px-4 rounded md:col-span-4 transition-colors ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-600 hover:bg-teal-700'}`}>
                        {editingId ? '更新資料' : '新增'}
                    </button>
                </form>
            </div>

            {/* 搜尋與統計 */}
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                    <div className="relative w-full md:w-64">
                        <input
                            type="text"
                            placeholder="搜尋客戶名稱、統編、聯絡人..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    </div>
                    <div className="text-sm text-gray-500">
                        共 <span className="font-bold text-teal-600">{filteredCustomers.length}</span> 位客戶
                        {searchTerm && ` (篩選自 ${customers.length} 筆)`}
                    </div>
                </div>
            </div>

            {/* 客戶列表 */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200 w-full">
                <table className="min-w-full divide-y divide-gray-200 w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">公司 / 統編</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">聯絡資訊</th>
                            <th className="px-4 py-3 text-right w-24"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredCustomers.map(c => (
                            <tr key={c.id} className={editingId === c.id ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                                <td className="px-4 py-3">
                                    <div className="font-bold text-gray-900">{c.name}</div>
                                    <div className="text-xs text-gray-500">{c.taxId || '(無統編)'}</div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                    <div>{c.contact} / {c.phone}</div>
                                    <div className="text-xs text-gray-400 truncate max-w-xs">{c.address}</div>
                                    {c.email && <div className="text-xs text-teal-600">📧 {c.email}</div>}
                                </td>
                                <td className="px-4 py-3 text-right space-x-2">
                                    <button onClick={() => handleEdit(c)} className="text-gray-400 hover:text-orange-500 p-1"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                        {filteredCustomers.length === 0 && (
                            <tr>
                                <td colSpan="3" className="px-4 py-8 text-center text-gray-500">
                                    {searchTerm ? '沒有符合搜尋條件的客戶' : '尚無客戶資料'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <style>{`.input-std { @apply border-gray-300 rounded text-sm focus:ring-teal-500 focus:border-teal-500 w-full; }`}</style>
        </div>
    );
};

export default CustomerManager;
