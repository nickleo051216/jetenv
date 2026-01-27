import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase';

// --- Note Selector Component (In-Editor) ---
const NoteSelector = ({ value, onChange, isPrintMode }) => {
    const [templates, setTemplates] = useState([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');

    useEffect(() => {
        if (isPrintMode) return;
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'note_templates'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [isPrintMode]);

    const handleSaveTemplate = async () => {
        if (!newTemplateName) return alert('請輸入範本名稱');
        if (!value) return alert('備註內容為空，無法儲存');
        try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'note_templates'), {
                label: newTemplateName,
                content: value,
                createdAt: serverTimestamp()
            });
            alert('範本儲存成功！');
            setShowSaveDialog(false);
            setNewTemplateName('');
        } catch (e) {
            console.error(e);
            alert('儲存失敗');
        }
    };

    if (isPrintMode) {
        return (
            <div className="notes-block">
                <div className="notes-title">備註 Notes</div>
                <div className="notes-content whitespace-pre-wrap">{value || '-'}</div>
            </div>
        );
    }

    return (
        <div className="notes-block">
            <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-gray-500 uppercase">備註 Notes</label>
                <div className="flex gap-2">
                    <select
                        className="text-xs border-gray-300 rounded py-0 pl-1 pr-6 h-6 leading-none focus:ring-teal-500 focus:border-teal-500"
                        onChange={(e) => {
                            const t = templates.find(t => t.id === e.target.value);
                            if (t) onChange(t.content);
                        }}
                        defaultValue=""
                    >
                        <option value="" disabled>套用範本...</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={() => setShowSaveDialog(true)}
                        className="text-xs flex items-center text-teal-600 hover:text-teal-800"
                        title="存為範本"
                    >
                        <Save className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {showSaveDialog && (
                <div className="mb-2 p-2 bg-teal-50 rounded border border-teal-100 flex gap-2 items-center">
                    <input
                        className="flex-1 text-xs border-gray-300 rounded px-2 py-1"
                        placeholder="輸入範本名稱..."
                        value={newTemplateName}
                        onChange={e => setNewTemplateName(e.target.value)}
                    />
                    <button onClick={handleSaveTemplate} className="text-xs bg-teal-600 text-white px-2 py-1 rounded hover:bg-teal-700">儲存</button>
                    <button onClick={() => setShowSaveDialog(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2">取消</button>
                </div>
            )}

            <textarea
                className="w-full border border-gray-300 rounded p-2 text-sm text-gray-900 focus:ring-teal-500 focus:border-teal-500 min-h-[100px]"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="付款條件、交貨方式、保固條款..."
            />
        </div>
    );
};

export default NoteSelector;
