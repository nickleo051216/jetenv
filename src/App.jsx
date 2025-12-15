import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import {
  Plus, Trash2, FileText, Users, Printer, Save, Copy,
  ArrowLeft, Package, Upload, Image as ImageIcon, CheckCircle, Stamp, ListPlus, X, Search, Edit, RotateCcw, FileCheck, ClipboardList, RefreshCw,
  ChevronDown, ChevronRight, History, Send, Loader2 // ✨ 新增圖示
} from 'lucide-react';

// --- 設定區：預設圖檔路徑 ---
const DEFAULT_LOGO_PATH = '/logo.jpg';
const DEFAULT_STAMP_PATH = '/stamp.png';

// --- Firebase Configuration 設定區 ---
// ⚠️ 請記得將下方的 "請在此填入..." 換成你真實的 Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyCrvR0Ir8xttLtwEJz2K3bhXKAFyyDk5RA",
  authDomain: "jetenv-a82bc.firebaseapp.com",
  projectId: "jetenv-a82bc",
  storageBucket: "jetenv-a82bc.firebasestorage.app",
  messagingSenderId: "816919171168",
  appId: "1:816919171168:web:77d028486a01cb40597305",
  measurementId: "G-THZB1LZ7DK"
};

// 初始化 Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'jietai-prod';

// --- n8n API 設定 (經濟部公司查詢) ---
const N8N_MOEA_API_URL = 'https://jetenv.zeabur.app/webhook/ipas-conpanynumber';

// --- Constants & Options ---
const PAYMENT_METHODS = ['匯款', '支票', '現金'];
const PAYMENT_TERMS = [
  '驗收後並開立發票 30 天內付款',
  '驗收後並開立發票 60 天內付款',
  '驗收後並開立發票 90 天內付款'
];
const NOTE_TEMPLATES = [
  {
    label: '標準條款 (30天效期)',
    content: '一、本報價單有效期限 30 天。\n二、報價內容不含施工期間水電費用。\n三、如蒙惠顧，請簽名回傳以便安排作業。'
  },
  {
    label: '工程專用條款',
    content: '一、本報價單有效期限 30 天。\n二、施工期間需配合甲方安衛規定。\n三、廢棄物由乙方負責清運。\n四、驗收合格後請款。'
  },
  {
    label: '純檢測服務',
    content: '一、檢測報告於採樣後 10 個工作天內提供。\n二、本報價含報告書一式兩份。\n三、急件需另加收 20% 急件費。'
  }
];

// --- Utilities ---
const generateQuoteNumber = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const randomSeq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `J-${yy}-${mm}${randomSeq}`;
};

// 自動取得下一個流水號邏輯
const getNextQuoteNumber = async (dbInstance, currentAppId) => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `J-${yy}-${mm}`; // 例如：J-25-12

  try {
    const q = query(
      collection(dbInstance, 'artifacts', currentAppId, 'public', 'data', 'quotations'),
      orderBy('quoteNumber', 'desc'),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const lastId = snapshot.docs[0].data().quoteNumber;
      if (lastId && lastId.startsWith(prefix)) {
        const baseId = lastId.split('-V')[0];
        const lastSeq = parseInt(baseId.slice(-3));

        if (!isNaN(lastSeq)) {
          const nextSeq = String(lastSeq + 1).padStart(3, '0');
          return `${prefix}${nextSeq}`;
        }
      }
    }
    return `${prefix}001`;
  } catch (error) {
    console.error("流水號生成失敗，使用亂數代替:", error);
    const randomSeq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${prefix}${randomSeq}`;
  }
};

const formatDate = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  return d.toISOString().split('T')[0];
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// --- Components ---
const Spinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
  </div>
);

// --- Custom Input Components ---
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

const NoteSelector = ({ value, onChange, isPrintMode }) => {
  const handleTemplateChange = (e) => {
    const idx = e.target.value;
    if (idx === 'custom') return;
    if (idx !== '') {
      onChange(NOTE_TEMPLATES[idx].content);
    }
  };

  if (isPrintMode) {
    return (
      <div className="w-full mt-4">
        <div className="text-xs font-bold text-gray-500 uppercase mb-2 tracking-wider">備註 Notes</div>
        <div className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed pl-1 border-l-2 border-gray-100">{value}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <label className="block text-xs font-bold text-gray-500 uppercase">備註 Notes</label>
        <select
          className="text-xs border-none bg-transparent text-teal-600 font-medium focus:ring-0 cursor-pointer p-0"
          onChange={handleTemplateChange}
          defaultValue=""
        >
          <option value="" disabled>-- 快速載入範本 --</option>
          {NOTE_TEMPLATES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
          <option value="custom">手動編輯</option>
        </select>
      </div>
      <textarea
        className="w-full text-sm border-gray-200 rounded bg-gray-50 px-3 py-2 focus:ring-teal-500 focus:border-teal-500 h-32 leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="請選擇範本或直接輸入..."
      />
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      await signInAnonymously(auth);
    };
    initAuth();
    onAuthStateChanged(auth, setUser);
  }, []);

  if (!user) return <Spinner />;

  return (
    <div className={`min-h-screen w-full max-w-full bg-gray-50 text-gray-900 font-sans ${printMode ? 'bg-white' : ''}`}>
      {!printMode && (
        <nav className="bg-teal-800 text-white shadow-lg sticky top-0 z-50 w-full">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center cursor-pointer space-x-2" onClick={() => setView('dashboard')}>
                <div className="bg-white p-1 rounded">
                  <FileText className="h-6 w-6 text-teal-800" />
                </div>
                <span className="font-bold text-xl tracking-tight hidden sm:block">傑太環境工程</span>
                <span className="font-bold text-xl tracking-tight sm:hidden">傑太</span>
              </div>
              <div className="flex space-x-1 overflow-x-auto no-scrollbar">
                {[
                  { id: 'dashboard', label: '報價管理', icon: FileText },
                  { id: 'customers', label: '客戶通訊錄', icon: Users },
                  { id: 'products', label: '產品/服務庫', icon: Package },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id)}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap
                      ${view === item.id
                        ? 'bg-teal-900 shadow-inner border border-teal-600 text-white'
                        : 'hover:bg-teal-700 text-teal-100 border border-transparent'}`}
                  >
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>
      )}

      <main className={`w-full max-w-full ${printMode ? 'p-0' : 'py-6 px-4 sm:px-6 lg:px-8'}`}>
        {view === 'dashboard' && (
          <Dashboard
            user={user}
            onEdit={(id) => { setActiveQuoteId(id); setView('editor'); }}
            onCreate={() => { setActiveQuoteId(null); setView('editor'); }}
            onDuplicate={(id) => { setActiveQuoteId(id); setView('editor'); }}
          />
        )}
        {view === 'customers' && <CustomerManager />}
        {view === 'products' && <ProductManager />}
        {view === 'editor' && (
          <QuoteEditor
            user={user}
            quoteId={activeQuoteId}
            setActiveQuoteId={setActiveQuoteId}
            onBack={() => setView('dashboard')}
            onPrintToggle={setPrintMode}
            isPrintMode={printMode}
          />
        )}
      </main>
    </div>
  );
}

// --- Dashboard ---
const Dashboard = ({ user, onEdit, onCreate, onDuplicate }) => {
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('quotes');

  // 篩選與展開狀態
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
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

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (confirm('確定要刪除此報價單嗎？')) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', id));
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
    }

    if (customerFilter !== 'all') {
      result = result.filter(q => q.clientName === customerFilter);
    }

    return result;
  }, [quotes, searchTerm, statusFilter, customerFilter]);

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

    // 依照更新時間排序
    return result.sort((a, b) =>
      (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0)
    );
  }, [filteredRawQuotes]);

  // 3. Tab 分類
  const tabFilteredQuotes = useMemo(() => {
    return displayedQuotes.filter(q => {
      if (activeTab === 'quotes') {
        return ['draft', 'sent', 'confirmed', 'cancelled'].includes(q.status) || !q.status;
      } else {
        return q.status === 'ordered';
      }
    });
  }, [displayedQuotes, activeTab]);

  // 4. 統計數據
  const stats = useMemo(() => {
    const inProgress = displayedQuotes.filter(q => ['draft', 'sent', 'confirmed', 'cancelled'].includes(q.status) || !q.status);
    const ordered = displayedQuotes.filter(q => q.status === 'ordered');

    return {
      inProgressCount: inProgress.length,
      inProgressTotal: inProgress.reduce((sum, q) => sum + (q.grandTotal || 0), 0),
      orderedCount: ordered.length,
      orderedTotal: ordered.reduce((sum, q) => sum + (q.grandTotal || 0), 0),
      allTotal: displayedQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0)
    };
  }, [displayedQuotes]);

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            title="刪除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

// --- n8n Email API 設定 ---
const N8N_EMAIL_API_URL = 'https://jetenv.zeabur.app/webhook/email';

// --- Editor (V6.2: 加入列印頁尾 - 網址 + 頁碼) ---
const QuoteEditor = ({ user, quoteId, setActiveQuoteId, onBack, onPrintToggle, isPrintMode }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false); // 寄送狀態
  const [logoPreview, setLogoPreview] = useState(DEFAULT_LOGO_PATH);
  const [stampPreview, setStampPreview] = useState(DEFAULT_STAMP_PATH);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    quoteNumber: generateQuoteNumber(), // 暫時用亂數，useEffect 會覆蓋它
    projectName: '',
    status: 'draft',
    version: 1,
    date: formatDate(new Date()),
    validUntil: formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    // 預設公司聯絡資訊
    companyContact: '張惟荏',
    companyPhone: '02-6609-5888 #103',
    clientName: '',
    clientTaxId: '',
    clientContact: '',
    clientPhone: '',
    clientFax: '',
    clientAddress: '',
    clientEmail: '',
    items: [
      { id: Date.now(), name: '顧問諮詢服務', spec: '', unit: '式', price: 0, qty: 1, frequency: '', note: '' }
    ],
    paymentMethod: '匯款',
    paymentTerms: '驗收後並開立發票 30 天內付款',
    notes: NOTE_TEMPLATES[0].content
  });

  useEffect(() => {
    const unsubC = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), s => setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubP = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'products'), s => setProducts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubC(); unsubP(); };
  }, []);

  // 自動流水號：如果是新增模式(沒有quoteId)，自動去抓下一號
  useEffect(() => {
    if (!quoteId) {
      const fetchSeq = async () => {
        const nextNum = await getNextQuoteNumber(db, appId);
        // 更新表單中的單號
        setFormData(prev => ({ ...prev, quoteNumber: nextNum }));
      };
      fetchSeq();
    }
  }, [quoteId]);

  useEffect(() => {
    if (quoteId) {
      setLoading(true);
      const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', quoteId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setFormData(prev => ({ ...prev, ...data }));
        }
        setLoading(false);
      });
      return () => unsub();
    }
  }, [quoteId]);

  useEffect(() => {
    if (formData.quoteNumber) {
      const fileName = `${formData.quoteNumber}_${formData.clientName || '客戶'}_${formData.projectName || '專案'}`;
      document.title = fileName;
    }
    return () => { document.title = '傑太環境工程報價系統'; }
  }, [formData.quoteNumber, formData.clientName, formData.projectName]);

  const subtotal = useMemo(() => formData.items.reduce((sum, item) => sum + (item.price * item.qty), 0), [formData.items]);
  const tax = Math.round(subtotal * 0.05);
  const grandTotal = subtotal + tax;

  const handleItemChange = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const addItem = (product = null) => {
    const newItem = product ? {
      id: Date.now(),
      name: product.name,
      spec: product.spec || '',
      unit: product.unit || '式',
      price: product.price || 0,
      qty: 1,
      frequency: '',
      note: ''
    } : {
      id: Date.now(),
      name: '', spec: '', unit: '式', price: 0, qty: 1, frequency: '', note: ''
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const handleProductSelect = (e) => {
    const pid = e.target.value;
    if (!pid) return;
    const p = products.find(prod => prod.id === pid);
    if (p) addItem(p);
    e.target.value = "";
  };

  const handleClientSelect = (e) => {
    const c = customers.find(x => x.id === e.target.value);
    if (c) {
      setFormData(prev => ({
        ...prev,
        clientName: c.name,
        clientTaxId: c.taxId || '',
        clientContact: c.contact || '',
        clientPhone: c.phone || '',
        clientFax: c.fax || '',
        clientAddress: c.address || '',
        clientEmail: c.email || ''
      }));
    }
  };

  const handleImageUpload = (e, setter) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 智慧同步功能 (Smart Sync)
  const syncCustomerData = async (clientName, data) => {
    if (!clientName) return;
    try {
      const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), where("name", "==", clientName));
      const querySnapshot = await getDocs(q);
      const customerPayload = {
        name: data.clientName,
        taxId: data.clientTaxId || '',
        contact: data.clientContact || '',
        phone: data.clientPhone || '',
        fax: data.clientFax || '',
        address: data.clientAddress || '',
        email: data.clientEmail || ''
      };

      if (!querySnapshot.empty) {
        const customerDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', customerDoc.id), customerPayload);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), customerPayload);
      }
    } catch (e) { console.error("客戶同步失敗", e); }
  };

  const syncProductData = async (items) => {
    if (!items || items.length === 0) return;
    try {
      const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'products'));
      const querySnapshot = await getDocs(q);
      const existingProducts = querySnapshot.docs.map(d => d.data().name);
      for (const item of items) {
        if (item.name && !existingProducts.includes(item.name)) {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), {
            name: item.name,
            spec: item.spec || '',
            unit: item.unit || '式',
            price: Number(item.price) || 0
          });
          existingProducts.push(item.name);
        }
      }
    } catch (e) { console.error("產品同步失敗", e); }
  };

  const save = async (silent = false) => {
    if (!silent) setSaving(true);
    const payload = { ...formData, subtotal, tax, grandTotal, updatedAt: serverTimestamp() };
    try {
      if (quoteId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', quoteId), payload);
      } else {
        const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'quotations'), {
          ...payload, createdAt: serverTimestamp()
        });
        if (!quoteId) setActiveQuoteId(ref.id);
      }
      await syncCustomerData(formData.clientName, formData);
      await syncProductData(formData.items);
    } catch (e) { console.error(e); alert('儲存失敗'); }
    if (!silent) setSaving(false);
  };

  const versionUp = async () => {
    if (!confirm('確定要建立新版本嗎？')) return;
    setSaving(true);
    const newVer = formData.version + 1;
    const newNumber = formData.quoteNumber.includes('-V')
      ? formData.quoteNumber.replace(/-V\d+$/, `-V${newVer}`)
      : `${formData.quoteNumber}-V${newVer}`;

    const payload = {
      ...formData,
      quoteNumber: newNumber,
      version: newVer,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      subtotal, tax, grandTotal
    };

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'quotations'), payload);
    setSaving(false);
    onBack();
  };

  // --- 生成報價單 HTML (供 n8n 用 puppeteer 轉 PDF) ---
  const generateQuoteHtml = () => {
    const itemsHtml = formData.items.map((item, idx) => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">${idx + 1}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">${item.name || ''}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${item.spec || ''}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">${item.frequency || ''}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">${item.unit || ''}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${item.qty || 0}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${(item.price || 0).toLocaleString()}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #111827;">${((item.price || 0) * (item.qty || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>報價單 - ${formData.quoteNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif; 
      padding: 40px; 
      color: #333; 
      background: #fff;
      line-height: 1.5;
    }
    .container { max-width: 800px; margin: 0 auto; }
    
    /* Header */
    .header { 
      display: flex; 
      justify-content: space-between; 
      border-bottom: 3px solid #0d9488; 
      padding-bottom: 24px; 
      margin-bottom: 24px; 
    }
    .company-info h1 { 
      color: #0d9488; 
      font-size: 32px; 
      letter-spacing: 8px;
      margin-bottom: 8px;
    }
    .company-info h2 { 
      color: #374151; 
      font-size: 18px; 
      font-weight: 600;
      margin-bottom: 16px;
    }
    .company-details { font-size: 13px; color: #6b7280; }
    .company-details p { margin: 4px 0; }
    
    /* Quote Info */
    .quote-info { text-align: right; min-width: 240px; }
    .quote-info-row { 
      display: flex; 
      justify-content: space-between; 
      margin: 6px 0; 
      font-size: 13px; 
    }
    .quote-info-label { color: #6b7280; }
    .quote-number { font-size: 16px; font-weight: 700; color: #0d9488; }
    .project-box { 
      background: #f0fdfa; 
      padding: 12px 16px; 
      border-radius: 8px; 
      border: 1px solid #99f6e4; 
      margin-top: 12px;
      text-align: left;
    }
    .project-label { font-size: 11px; font-weight: 700; color: #0d9488; margin-bottom: 4px; }
    .project-name { font-size: 14px; color: #134e4a; font-weight: 500; }
    
    /* Section */
    .section-title { 
      font-weight: 700; 
      color: #374151; 
      font-size: 14px;
      border-bottom: 1px solid #e5e7eb; 
      padding-bottom: 8px; 
      margin: 24px 0 16px 0; 
    }
    
    /* Client Info */
    .client-grid { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 8px 24px; 
      font-size: 13px; 
    }
    .client-row { display: flex; }
    .client-label { color: #6b7280; min-width: 70px; }
    .client-value { color: #111827; }
    .client-value.highlight { font-weight: 600; }
    .client-row.full { grid-column: span 2; }
    
    /* Table */
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0; 
      font-size: 13px;
    }
    th { 
      background: #f0fdfa; 
      color: #0d9488; 
      padding: 12px 8px; 
      text-align: left; 
      font-size: 12px; 
      font-weight: 700; 
      border-bottom: 2px solid #0d9488;
      text-transform: uppercase;
    }
    th.center { text-align: center; }
    th.right { text-align: right; }
    
    /* Summary */
    .summary { 
      display: flex; 
      justify-content: space-between; 
      margin-top: 32px; 
      gap: 32px;
    }
    .notes-section { flex: 1; }
    .notes-title { 
      font-size: 11px; 
      font-weight: 700; 
      color: #6b7280; 
      text-transform: uppercase;
      margin-bottom: 8px; 
    }
    .notes-content { 
      font-size: 12px; 
      color: #374151; 
      white-space: pre-wrap; 
      line-height: 1.7; 
    }
    .notes-block { margin-bottom: 16px; }
    
    /* Totals */
    .totals-box { 
      width: 280px; 
      background: #f9fafb; 
      padding: 20px; 
      border-radius: 8px; 
      border: 1px solid #e5e7eb; 
    }
    .total-row { 
      display: flex; 
      justify-content: space-between; 
      margin: 8px 0; 
      font-size: 13px;
      color: #6b7280;
    }
    .total-row.grand { 
      border-top: 1px solid #d1d5db; 
      padding-top: 12px; 
      margin-top: 12px; 
    }
    .total-row.grand span:first-child { font-weight: 700; color: #111827; font-size: 14px; }
    .total-row.grand span:last-child { font-weight: 700; font-size: 20px; color: #0d9488; }
    .currency-note { text-align: right; font-size: 11px; color: #9ca3af; margin-top: 8px; }
    
    /* Signatures */
    .signatures { 
      display: flex; 
      justify-content: space-between; 
      margin-top: 60px; 
      gap: 48px;
    }
    .signature-box { flex: 1; text-align: center; }
    .signature-line { 
      border-bottom: 1px solid #333; 
      height: 50px; 
      margin-bottom: 8px; 
    }
    .signature-label { font-size: 12px; font-weight: 600; color: #6b7280; }
    
    /* Footer */
    .footer { 
      margin-top: 48px; 
      padding-top: 16px; 
      border-top: 1px solid #e5e7eb; 
      text-align: center; 
      font-size: 11px; 
      color: #9ca3af; 
    }
    .footer a { color: #0d9488; text-decoration: none; font-weight: 600; }
    
    @media print {
      body { padding: 20px; }
      @page { margin: 15mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        <h1>報 價 單</h1>
        <h2>傑太環境工程顧問有限公司</h2>
        <div class="company-details">
          <p>統一編號：60779653</p>
          <p>地址：新北市土城區金城路二段245巷40號1F</p>
          <p>電話：${formData.companyPhone || '02-6609-5888 #103'}</p>
          <p>聯絡人：${formData.companyContact || '張惟荏'}</p>
        </div>
      </div>
      <div class="quote-info">
        <div class="quote-info-row">
          <span class="quote-info-label">報價單號：</span>
          <span class="quote-number">${formData.quoteNumber}</span>
        </div>
        <div class="quote-info-row">
          <span class="quote-info-label">報價日期：</span>
          <span>${formData.date}</span>
        </div>
        <div class="quote-info-row">
          <span class="quote-info-label">有效期限：</span>
          <span>${formData.validUntil}</span>
        </div>
        <div class="project-box">
          <div class="project-label">專案名稱 Project Name</div>
          <div class="project-name">${formData.projectName || '-'}</div>
        </div>
      </div>
    </div>

    <div class="section-title">客戶資料 Customer</div>
    <div class="client-grid">
      <div class="client-row">
        <span class="client-label">客戶名稱：</span>
        <span class="client-value highlight">${formData.clientName || '-'}</span>
      </div>
      <div class="client-row">
        <span class="client-label">統一編號：</span>
        <span class="client-value">${formData.clientTaxId || '-'}</span>
      </div>
      <div class="client-row">
        <span class="client-label">聯絡人：</span>
        <span class="client-value">${formData.clientContact || '-'}</span>
      </div>
      <div class="client-row">
        <span class="client-label">電話：</span>
        <span class="client-value">${formData.clientPhone || '-'}</span>
      </div>
      <div class="client-row full">
        <span class="client-label">地址：</span>
        <span class="client-value">${formData.clientAddress || '-'}</span>
      </div>
      <div class="client-row full">
        <span class="client-label">Email：</span>
        <span class="client-value">${formData.clientEmail || '-'}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 40px;">No.</th>
          <th style="width: 22%;">項目名稱</th>
          <th style="width: 25%;">規格描述 / 備註</th>
          <th class="center" style="width: 60px;">頻率</th>
          <th class="center" style="width: 50px;">單位</th>
          <th class="right" style="width: 55px;">數量</th>
          <th class="right" style="width: 75px;">單價</th>
          <th class="right" style="width: 95px;">複價(NT$)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="summary">
      <div class="notes-section">
        <div class="notes-block">
          <div class="notes-title">備註 Notes</div>
          <div class="notes-content">${formData.notes || '-'}</div>
        </div>
        <div class="notes-block">
          <div class="notes-title">付款方式</div>
          <div class="notes-content">${formData.paymentMethod || '-'}</div>
        </div>
        <div class="notes-block">
          <div class="notes-title">付款期限</div>
          <div class="notes-content">${formData.paymentTerms || '-'}</div>
        </div>
      </div>
      <div class="totals-box">
        <div class="total-row">
          <span>合計 (Subtotal)</span>
          <span>NT$ ${subtotal.toLocaleString()}</span>
        </div>
        <div class="total-row">
          <span>營業稅 (Tax 5%)</span>
          <span>NT$ ${tax.toLocaleString()}</span>
        </div>
        <div class="total-row grand">
          <span>總計 (Total)</span>
          <span>NT$ ${grandTotal.toLocaleString()}</span>
        </div>
        <div class="currency-note">幣別：新台幣 (TWD)</div>
      </div>
    </div>

    <div class="signatures">
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">傑太環境工程顧問有限公司 (簽章)</div>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">客戶確認簽回 (簽章)</div>
      </div>
    </div>

    <div class="footer">
      <a href="https://www.jetenv.com.tw/">https://www.jetenv.com.tw/</a> | 傑太環境工程顧問有限公司 | ${formData.quoteNumber}
    </div>
  </div>
</body>
</html>`;
  };

  // --- 一鍵寄出功能 ---
  const handleSend = async () => {
    // 驗證客戶 Email
    if (!formData.clientEmail) {
      alert('❌ 請先填寫客戶 Email');
      return;
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.clientEmail)) {
      alert('❌ 請輸入有效的 Email 格式');
      return;
    }

    // 確認寄送
    if (!confirm(`確定要寄送報價單給 ${formData.clientContact || formData.clientName}\n(${formData.clientEmail}) 嗎?`)) {
      return;
    }

    setSending(true);

    try {
      // 先儲存報價單
      await save(true);

      // 生成 HTML
      const quoteHtml = generateQuoteHtml();

      // 準備 Email 內容
      const emailData = {
        to: formData.clientEmail,
        subject: `【傑太環境】報價單 ${formData.quoteNumber} - ${formData.projectName || '專案報價'}`,
        clientName: formData.clientName,
        clientContact: formData.clientContact,
        quoteNumber: formData.quoteNumber,
        projectName: formData.projectName,
        grandTotal: grandTotal,
        companyContact: formData.companyContact,
        companyPhone: formData.companyPhone,
        quoteHtml: quoteHtml,
        // Email 正文草稿
        emailBody: `
${formData.clientContact || formData.clientName} 您好，

感謝您對傑太環境工程的信任與支持！

附件為「${formData.projectName || '專案'}」之報價單（單號：${formData.quoteNumber}），
報價總金額為 NT$ ${grandTotal.toLocaleString()} 元（含稅）。

報價單有效期限至 ${formData.validUntil}，
如有任何問題或需要調整，歡迎隨時與我們聯繫。

若報價內容無誤，請於報價單簽名處簽章後回傳，
我們將盡速安排後續作業。

祝 商祺

${formData.companyContact || '張惟荏'}
傑太環境工程顧問有限公司
電話：${formData.companyPhone || '02-6609-5888 #103'}
網站：https://www.jetenv.com.tw/
        `.trim()
      };

      // 呼叫 n8n webhook
      const response = await fetch(N8N_EMAIL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        throw new Error(`寄送失敗: ${response.status}`);
      }

      // 更新狀態為「已發送」
      setFormData(prev => ({ ...prev, status: 'sent' }));
      await save(true);

      alert(`✅ 報價單已成功寄送至 ${formData.clientEmail}`);

    } catch (error) {
      console.error('寄送失敗:', error);
      alert(`❌ 寄送失敗: ${error.message}\n請稍後再試或聯繫系統管理員`);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className={`bg-white ${isPrintMode ? '' : 'shadow-xl rounded-xl border border-gray-200'} flex flex-col min-h-[calc(100vh-6rem)] w-full`}>

      {!isPrintMode && (
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-3 justify-between items-center sticky top-0 z-20">
          <button onClick={onBack} className="text-gray-600 hover:text-gray-900 flex items-center">
            <ArrowLeft className="w-5 h-5 mr-1" /> 返回
          </button>

          <div className="flex items-center space-x-2">
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className={`text-sm font-bold uppercase rounded border-gray-300 shadow-sm focus:ring-teal-500 focus:border-teal-500
                ${formData.status === 'ordered' ? 'text-green-600 bg-green-50' :
                  formData.status === 'confirmed' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600'}`}
            >
              <option value="draft">草稿 Draft</option>
              <option value="sent">已發送 Sent</option>
              <option value="confirmed">已確認 Confirmed</option>
              <option value="ordered">已轉訂單 Ordered</option>
              <option value="cancelled">已取消 Cancelled</option>
            </select>
            <div className="h-6 w-px bg-gray-300 mx-2"></div>
            {quoteId && (
              <button onClick={versionUp} className="btn-secondary text-xs sm:text-sm">
                <Copy className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">另存 V{formData.version + 1}</span>
              </button>
            )}
            <button onClick={() => { onPrintToggle(true); setTimeout(() => window.print(), 100); }} className="btn-secondary text-xs sm:text-sm">
              <Printer className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">列印 / PDF</span>
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !formData.clientEmail}
              className={`flex items-center px-3 py-2 rounded transition-colors text-xs sm:text-sm border ${sending
                ? 'bg-blue-100 text-blue-400 border-blue-200 cursor-not-allowed'
                : formData.clientEmail
                  ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
              title={!formData.clientEmail ? '請先填寫客戶 Email' : '寄送報價單給客戶'}
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 sm:mr-1 animate-spin" /> <span className="hidden sm:inline">寄送中...</span></>
              ) : (
                <><Send className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">寄出</span></>
              )}
            </button>
            <button onClick={() => save()} disabled={saving} className="btn-primary text-xs sm:text-sm">
              <Save className="w-4 h-4 sm:mr-1" /> {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      )}

      {/* --- Document Content (V6.2: 使用 table 結構 + 列印頁尾) --- */}
      <div className={`flex-1 ${isPrintMode ? 'p-0 w-full max-w-[210mm] mx-auto print-container' : 'p-8 sm:p-12'}`}>

        {/* Cancel Print Button */}
        {isPrintMode && (
          <div className="no-print fixed top-4 right-4 z-50">
            <button
              onClick={() => onPrintToggle(false)}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded shadow-lg hover:bg-red-700"
            >
              <X className="w-5 h-5 mr-1" /> 結束預覽 / 返回
            </button>
          </div>
        )}

        <table className="w-full">
          {/* THEAD: 這是會每頁重複出現的表頭 */}
          <thead>
            <tr>
              <td>
                <div className="pb-6"> {/* 表頭內容 */}
                  <header className="flex justify-between items-start mb-4 border-b-2 border-teal-700 pb-4 relative">
                    <div className="flex gap-6">
                      <div className="relative group">
                        <img
                          src={logoPreview}
                          alt="Company Logo"
                          className="h-24 w-auto object-contain"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        {!isPrintMode && (
                          <label className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-10 cursor-pointer transition-all">
                            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setLogoPreview)} className="hidden" />
                          </label>
                        )}
                      </div>
                      <div className="pt-1">
                        <h1 className="text-3xl font-bold text-teal-900 tracking-wider mb-2">報 價 單</h1>
                        <h2 className="text-lg font-bold text-gray-700">傑太環境工程顧問有限公司</h2>
                        {/* 這是公司資訊區塊的開始 */}
                        <div className="mt-4 text-sm text-gray-600 space-y-0.5 leading-relaxed">
                          <p>統一編號：<span className="font-medium">60779653</span></p>
                          <p>地　　址：新北市土城區金城路二段245巷40號1F</p>

                          {/* 電話欄位 */}
                          <div className="flex items-center">
                            <span>電　　話：</span>
                            {isPrintMode ? (
                              <span>{formData.companyPhone}</span>
                            ) : (
                              <input
                                className="border-b border-gray-300 focus:border-teal-500 outline-none px-1 w-40 bg-transparent text-gray-600"
                                value={formData.companyPhone || ''}
                                onChange={(e) => setFormData({ ...formData, companyPhone: e.target.value })}
                              />
                            )}
                          </div>

                          {/* 聯絡人欄位 */}
                          <div className="flex items-center">
                            <span>聯 絡 人：</span>
                            {isPrintMode ? (
                              <span>{formData.companyContact}</span>
                            ) : (
                              <input
                                className="border-b border-gray-300 focus:border-teal-500 outline-none px-1 w-40 bg-transparent text-gray-600"
                                value={formData.companyContact || ''}
                                onChange={(e) => setFormData({ ...formData, companyContact: e.target.value })}
                              />
                            )}
                          </div>
                        </div>
                        {/* 這是公司資訊區塊的結束 */}
                      </div>
                    </div>

                    <div className="w-1/3 text-right">
                      <div className="inline-block text-left w-full">
                        <div className="grid grid-cols-3 gap-y-2 text-sm items-center mb-4">
                          <div className="contents">
                            <span className="text-gray-500 font-medium">報價單號：</span>
                            {isPrintMode ? (
                              <span className="col-span-2 text-right font-bold text-teal-700">{formData.quoteNumber}</span>
                            ) : (
                              <input
                                className="col-span-2 text-right font-bold text-teal-700 border-none p-0 bg-transparent focus:ring-0"
                                value={formData.quoteNumber}
                                onChange={e => setFormData({ ...formData, quoteNumber: e.target.value })}
                              />
                            )}
                          </div>
                          <div className="contents">
                            <span className="text-gray-500 font-medium">報價日期：</span>
                            {isPrintMode ? (
                              <span className="col-span-2 text-right text-gray-800">{formData.date}</span>
                            ) : (
                              <input
                                type="date"
                                className="col-span-2 text-right border-none p-0 bg-transparent focus:ring-0 text-gray-800"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                              />
                            )}
                          </div>
                          <div className="contents">
                            <span className="text-gray-500 font-medium">有效期限：</span>
                            {isPrintMode ? (
                              <span className="col-span-2 text-right text-gray-800">{formData.validUntil}</span>
                            ) : (
                              <input
                                type="date"
                                className="col-span-2 text-right border-none p-0 bg-transparent focus:ring-0 text-gray-800"
                                value={formData.validUntil}
                                onChange={e => setFormData({ ...formData, validUntil: e.target.value })}
                              />
                            )}
                          </div>
                        </div>
                        <div className="bg-teal-50 p-3 rounded border border-teal-100">
                          <label className="block text-xs font-bold text-teal-800 mb-1">專案名稱 Project Name</label>
                          {isPrintMode ? (
                            <div className="text-sm font-medium text-teal-900">{formData.projectName}</div>
                          ) : (
                            <input
                              className="w-full bg-white border border-teal-200 rounded px-2 py-1 text-sm focus:border-teal-500 focus:ring-teal-500"
                              placeholder="請輸入專案名稱..."
                              value={formData.projectName}
                              onChange={e => setFormData({ ...formData, projectName: e.target.value })}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </header>
                </div>
              </td>
            </tr>
          </thead>

          {/* TBODY: 報價內容 + 客戶資料 + 頁尾 */}
          <tbody>
            <tr>
              <td>
                {/* Client Info */}
                <section className="mb-2">
                  <div className="flex justify-between items-end mb-2 border-b border-gray-200 pb-1">
                    <h3 className="font-bold text-gray-700">客戶資料 Customer</h3>
                    {!isPrintMode && (
                      <select
                        className="text-xs border-gray-300 rounded py-1 pl-2 pr-8 shadow-sm focus:border-teal-500 focus:ring-teal-500"
                        onChange={handleClientSelect}
                        defaultValue=""
                      >
                        <option value="" disabled>快速載入舊客戶...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex items-center"><span className="w-20 text-gray-500">客戶名稱：</span>{isPrintMode ? <span className="flex-1 font-medium text-gray-900">{formData.clientName}</span> : <input className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent font-medium text-gray-900" value={formData.clientName} onChange={e => setFormData({ ...formData, clientName: e.target.value })} />}</div>
                    <div className="flex items-center">{isPrintMode ? <><span className="w-20 text-gray-500">統一編號：</span><span className="flex-1 text-gray-900">{formData.clientTaxId}</span></> : <><span className="w-20 text-gray-500">統一編號：</span><input className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent" value={formData.clientTaxId} onChange={e => setFormData({ ...formData, clientTaxId: e.target.value })} maxLength={8} /><button type="button" onClick={async () => { if (!formData.clientTaxId || formData.clientTaxId.length !== 8) { alert('請輸入正確的 8 碼統編'); return; } try { const res = await fetch(`${N8N_MOEA_API_URL}?taxId=${formData.clientTaxId}`); const data = await res.json(); if (data.found && data.data) { setFormData(prev => ({ ...prev, clientName: data.data.name || prev.clientName, clientAddress: data.data.address || prev.clientAddress, clientContact: data.data.representative || prev.clientContact })); alert(`✅ 已帶入：${data.data.name}`); } else { alert('❌ 查無此統編資料'); } } catch (err) { console.error(err); alert('查詢失敗，請稍後再試'); } }} className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">🔍</button></>}</div>
                    <div className="flex items-center"><span className="w-20 text-gray-500">聯絡人：</span>{isPrintMode ? <span className="flex-1 text-gray-900">{formData.clientContact}</span> : <input className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent" value={formData.clientContact} onChange={e => setFormData({ ...formData, clientContact: e.target.value })} />}</div>
                    <div className="flex items-center"><span className="w-20 text-gray-500">電話：</span>{isPrintMode ? <span className="flex-1 text-gray-900">{formData.clientPhone}</span> : <input className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent" value={formData.clientPhone} onChange={e => setFormData({ ...formData, clientPhone: e.target.value })} />}</div>
                    <div className="flex items-center col-span-2"><span className="w-20 text-gray-500">地址：</span>{isPrintMode ? <span className="flex-1 text-gray-900">{formData.clientAddress}</span> : <input className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent" value={formData.clientAddress} onChange={e => setFormData({ ...formData, clientAddress: e.target.value })} />}</div>
                    <div className="flex items-center col-span-2"><span className="w-20 text-gray-500">Email：</span>{isPrintMode ? <span className="flex-1 text-gray-900">{formData.clientEmail}</span> : <input type="email" className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent" placeholder="client@example.com" value={formData.clientEmail} onChange={e => setFormData({ ...formData, clientEmail: e.target.value })} />}</div>
                  </div>
                </section>

                {/* 👇 修改：如果是列印模式 (isPrintMode) 就設為 min-h-0 (無高度限制)，否則維持 300px */}
                <section className={`mb-8 ${isPrintMode ? 'min-h-0' : 'min-h-[300px]'}`}>
                  <table className="min-w-full divide-y divide-gray-300 border-t border-b border-gray-300 table-fixed">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-bold text-teal-800 w-10">No.</th>
                        <th className="px-2 py-2 text-left text-xs font-bold text-teal-800" style={{ width: '25%', minWidth: '120px' }}>項目名稱</th>
                        <th className="px-2 py-2 text-left text-xs font-bold text-teal-800" style={{ width: '25%', minWidth: '120px' }}>規格描述 / 備註</th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-teal-800 w-16">頻率</th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-teal-800 w-14">單位</th>
                        <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 w-16">數量</th>
                        <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 w-20">單價</th>
                        <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 w-24">複價(NT$)</th>
                        {!isPrintMode && <th className="px-2 py-2 w-8"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {formData.items.map((item, idx) => (
                        <tr key={item.id} className="group page-break-inside-avoid">
                          <td className="px-2 py-2 text-xs text-gray-500 align-top pt-3">{idx + 1}</td>
                          <td className="px-2 py-2 align-top">
                            {isPrintMode ? (
                              <div className="w-full text-sm font-bold text-gray-900 whitespace-pre-wrap">{item.name}</div>
                            ) : (
                              <textarea
                                className="w-full border border-gray-200 rounded p-2 text-sm font-bold text-gray-900 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 hover:bg-white transition-colors"
                                style={{ resize: 'both', minHeight: '60px', minWidth: '100px' }}
                                value={item.name}
                                onChange={e => handleItemChange(item.id, 'name', e.target.value)}
                                placeholder="輸入項目名稱..."
                              />
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {isPrintMode ? (
                              <div className="w-full text-xs text-gray-600 whitespace-pre-wrap">{item.spec}</div>
                            ) : (
                              <textarea
                                className="w-full border border-gray-200 rounded p-2 text-xs text-gray-600 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 hover:bg-white transition-colors placeholder-gray-300"
                                style={{ resize: 'both', minHeight: '60px', minWidth: '100px' }}
                                value={item.spec}
                                onChange={e => handleItemChange(item.id, 'spec', e.target.value)}
                                placeholder="輸入規格描述或備註..."
                              />
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {isPrintMode ? <div className="w-full text-center text-xs text-gray-900">{item.frequency}</div> : <input className="w-full text-center border border-gray-200 rounded p-1 text-xs text-gray-900 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 hover:bg-white" value={item.frequency} onChange={e => handleItemChange(item.id, 'frequency', e.target.value)} placeholder="次/月" />}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {isPrintMode ? <div className="w-full text-center text-xs text-gray-900">{item.unit}</div> : <input className="w-full text-center border border-gray-200 rounded p-1 text-xs text-gray-900 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 hover:bg-white" value={item.unit} onChange={e => handleItemChange(item.id, 'unit', e.target.value)} />}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {isPrintMode ? <div className="w-full text-right text-sm text-gray-900">{item.qty}</div> : <input type="number" className="w-full text-right border border-gray-200 rounded p-1 text-sm text-gray-900 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 hover:bg-white" value={item.qty} onChange={e => handleItemChange(item.id, 'qty', Number(e.target.value))} />}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {isPrintMode ? <div className="w-full text-right text-sm text-gray-900">{item.price?.toLocaleString()}</div> : <input type="number" className="w-full text-right border border-gray-200 rounded p-1 text-sm text-gray-900 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 hover:bg-white" value={item.price} onChange={e => handleItemChange(item.id, 'price', Number(e.target.value))} />}
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-medium text-gray-900 align-top pt-3">
                            {(item.price * item.qty).toLocaleString()}
                          </td>
                          {!isPrintMode && (
                            <td className="px-2 py-2 text-center align-top pt-2">
                              <button onClick={() => setFormData(p => ({ ...p, items: p.items.filter(i => i.id !== item.id) }))} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!isPrintMode && (
                    <div className="mt-4 flex gap-2 items-center">
                      <button onClick={() => addItem()} className="flex items-center text-sm text-teal-600 hover:text-teal-800 font-medium px-3 py-1 border border-teal-200 rounded hover:bg-teal-50">
                        <Plus className="w-4 h-4 mr-1" /> 手動新增項目
                      </button>
                      <div className="h-6 w-px bg-gray-300 mx-2"></div>
                      <div className="relative">
                        <select onChange={handleProductSelect} className="pl-8 pr-4 py-1 text-sm border-gray-300 rounded shadow-sm focus:ring-teal-500 focus:border-teal-500 cursor-pointer hover:bg-gray-50" defaultValue="">
                          <option value="" disabled>從產品/服務庫匯入...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>+ {p.name} (NT${p.price})</option>
                          ))}
                        </select>
                        <div className="absolute left-2 top-1.5 pointer-events-none text-gray-500"><ListPlus className="w-4 h-4" /></div>
                      </div>
                    </div>
                  )}
                </section>

                {/* Footer Section: 合計與簽名 (放在 tbody 最後，避免佔用 tfoot 固定位置) */}
                <div className="pt-4 page-break-inside-avoid">
                  <div className="flex flex-col md:flex-row gap-8 break-inside-avoid">
                    <div className="flex-1 space-y-4">
                      <SmartSelect label="付款方式 Payment Method" options={PAYMENT_METHODS} value={formData.paymentMethod} onChange={(val) => setFormData({ ...formData, paymentMethod: val })} isPrintMode={isPrintMode} />
                      <SmartSelect label="付款期限 Payment Terms" options={PAYMENT_TERMS} value={formData.paymentTerms} onChange={(val) => setFormData({ ...formData, paymentTerms: val })} isPrintMode={isPrintMode} />
                      <NoteSelector value={formData.notes} onChange={(val) => setFormData({ ...formData, notes: val })} isPrintMode={isPrintMode} />
                    </div>
                    <div className="w-full md:w-80">
                      <div className="bg-gray-50 p-6 rounded-lg space-y-3 border border-gray-200">
                        <div className="flex justify-between text-sm text-gray-600"><span>合計 (Subtotal)</span><span className="font-mono">NT$ {subtotal.toLocaleString()}</span></div>
                        <div className="flex justify-between text-sm text-gray-600"><span>營業稅 (Tax 5%)</span><span className="font-mono">NT$ {tax.toLocaleString()}</span></div>
                        <div className="border-t border-gray-300 my-2"></div>
                        <div className="flex justify-between items-baseline"><span className="text-base font-bold text-gray-800">總計 (Total)</span><span className="text-xl font-bold text-teal-700 font-mono">NT$ {grandTotal.toLocaleString()}</span></div>
                        <div className="text-right text-xs text-gray-400 mt-1">幣別：新台幣 (TWD)</div>
                      </div>
                    </div>
                  </div>

                  <div className={`mt-24 flex justify-between gap-16 ${!isPrintMode ? 'opacity-50 hover:opacity-100 transition-opacity' : ''}`}>
                    <div className="flex-1 text-center relative group">
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-32 h-32 z-10 pointer-events-none">
                        <img src={stampPreview} alt="Company Stamp" className="w-full h-full object-contain opacity-80" onError={(e) => { e.target.style.display = 'none'; }} />
                      </div>
                      {!isPrintMode && (
                        <label className="absolute inset-0 cursor-pointer z-20" title="點擊上傳其他印章">
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setStampPreview)} className="hidden" />
                        </label>
                      )}
                      <div className="border-b border-gray-800 pb-2 mb-2"></div>
                      <p className="text-sm font-bold text-gray-600">傑太環境工程顧問有限公司 (簽章)</p>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="border-b border-gray-800 pb-2 mb-2 mt-[60px]"></div>
                      <p className="text-sm font-bold text-gray-600">客戶確認簽回 (簽章)</p>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 列印頁尾 - 每頁底部顯示網址 */}
        <div className="print-footer">
          <div className="print-footer-content">
            <span className="print-footer-url">https://www.jetenv.com.tw/</span>
            <span className="print-footer-company">傑太環境工程顧問有限公司</span>
            <span className="print-footer-page">{formData.quoteNumber}</span>
          </div>
        </div>
      </div>

      <style>{`
        .btn-primary { @apply flex items-center px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 shadow-sm transition-colors; }
        .btn-secondary { @apply flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors border border-gray-300; }
        
        /* 頁尾：平常隱藏，列印時顯示 */
        .print-footer {
          display: none;
        }
        
        @media print {
          @page { 
            margin: 10mm 10mm 20mm 10mm;
            size: A4 portrait; 
          }
          html, body, #root { 
            height: auto !important; 
            overflow: visible !important; 
            min-height: 0 !important;
            margin: 0; 
            padding: 0; 
          }
          .min-h-screen { min-height: 0 !important; }
          
          .no-print { display: none !important; }
          .print-container { padding: 0; margin: 0; width: 100%; }
          .page-break-inside-avoid { page-break-inside: avoid; }
          
          /* 表格分頁設定 */
          table { width: 100%; border-collapse: collapse; }
          thead { display: table-header-group !important; }
          tbody { display: table-row-group !important; }
          tfoot { display: table-row-group !important; }
          
          /* 列印頁尾：固定在每頁底部 */
          .print-footer {
            display: block;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 14mm;
            padding: 3mm 10mm;
            border-top: 1px solid #d1d5db;
            background: white;
            font-size: 9pt;
            color: #6b7280;
          }
          .print-footer-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .print-footer-url {
            color: #0d9488;
            font-weight: 600;
          }
          .print-footer-company {
            color: #9ca3af;
            font-size: 8pt;
          }
        }
      `}</style>
    </div>
  );
};

// --- Customer Manager ---
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

// --- Product Manager ---
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
