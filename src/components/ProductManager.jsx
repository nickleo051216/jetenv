import React, { useState, useEffect, useMemo } from 'react';
import { query, collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Edit, Package, RotateCcw, Trash2, Search, Copy } from 'lucide-react';

import { db, appId } from '../firebase';

const ProductManager = () => {
    const [products, setProducts] = useState([]);
    const [form, setForm] = useState({ name: '', spec: '', unit: '式', price: 0 });
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [duplicateWarning, setDuplicateWarning] = useState(null);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'products'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(docs);
        });
        return () => unsubscribe();
    }, []);

    // 檢查重複
    const checkDuplicate = (name) => {
        if (!name) {
            setDuplicateWarning(null);
            return;
        }

        const duplicate = products.find(p => {
            if (editingId && p.id === editingId) return false; // 排除正在編輯的項目
            return p.name && p.name.toLowerCase() === name.toLowerCase();
        });

        if (duplicate) {
            setDuplicateWarning(`⚠️ 發現相同名稱：「${duplicate.name}」(單價: NT$${duplicate.price}/${duplicate.unit})`);
        } else {
            setDuplicateWarning(null);
        }
    };

    // 監聽表單變化檢查重複
    useEffect(() => {
        checkDuplicate(form.name);
    }, [form.name, products, editingId]);

    // 篩選產品
    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products;
        const lower = searchTerm.toLowerCase();
        return products.filter(p =>
            String(p.name || '').toLowerCase().includes(lower) ||
            String(p.spec || '').toLowerCase().includes(lower) ||
            String(p.unit || '').toLowerCase().includes(lower)
        );
    }, [products, searchTerm]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name) return;

        // 重複警告確認
        if (duplicateWarning && !editingId) {
            if (!confirm(`${duplicateWarning}\n\n確定仍要新增嗎？`)) return;
        }

        const payload = { ...form, price: Number(form.price) };

        if (editingId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', editingId), payload);
            setEditingId(null);
        } else {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), payload);
        }
        setForm({ name: '', spec: '', unit: '式', price: 0 });
        setDuplicateWarning(null);
    };

    const handleEdit = (product) => {
        setForm(product);
        setEditingId(product.id);
    };

    const handleCancel = () => {
        setEditingId(null);
        setForm({ name: '', spec: '', unit: '式', price: 0 });
        setDuplicateWarning(null);
    };

    const handleDelete = async (id) => {
        if (confirm('刪除此產品/服務？')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id));
    };

    // 複製產品
    const handleDuplicate = async (product) => {
        const newProduct = {
            name: `${product.name} (複製)`,
            spec: product.spec || '',
            unit: product.unit || '式',
            price: Number(product.price) || 0
        };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), newProduct);
    };

    return (
        <div className="space-y-6 w-full">
            {/* 新增/編輯表單 */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200 w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-teal-800 flex items-center">
                        {editingId ? <Edit className="w-5 h-5 mr-1" /> : <Package className="w-5 h-5 mr-1" />}
                        {editingId ? '編輯產品/服務' : '新增固定產品/服務'}
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

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <input className="input-std md:col-span-2" placeholder="產品/服務名稱 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    <input className="input-std md:col-span-2" placeholder="規格/備註" value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} />
                    <input className="input-std" placeholder="單位" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
                    <input className="input-std" type="number" placeholder="單價" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                    <button className={`text-white py-2 px-4 rounded md:col-span-6 transition-colors ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-600 hover:bg-teal-700'}`}>
                        {editingId ? '更新' : '新增'}
                    </button>
                </form>
            </div>

            {/* 搜尋與統計 */}
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                    <div className="relative w-full md:w-64">
                        <input
                            type="text"
                            placeholder="搜尋產品名稱、規格..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    </div>
                    <div className="text-sm text-gray-500">
                        共 <span className="font-bold text-teal-600">{filteredProducts.length}</span> 項產品/服務
                        {searchTerm && ` (篩選自 ${products.length} 筆)`}
                    </div>
                </div>
            </div>

            {/* 產品列表 */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200 w-full">
                <table className="min-w-full divide-y divide-gray-200 w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">項目</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">規格</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">參考單價</th>
                            <th className="px-4 py-3 text-right w-28"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredProducts.map(p => (
                            <tr key={p.id} className={editingId === p.id ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-xs">{p.spec || '-'}</td>
                                <td className="px-4 py-3 text-right text-sm text-gray-900">NT$ {p.price?.toLocaleString()} / {p.unit}</td>
                                <td className="px-4 py-3 text-right space-x-1">
                                    <button onClick={() => handleDuplicate(p)} className="text-gray-400 hover:text-teal-500 p-1" title="複製"><Copy className="w-4 h-4" /></button>
                                    <button onClick={() => handleEdit(p)} className="text-gray-400 hover:text-orange-500 p-1" title="編輯"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-500 p-1" title="刪除"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                        {filteredProducts.length === 0 && (
                            <tr>
                                <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                                    {searchTerm ? '沒有符合搜尋條件的產品' : '尚無產品/服務資料'}
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

export default ProductManager;
