import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
    Plus, Search, ChevronRight, ChevronDown, X,
    ClipboardList, FileCheck, XCircle, Copy, Trash2, Undo
} from 'lucide-react';
import { db, appId } from '../firebase';
import { getNextQuoteNumber, formatDate, formatTimestamp } from '../utils/helpers';
import { N8N_SYNC_API_URL } from '../constants';
import Spinner from './Spinner';

const Dashboard = ({ user, triggerToast, onEdit, onCreate, onDuplicate }) => {
    const [quotes, setQuotes] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('quotes');

    // 篩選與展開狀態
    const [statusFilter, setStatusFilter] = useState('all');
    const [customerFilter, setCustomerFilter] = useState('all');
    // ✨ 自定義排序狀態
    const [sortField, setSortField] = useState('updatedAt'); // 排序欄位
    const [sortOrder, setSortOrder] = useState('desc');     // desc | asc
    const [expandedGroups, setExpandedGroups] = useState(new Set()); // ✨ 記錄展開的群組

    useEffect(() => {
        document.title = "傑太環境工程報價系統";
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'quotations'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            docs.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
            setQuotes(docs);
            setLoading(false);
        });

        // 載入客戶列表用於篩選
        const qCustomers = query(collection(db, 'artifacts', appId, 'public', 'data', 'customers'));
        const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(docs);
        });

        return () => { unsubscribe(); unsubCustomers(); };
    }, []);

    // 軟刪除 (移至回收桶)
    const handleDelete = async (e, id) => {
        e.stopPropagation();
        const quoteToDelete = quotes.find(q => q.id === id);
        if (!quoteToDelete) return;

        if (confirm(`確定要將「${quoteToDelete.projectName || quoteToDelete.quoteNumber}」移至回收桶嗎？`)) {
            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', id), {
                    status: 'deleted',
                    deletedAt: serverTimestamp()
                });
                triggerToast('報價單已移至回收桶');
            } catch (err) {
                console.error(err);
                alert('刪除失敗');
            }
        }
    };

    // 還原功能
    const handleRestore = async (e, id) => {
        e.stopPropagation();
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', id), {
                status: 'draft', // 還原為草稿較安全
                deletedAt: null
            });
            triggerToast('報價單已還原');
        } catch (err) {
            console.error(err);
            alert('還原失敗');
        }
    };

    // 永久刪除
    const handlePermanentDelete = async (e, id) => {
        e.stopPropagation();
        const quoteToDelete = quotes.find(q => q.id === id);
        if (!quoteToDelete) return;

        if (confirm(`確定要永久刪除「${quoteToDelete.projectName || quoteToDelete.quoteNumber}」嗎？此動作無法復原！`)) {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', id));
                triggerToast('報價單已永久刪除');

                // --- 雲端同步刪除 (Fire and Forget) ---
                fetch(N8N_SYNC_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'delete',
                        quoteNumber: quoteToDelete.quoteNumber,
                        projectName: quoteToDelete.projectName,
                        filename: `${quoteToDelete.quoteNumber}-${quoteToDelete.projectName}`
                    })
                }).catch(err => console.error('雲端刪除同步失敗:', err));

            } catch (err) {
                console.error(err);
                alert('永久刪除失敗');
            }
        }
    };

    // 複製報價單功能
    const handleDuplicate = async (e, quote) => {
        e.stopPropagation();
        if (confirm(`確定要複製「${quote.projectName || quote.quoteNumber}」嗎？`)) {
            const newQuote = {
                ...quote,
                quoteNumber: await getNextQuoteNumber(db, appId),
                projectName: `${quote.projectName || '專案'} (複製)`,
                status: 'draft',
                version: 1,
                date: formatDate(new Date()),
                validUntil: formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            delete newQuote.id;

            try {
                const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'quotations'), newQuote);
                onDuplicate(docRef.id);
            } catch (err) {
                console.error('複製失敗:', err);
                alert('複製失敗，請稍後再試');
            }
        }
    };

    // 切換展開/收合
    const toggleGroup = (baseNumber) => {
        const newSet = new Set(expandedGroups);
        if (newSet.has(baseNumber)) {
            newSet.delete(baseNumber);
        } else {
            newSet.add(baseNumber);
        }
        setExpandedGroups(newSet);
    };

    // 切換排序順序
    const toggleSortOrder = () => {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    };

    // 1. 第一階段：過濾資料
    const filteredRawQuotes = useMemo(() => {
        let result = quotes;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(q =>
                String(q.quoteNumber || '').toLowerCase().includes(lower) ||
                String(q.clientName || '').toLowerCase().includes(lower) ||
                String(q.projectName || '').toLowerCase().includes(lower)
            );
        }

        if (statusFilter !== 'all') {
            result = result.filter(q => q.status === statusFilter);
        } else {
            // "全部" 狀態不應包含已刪除的，除非在回收桶分頁 (但這裡只處理 Filter 下拉選單)
            // 邏輯修正：如果是在回收桶分頁，就不管 statusFilter (因為都是 deleted)
            // 如果不是在回收桶分頁，預設濾掉 deleted
            if (activeTab !== 'trash') {
                result = result.filter(q => q.status !== 'deleted');
            }
        }

        if (customerFilter !== 'all') {
            result = result.filter(q => q.clientName === customerFilter);
        }

        return result;
    }, [quotes, searchTerm, statusFilter, customerFilter, activeTab]);

    // 2. 第二階段：摺疊 (Group) 並保留歷史資料
    const displayedQuotes = useMemo(() => {
        const groups = {};

        filteredRawQuotes.forEach(quote => {
            const baseNumber = quote.quoteNumber ? quote.quoteNumber.replace(/-V\d+$/, '') : 'unknown';

            if (!groups[baseNumber]) {
                groups[baseNumber] = [];
            }
            groups[baseNumber].push(quote);
        });

        const result = [];
        Object.keys(groups).forEach(baseNum => {
            const versions = groups[baseNum];
            // 依照版本號倒序排列 (V3, V2, V1...)
            versions.sort((a, b) => (b.version || 0) - (a.version || 0));

            // 取出最新版作為主要顯示項目
            const latest = { ...versions[0] };
            // 其餘的作為歷史紀錄
            latest.history = versions.slice(1);
            latest.baseNumber = baseNum; // 方便 key 使用

            result.push(latest);
        });

        // ✨ 執行自定義排序
        return result.sort((a, b) => {
            let valA, valB;

            if (sortField === 'updatedAt') {
                valA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
                valB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
            } else if (sortField === 'quoteNumber') {
                valA = a.quoteNumber || '';
                valB = b.quoteNumber || '';
            } else if (sortField === 'clientName') {
                valA = a.clientName || '';
                valB = b.clientName || '';
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredRawQuotes, sortField, sortOrder]);

    // 3. Tab 分類
    const tabFilteredQuotes = useMemo(() => {
        return displayedQuotes.filter(q => {
            if (activeTab === 'quotes') {
                return (['draft', 'sent', 'confirmed'].includes(q.status) || !q.status);
            } else if (activeTab === 'cancelled') {
                return q.status === 'cancelled';
            } else if (activeTab === 'trash') {
                return q.status === 'deleted';
            } else {
                return q.status === 'ordered';
            }
        });
    }, [displayedQuotes, activeTab]);

    // 4. 統計數據 — 直接從原始 quotes 計算，不受 Tab/Filter 影響
    const stats = useMemo(() => {
        const inProgress = quotes.filter(q => (['draft', 'sent', 'confirmed'].includes(q.status) || !q.status));
        const ordered = quotes.filter(q => q.status === 'ordered');
        const cancelled = quotes.filter(q => q.status === 'cancelled');
        const deleted = quotes.filter(q => q.status === 'deleted');

        return {
            inProgressCount: inProgress.length,
            inProgressTotal: inProgress.reduce((sum, q) => sum + (q.grandTotal || 0), 0),
            orderedCount: ordered.length,
            orderedTotal: ordered.reduce((sum, q) => sum + (q.grandTotal || 0), 0),
            cancelledCount: cancelled.length,
            cancelledTotal: cancelled.reduce((sum, q) => sum + (q.grandTotal || 0), 0),
            deletedCount: deleted.length,
            allTotal: quotes.filter(q => q.status !== 'deleted').reduce((sum, q) => sum + (q.grandTotal || 0), 0)
        };
    }, [quotes]);

    const uniqueClients = useMemo(() => {
        const clients = [...new Set(quotes.map(q => q.clientName).filter(Boolean))];
        return clients.sort();
    }, [quotes]);

    const statusConfig = {
        draft: { label: '草稿', color: 'bg-gray-100 text-gray-600 border-gray-200' },
        sent: { label: '已發送', color: 'bg-blue-50 text-blue-600 border-blue-200' },
        confirmed: { label: '已確認', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
        ordered: { label: '已轉訂單', color: 'bg-green-50 text-green-600 border-green-200' },
        cancelled: { label: '已取消', color: 'bg-red-50 text-red-600 border-red-200' },
        deleted: { label: '已刪除', color: 'bg-gray-200 text-gray-500 border-gray-300' },
    };

    const clearFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setCustomerFilter('all');
    };

    const hasActiveFilters = searchTerm || statusFilter !== 'all' || customerFilter !== 'all';

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6 w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800 border-l-4 border-teal-600 pl-3">專案報價管理</h2>

                <button
                    onClick={onCreate}
                    className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm transition-colors whitespace-nowrap"
                >
                    <Plus className="w-5 h-5 mr-1" /> 建立新報價
                </button>
            </div>

            {/* 統計卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">進行中報價</p>
                            <p className="text-2xl font-bold text-gray-800">{stats.inProgressCount} 件</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-400">總金額 (折疊後)</p>
                            <p className="text-lg font-bold text-teal-600">NT$ {stats.inProgressTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow border border-green-200 p-4 bg-green-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-green-600">已回簽訂單</p>
                            <p className="text-2xl font-bold text-green-800">{stats.orderedCount} 件</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-green-500">總金額 (折疊後)</p>
                            <p className="text-lg font-bold text-green-700">NT$ {stats.orderedTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow border border-red-200 p-4 bg-red-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600">已取消案件</p>
                            <p className="text-2xl font-bold text-red-800">{stats.cancelledCount} 件</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-red-500">總金額 (折疊後)</p>
                            <p className="text-lg font-bold text-red-700">NT$ {stats.cancelledTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow border border-teal-200 p-4 bg-teal-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-teal-600">全部案件</p>
                            <p className="text-2xl font-bold text-teal-800">{displayedQuotes.length} 件</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-teal-500">總金額 (折疊後)</p>
                            <p className="text-lg font-bold text-teal-700">NT$ {stats.allTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 搜尋與篩選列 */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                    <div className="relative w-full md:w-64">
                        <input
                            type="text"
                            placeholder="搜尋單號、客戶、專案..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500 whitespace-nowrap">狀態：</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="all">全部狀態</option>
                            <option value="draft">草稿</option>
                            <option value="sent">已發送</option>
                            <option value="confirmed">已確認</option>
                            <option value="ordered">已轉訂單</option>
                            <option value="cancelled">已取消</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500 whitespace-nowrap">排序：</label>
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="updatedAt">最後編輯時間</option>
                            <option value="quoteNumber">報價單編號</option>
                            <option value="clientName">客戶名稱</option>
                        </select>
                        <button
                            onClick={toggleSortOrder}
                            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                            title={sortOrder === 'asc' ? '正序 (小到大)' : '倒序 (大到小)'}
                        >
                            {sortOrder === 'asc' ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500 whitespace-nowrap">客戶：</label>
                        <select
                            value={customerFilter}
                            onChange={(e) => setCustomerFilter(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 max-w-[200px]"
                        >
                            <option value="all">全部客戶</option>
                            {uniqueClients.map(client => (
                                <option key={client} value={client}>{client}</option>
                            ))}
                        </select>
                    </div>

                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center text-sm text-gray-500 hover:text-red-500 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                            <X className="w-4 h-4 mr-1" /> 清除篩選
                        </button>
                    )}
                </div>

                {hasActiveFilters && (
                    <div className="mt-3 text-sm text-gray-500">
                        篩選結果：共 <span className="font-bold text-teal-600">{displayedQuotes.length}</span> 筆資料
                    </div>
                )}
            </div>

            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('quotes')}
                    className={`flex items-center py-2 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === 'quotes'
                        ? 'border-teal-600 text-teal-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    進行中報價 ({stats.inProgressCount})
                </button>
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`flex items-center py-2 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === 'orders'
                        ? 'border-green-600 text-green-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    <FileCheck className="w-4 h-4 mr-2" />
                    已回簽訂單 ({stats.orderedCount})
                </button>
                <button
                    onClick={() => setActiveTab('cancelled')}
                    className={`flex items-center py-2 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === 'cancelled'
                        ? 'border-red-600 text-red-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    已取消 (未簽回) ({stats.cancelledCount})
                </button>
                <button
                    onClick={() => setActiveTab('trash')}
                    className={`flex items-center py-2 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === 'trash'
                        ? 'border-gray-600 text-gray-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    回收桶 (參考用) ({stats.deletedCount})
                </button>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200 w-full mt-0 rounded-tl-none">
                <div className="overflow-x-auto w-full">
                    <table className="min-w-full divide-y divide-gray-200 w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">單號 / 專案</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">客戶</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">最後編輯</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">狀態</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">總金額 (含稅)</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tabFilteredQuotes.map((quote) => {
                                const status = statusConfig[quote.status] || statusConfig.draft;
                                const hasHistory = quote.history && quote.history.length > 0;
                                const isExpanded = expandedGroups.has(quote.baseNumber);

                                return (
                                    <React.Fragment key={quote.id}>
                                        <tr
                                            onClick={() => onEdit(quote.id)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-start">
                                                    {/* 展開/收合按鈕 */}
                                                    <div className="mr-2 mt-1">
                                                        {hasHistory ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); toggleGroup(quote.baseNumber); }}
                                                                className="p-1 rounded-full text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                                                title="檢視歷史版本"
                                                            >
                                                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                            </button>
                                                        ) : (
                                                            <div className="w-6 h-6"></div> // 佔位，保持對齊
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-sm font-bold text-teal-700">{quote.quoteNumber}</div>
                                                            {hasHistory && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded border border-gray-200">最新</span>}
                                                        </div>
                                                        <div className="text-sm text-gray-900 font-medium">{quote.projectName || '未命名專案'}</div>
                                                        {quote.version > 1 && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 rounded-full">V{quote.version}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900">{quote.clientName}</div>
                                                <div className="text-xs text-gray-500">{quote.date}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs text-gray-500">
                                                    {formatTimestamp(quote.updatedAt || quote.createdAt)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                NT$ {quote.grandTotal?.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-1">
                                                    {status.label === '已刪除' ? (
                                                        <>
                                                            <button
                                                                onClick={(e) => handleRestore(e, quote.id)}
                                                                className="text-gray-400 hover:text-green-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                                                                title="還原"
                                                            >
                                                                <Undo className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => handlePermanentDelete(e, quote.id)}
                                                                className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                                                                title="永久刪除"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={(e) => handleDuplicate(e, quote)}
                                                                className="text-gray-400 hover:text-teal-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                                                                title="複製此報價單"
                                                            >
                                                                <Copy className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDelete(e, quote.id)}
                                                                className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                                                                title="移至回收桶"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* 歷史版本渲染區塊 */}
                                        {isExpanded && quote.history.map((hQuote) => {
                                            const hStatus = statusConfig[hQuote.status] || statusConfig.draft;
                                            return (
                                                <tr
                                                    key={hQuote.id}
                                                    onClick={() => onEdit(hQuote.id)}
                                                    className="bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors border-t border-gray-100"
                                                >
                                                    <td className="px-6 py-3 pl-14 relative">
                                                        <div className="absolute left-10 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                                                        <div className="flex items-center opacity-70">
                                                            <div>
                                                                <div className="text-xs font-mono text-gray-500">{hQuote.quoteNumber}</div>
                                                                <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 rounded-full">歷史 V{hQuote.version}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 opacity-70">
                                                        <div className="text-xs text-gray-500">{hQuote.date}</div>
                                                    </td>
                                                    <td className="px-6 py-3 opacity-70">
                                                        <div className="text-xs text-gray-400">
                                                            {formatTimestamp(hQuote.updatedAt || hQuote.createdAt)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 whitespace-nowrap opacity-70">
                                                        <span className={`px-2 inline-flex text-[10px] leading-4 font-semibold rounded-full border ${hStatus.color} opacity-70`}>
                                                            {hStatus.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-xs font-medium text-gray-500 opacity-70">
                                                        NT$ {hQuote.grandTotal?.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-xs font-medium">
                                                        {/* 歷史版本通常只允許複製或刪除 */}
                                                        <div className="flex items-center justify-end gap-1 opacity-50 hover:opacity-100">
                                                            <button
                                                                onClick={(e) => handleDuplicate(e, hQuote)}
                                                                className="text-gray-400 hover:text-teal-600 p-1.5"
                                                                title="複製舊版"
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                            {tabFilteredQuotes.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="bg-gray-100 p-3 rounded-full mb-3">
                                                {activeTab === 'quotes' ? <ClipboardList className="w-6 h-6 text-gray-400" /> : <FileCheck className="w-6 h-6 text-gray-400" />}
                                            </div>
                                            <p>{hasActiveFilters ? '沒有符合篩選條件的資料' : '此分類目前沒有資料'}</p>
                                            {hasActiveFilters && (
                                                <button onClick={clearFilters} className="mt-2 text-sm text-teal-600 hover:underline">
                                                    清除所有篩選
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
