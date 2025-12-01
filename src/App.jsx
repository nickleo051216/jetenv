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
  serverTimestamp
} from 'firebase/firestore';
import {
  Plus, Trash2, FileText, Users, Printer, Save, Copy,
  ArrowLeft, Package, Upload, Image as ImageIcon, CheckCircle, Stamp, ListPlus, X, Search, Edit, RotateCcw
} from 'lucide-react';

// --- 設定區：預設圖檔路徑 ---
// 請確保你的圖片已放入專案的 public 資料夾，並命名如下
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
const SmartSelect = ({ label, options, value, onChange, placeholder = "手動輸入..." }) => {
  const isCustom = !options.includes(value) && value !== '';
  const [mode, setMode] = useState(isCustom ? 'custom' : 'select');

  useEffect(() => {
    if (!options.includes(value) && value !== '') {
      setMode('custom');
    } else if (options.includes(value)) {
      setMode('select');
    }
  }, [value, options]);

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

const NoteSelector = ({ value, onChange }) => {
  const handleTemplateChange = (e) => {
    const idx = e.target.value;
    if (idx === 'custom') return;
    if (idx !== '') {
      onChange(NOTE_TEMPLATES[idx].content);
    }
  };

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
                  { id: 'dashboard', label: '報價列表', icon: FileText },
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
const Dashboard = ({ user, onEdit, onCreate }) => {
  const [quotes, setQuotes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "傑太環境工程報價系統";
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'quotations'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
      setQuotes(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (confirm('確定要刪除此報價單嗎？')) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', id));
    }
  };

  const filteredQuotes = useMemo(() => {
    if (!searchTerm) return quotes;
    const lower = searchTerm.toLowerCase();
    return quotes.filter(q =>
      q.quoteNumber?.toLowerCase().includes(lower) ||
      q.clientName?.toLowerCase().includes(lower) ||
      q.projectName?.toLowerCase().includes(lower)
    );
  }, [quotes, searchTerm]);

  const statusConfig = {
    draft: { label: '草稿', color: 'bg-gray-100 text-gray-600 border-gray-200' },
    sent: { label: '已發送', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    confirmed: { label: '已確認', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    ordered: { label: '已轉訂單', color: 'bg-green-50 text-green-600 border-green-200' },
    cancelled: { label: '已取消', color: 'bg-red-50 text-red-600 border-red-200' },
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 border-l-4 border-teal-600 pl-3">專案報價管理</h2>

        <div className="flex flex-1 w-full md:w-auto gap-2 justify-end">
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
          <button
            onClick={onCreate}
            className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5 mr-1" /> 建立新報價
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200 w-full">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-gray-200 w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">單號 / 專案</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">客戶</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">最後編輯</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">狀態</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">總金額 (含稅)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredQuotes.map((quote) => {
                const status = statusConfig[quote.status] || statusConfig.draft;
                return (
                  <tr
                    key={quote.id}
                    onClick={() => onEdit(quote.id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-bold text-teal-700">{quote.quoteNumber}</div>
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
                      <button onClick={(e) => handleDelete(e, quote.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-gray-100 rounded-full">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                    找不到符合的報價單
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

// --- Editor ---
const QuoteEditor = ({ user, quoteId, setActiveQuoteId, onBack, onPrintToggle, isPrintMode }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(DEFAULT_LOGO_PATH);
  const [stampPreview, setStampPreview] = useState(DEFAULT_STAMP_PATH);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    quoteNumber: generateQuoteNumber(),
    projectName: '',
    status: 'draft',
    version: 1,
    date: formatDate(new Date()),
    validUntil: formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
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
            <button onClick={() => save()} disabled={saving} className="btn-primary text-xs sm:text-sm">
              <Save className="w-4 h-4 sm:mr-1" /> {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      )}

      {/* --- Document --- */}
      <div className={`flex-1 ${isPrintMode ? 'p-0 w-full max-w-[210mm] mx-auto' : 'p-8 sm:p-12'}`}>

        {/* Print Mode Cancel Button (Visible only on Screen) */}
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

        {/* Header with Logo */}
        <header className="flex justify-between items-start mb-8 border-b-2 border-teal-700 pb-6 relative">
          <div className="flex gap-6">
            {/* Logo Area */}
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
              <div className="mt-4 text-sm text-gray-600 space-y-0.5 leading-relaxed">
                <p>統一編號：<span className="font-medium">60779653</span></p>
                <p>地　　址：新北市土城區金城路二段245巷40號1F</p>
                <p>電　　話：0988839649</p>
                <p>聯 絡 人：Nick Chang</p>
              </div>
            </div>
          </div>

          <div className="w-1/3 text-right">
            <div className="inline-block text-left w-full">
              <div className="grid grid-cols-3 gap-y-2 text-sm items-center mb-4">
                <span className="text-gray-500 font-medium">報價單號：</span>
                <input
                  className="col-span-2 text-right font-bold text-teal-700 border-none p-0 bg-transparent focus:ring-0"
                  value={formData.quoteNumber}
                  onChange={e => setFormData({ ...formData, quoteNumber: e.target.value })}
                />
                <span className="text-gray-500 font-medium">報價日期：</span>
                <input
                  type="date"
                  className="col-span-2 text-right border-none p-0 bg-transparent focus:ring-0 text-gray-800"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                />
                <span className="text-gray-500 font-medium">有效期限：</span>
                <input
                  type="date"
                  className="col-span-2 text-right border-none p-0 bg-transparent focus:ring-0 text-gray-800"
                  value={formData.validUntil}
                  onChange={e => setFormData({ ...formData, validUntil: e.target.value })}
                />
              </div>
              <div className="bg-teal-50 p-3 rounded border border-teal-100">
                <label className="block text-xs font-bold text-teal-800 mb-1">專案名稱 Project Name</label>
                <input
                  className="w-full bg-white border border-teal-200 rounded px-2 py-1 text-sm focus:border-teal-500 focus:ring-teal-500"
                  placeholder="請輸入專案名稱..."
                  value={formData.projectName}
                  onChange={e => setFormData({ ...formData, projectName: e.target.value })}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Client Info */}
        <section className="mb-8">
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
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="flex items-center">
              <span className="w-20 text-gray-500">客戶名稱：</span>
              <input
                className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent font-medium text-gray-900"
                value={formData.clientName}
                placeholder="公司名稱"
                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
              />
            </div>
            <div className="flex items-center">
              <span className="w-20 text-gray-500">統一編號：</span>
              <input
                className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent"
                value={formData.clientTaxId}
                placeholder="8碼統編"
                onChange={e => setFormData({ ...formData, clientTaxId: e.target.value })}
              />
            </div>
            <div className="flex items-center">
              <span className="w-20 text-gray-500">聯絡人：</span>
              <input
                className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent"
                value={formData.clientContact}
                onChange={e => setFormData({ ...formData, clientContact: e.target.value })}
              />
            </div>
            <div className="flex items-center">
              <span className="w-20 text-gray-500">電話：</span>
              <input
                className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent"
                value={formData.clientPhone}
                onChange={e => setFormData({ ...formData, clientPhone: e.target.value })}
              />
            </div>
            <div className="flex items-center col-span-2">
              <span className="w-20 text-gray-500">地址：</span>
              <input
                className="flex-1 border-0 border-b border-gray-200 py-0 px-1 focus:ring-0 focus:border-teal-500 bg-transparent"
                value={formData.clientAddress}
                onChange={e => setFormData({ ...formData, clientAddress: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* Items Table */}
        <section className="mb-8 min-h-[300px]">
          <table className="min-w-full divide-y divide-gray-300 border-t border-b border-gray-300">
            <thead className="bg-teal-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-bold text-teal-800 w-10">No.</th>
                <th className="px-2 py-2 text-left text-xs font-bold text-teal-800 w-1/4">項目名稱</th>
                <th className="px-2 py-2 text-left text-xs font-bold text-teal-800 w-1/4">規格描述 / 備註</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-teal-800 w-16">頻率</th>
                <th className="px-2 py-2 text-center text-xs font-bold text-teal-800 w-14">單位</th>
                <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 w-20">數量</th>
                <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 w-24">單價</th>
                <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 w-24">複價(NT$)</th>
                {!isPrintMode && <th className="px-2 py-2 w-8"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {formData.items.map((item, idx) => (
                <tr key={item.id} className="group">
                  <td className="px-2 py-2 text-xs text-gray-500 align-top pt-3">{idx + 1}</td>
                  <td className="px-2 py-2 align-top">
                    <textarea
                      className="w-full border-0 p-1 text-sm font-bold text-gray-900 focus:ring-0 resize-none bg-transparent"
                      rows={1}
                      value={item.name}
                      placeholder="輸入項目"
                      onChange={e => handleItemChange(item.id, 'name', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <textarea
                      className="w-full border-0 p-1 text-xs text-gray-600 focus:ring-0 resize-none bg-transparent placeholder-gray-300"
                      rows={2}
                      value={item.spec}
                      placeholder="規格描述..."
                      onChange={e => handleItemChange(item.id, 'spec', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      className="w-full text-center border-0 p-1 text-xs text-gray-900 focus:ring-0 bg-transparent"
                      value={item.frequency}
                      placeholder="-"
                      onChange={e => handleItemChange(item.id, 'frequency', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      className="w-full text-center border-0 p-1 text-xs text-gray-900 focus:ring-0 bg-transparent"
                      value={item.unit}
                      onChange={e => handleItemChange(item.id, 'unit', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="number"
                      className="w-full text-right border-0 border-b border-transparent group-hover:border-gray-200 p-1 text-sm text-gray-900 focus:ring-0 focus:border-teal-500"
                      value={item.qty}
                      onChange={e => handleItemChange(item.id, 'qty', Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="number"
                      className="w-full text-right border-0 border-b border-transparent group-hover:border-gray-200 p-1 text-sm text-gray-900 focus:ring-0 focus:border-teal-500"
                      value={item.price}
                      onChange={e => handleItemChange(item.id, 'price', Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-medium text-gray-900 align-top pt-3">
                    {(item.price * item.qty).toLocaleString()}
                  </td>
                  {!isPrintMode && (
                    <td className="px-2 py-2 text-center align-top pt-2">
                      <button onClick={() => setFormData(p => ({ ...p, items: p.items.filter(i => i.id !== item.id) }))} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
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

              {/* Product Library Dropdown */}
              <div className="relative">
                <select
                  onChange={handleProductSelect}
                  className="pl-8 pr-4 py-1 text-sm border-gray-300 rounded shadow-sm focus:ring-teal-500 focus:border-teal-500 cursor-pointer hover:bg-gray-50"
                  defaultValue=""
                >
                  <option value="" disabled>從產品/服務庫匯入...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      + {p.name} (NT${p.price})
                    </option>
                  ))}
                </select>
                <div className="absolute left-2 top-1.5 pointer-events-none text-gray-500">
                  <ListPlus className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Footer: Notes & Totals */}
        <div className="flex flex-col md:flex-row gap-8 break-inside-avoid">
          {/* Smart Terms Section */}
          <div className="flex-1 space-y-4">
            <SmartSelect
              label="付款方式 Payment Method"
              options={PAYMENT_METHODS}
              value={formData.paymentMethod}
              onChange={(val) => setFormData({ ...formData, paymentMethod: val })}
            />

            <SmartSelect
              label="付款期限 Payment Terms"
              options={PAYMENT_TERMS}
              value={formData.paymentTerms}
              onChange={(val) => setFormData({ ...formData, paymentTerms: val })}
            />

            <NoteSelector
              value={formData.notes}
              onChange={(val) => setFormData({ ...formData, notes: val })}
            />
          </div>

          {/* Calculations */}
          <div className="w-full md:w-80">
            <div className="bg-gray-50 p-6 rounded-lg space-y-3 border border-gray-200">
              <div className="flex justify-between text-sm text-gray-600">
                <span>合計 (Subtotal)</span>
                <span className="font-mono">NT$ {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>營業稅 (Tax 5%)</span>
                <span className="font-mono">NT$ {tax.toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-300 my-2"></div>
              <div className="flex justify-between items-baseline">
                <span className="text-base font-bold text-gray-800">總計 (Total)</span>
                <span className="text-xl font-bold text-teal-700 font-mono">NT$ {grandTotal.toLocaleString()}</span>
              </div>
              <div className="text-right text-xs text-gray-400 mt-1">幣別：新台幣 (TWD)</div>
            </div>
          </div>
        </div>

        {/* Signature Area (Always visible now, but clear it's for print) */}
        <div className={`mt-24 flex justify-between gap-16 ${!isPrintMode ? 'opacity-50 hover:opacity-100 transition-opacity' : ''}`}>
          <div className="flex-1 text-center relative group">
            {/* Digital Stamp Uploader - 預設顯示 public 資料夾的圖 */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-32 h-32 z-10 pointer-events-none">
              <img
                src={stampPreview}
                alt="Company Stamp"
                className="w-full h-full object-contain opacity-80"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>

            {!isPrintMode && (
              <label className="absolute inset-0 cursor-pointer z-20" title="點擊上傳其他印章 (僅限本次)">
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setStampPreview)} className="hidden" />
              </label>
            )}

            <div className="border-b border-gray-800 pb-2 mb-2"></div>
            <p className="text-sm font-bold text-gray-600">傑太環境工程顧問有限公司 (簽章)</p>
          </div>
          <div className="flex-1 text-center">
            <div className="border-b border-gray-800 pb-2 mb-2 mt-[60px]"></div> {/* Spacing for alignment */}
            <p className="text-sm font-bold text-gray-600">客戶確認簽回 (簽章)</p>
          </div>
        </div>
      </div>

      <style>{`
        .btn-primary { @apply flex items-center px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 shadow-sm transition-colors; }
        .btn-secondary { @apply flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors border border-gray-300; }
        @media print {
          @page { margin: 10mm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; padding: 0; background: white; }
          .no-print { display: none !important; }
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

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'customers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(docs);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return;

    if (editingId) {
      // Update Mode
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', editingId), form);
      setEditingId(null);
    } else {
      // Create Mode
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), form);
    }
    setForm({ name: '', taxId: '', contact: '', phone: '', fax: '', address: '', email: '' });
  };

  const handleEdit = (customer) => {
    setForm(customer);
    setEditingId(customer.id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ name: '', taxId: '', contact: '', phone: '', fax: '', address: '', email: '' });
  };

  const handleDelete = async (id) => { if (confirm('刪除?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', id)); };

  return (
    <div className="space-y-6 w-full">
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input className="input-std md:col-span-2" placeholder="公司名稱" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input-std" placeholder="統一編號" value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} />
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

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200 w-full">
        <table className="min-w-full divide-y divide-gray-200 w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">公司 / 統編</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">聯絡資訊</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {customers.map(c => (
              <tr key={c.id} className={editingId === c.id ? 'bg-orange-50' : ''}>
                <td className="px-4 py-3">
                  <div className="font-bold text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.taxId}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  <div>{c.contact} / {c.phone}</div>
                  <div className="text-xs text-gray-400">{c.address}</div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => handleEdit(c)} className="text-gray-400 hover:text-orange-500"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
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

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(docs);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return;

    const payload = { ...form, price: Number(form.price) };

    if (editingId) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', editingId), payload);
      setEditingId(null);
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'products'), payload);
    }
    setForm({ name: '', spec: '', unit: '式', price: 0 });
  };

  const handleEdit = (product) => {
    setForm(product);
    setEditingId(product.id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ name: '', spec: '', unit: '式', price: 0 });
  };

  const handleDelete = async (id) => { if (confirm('刪除?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id)); };

  return (
    <div className="space-y-6 w-full">
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <input className="input-std md:col-span-2" placeholder="產品/服務名稱" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input-std" placeholder="規格/備註" value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} />
          <input className="input-std w-20" placeholder="單位" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
          <input className="input-std w-24" type="number" placeholder="單價" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          <button className={`text-white py-2 px-4 rounded hover:opacity-90 ${editingId ? 'bg-orange-500' : 'bg-teal-600'}`}>
            {editingId ? '更新' : '新增'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200 w-full">
        <table className="min-w-full divide-y divide-gray-200 w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">項目</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">規格</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">參考單價</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map(p => (
              <tr key={p.id} className={editingId === p.id ? 'bg-orange-50' : ''}>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.spec}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">NT$ {p.price} / {p.unit}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => handleEdit(p)} className="text-gray-400 hover:text-orange-500"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`.input-std { @apply border-gray-300 rounded text-sm focus:ring-teal-500 focus:border-teal-500 w-full; }`}</style>
    </div>
  );
};