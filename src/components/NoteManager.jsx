import React, { useState, useEffect } from 'react';
import { query, collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Edit, StickyNote, RotateCcw, Trash2 } from 'lucide-react';

import { db, appId } from '../firebase';

const NoteManager = () => {
    const [templates, setTemplates] = useState([]);
    const [form, setForm] = useState({ label: '', content: '' });
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'note_templates'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTemplates(docs);
        });
        return () => unsubscribe();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.label || !form.content) return alert('請填寫完整資訊');

        setSaving(true);
        try {
            if (editingId) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'note_templates', editingId), {
                    ...form,
                    updatedAt: serverTimestamp()
                });
                setEditingId(null);
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'note_templates'), {
                    ...form,
                    createdAt: serverTimestamp()
                });
            }
            setForm({ label: '', content: '' });
        } catch (err) {
            console.error(err);
            alert('儲存失敗');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (template) => {
        setForm({ label: template.label, content: template.content });
        setEditingId(template.id);
    };

    const handleDelete = async (id) => {
        if (confirm('確定要刪除此範本嗎？')) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'note_templates', id));
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setForm({ label: '', content: '' });
    };

    return (
        <div className="space-y-6 w-full">
            {/* 新增/編輯區塊 */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200 w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-teal-800 flex items-center">
                        {editingId ? <Edit className="w-5 h-5 mr-1" /> : <StickyNote className="w-5 h-5 mr-1" />}
                        {editingId ? '編輯備註範本' : '新增備註範本'}
                    </h3>
                    {editingId && (
                        <button onClick={handleCancel} className="text-xs flex items-center text-gray-500 hover:text-gray-700">
                            <RotateCcw className="w-3 h-3 mr-1" /> 取消編輯
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">範本名稱 (Label)</label>
                        <input
                            className="w-full border-gray-300 rounded text-sm focus:ring-teal-500 focus:border-teal-500"
                            placeholder="例如：一般付款條款、工程備註..."
                            value={form.label}
                            onChange={e => setForm({ ...form, label: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">備註內容 (Content)</label>
                        <textarea
                            className="w-full border-gray-300 rounded text-sm focus:ring-teal-500 focus:border-teal-500 h-32"
                            placeholder="請輸入備註詳細內容..."
                            value={form.content}
                            onChange={e => setForm({ ...form, content: e.target.value })}
                        />
                    </div>
                    <button
                        disabled={saving}
                        className={`text-white py-2 px-4 rounded w-full transition-colors ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-600 hover:bg-teal-700'}`}
                    >
                        {saving ? '儲存中...' : (editingId ? '更新範本' : '新增範本')}
                    </button>
                </form>
            </div>

            {/* 範本列表 */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200 w-full">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-bold text-gray-700">現有範本列表 ({templates.length})</h3>
                </div>
                <div className="divide-y divide-gray-200">
                    {templates.map(t => (
                        <div key={t.id} className={`p-4 ${editingId === t.id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-teal-800">{t.label}</h4>
                                <div className="flex space-x-2">
                                    <button onClick={() => handleEdit(t)} className="text-gray-400 hover:text-orange-500" title="編輯">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-500" title="刪除">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 p-2 rounded border border-gray-100">
                                {t.content}
                            </pre>
                        </div>
                    ))}
                    {templates.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            尚無自訂備註範本
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NoteManager;
