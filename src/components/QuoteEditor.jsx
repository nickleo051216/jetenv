import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Copy, Printer, Loader2, Send, Save, X, ListPlus, Plus, Trash2
} from 'lucide-react';
import {
  collection, onSnapshot, doc, getDocs, addDoc, updateDoc,
  runTransaction, query, where, orderBy, limit, serverTimestamp
} from 'firebase/firestore';

import { db, appId } from '../firebase';
import {
  generateQuoteNumber, formatDate, getNextQuoteNumber
} from '../utils/helpers';
import {
  DEFAULT_LOGO_PATH, STAMP_BASE64, NOTE_TEMPLATES,
  N8N_SYNC_API_URL, N8N_EMAIL_API_URL, N8N_MOEA_API_URL,
  PAYMENT_METHODS, PAYMENT_TERMS
} from '../constants';

import Spinner from './Spinner';
import SendingOverlay from './SendingOverlay';
import SearchableClientSelect from './SearchableClientSelect';
import SmartSelect from './SmartSelect';
import NoteSelector from './NoteSelector';

const QuoteEditor = ({ user, quoteId, setActiveQuoteId, triggerToast, onBack, onPrintToggle, isPrintMode }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false); // 寄送狀態
  const [sendingMessage, setSendingMessage] = useState(''); // Loading 訊息
  const [logoPreview, setLogoPreview] = useState(DEFAULT_LOGO_PATH);
  const [stampPreview, setStampPreview] = useState(STAMP_BASE64);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [isDirty, setIsDirty] = useState(false); // ✨ 新增 Dirty Check 狀態

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
    notes: NOTE_TEMPLATES[0].content,
    // 表格欄位寬度設定 (百分比)
    columnWidths: {
      name: 18,    // 項目名稱
      spec: 42,    // 規格描述 (加大)
      frequency: 5, // 頻率
      unit: 5,     // 單位
      qty: 5,      // 數量
      price: 8,    // 單價
      total: 10    // 複價
    },
    quoteNumber: quoteId ? '' : '(系統自動生成)' // ✨ 預設顯示自動生成
  });

  // --- 雲端同步邏輯 (n8n Webhook) ---
  const handleCloudSync = async (mode = 'update') => {
    try {
      const quoteHtml = capturePrintHtml();
      const response = await fetch(N8N_SYNC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, // 'update' 或 'create'
          quoteNumber: formData.quoteNumber,
          projectName: formData.projectName,
          filename: `${formData.quoteNumber}-${formData.projectName}`,
          clientName: formData.clientName,
          grandTotal: grandTotal,
          quoteHtml
        })
      });
      const data = await response.json().catch(() => ({}));
      return response.ok && data.status === 'success';
    } catch (e) {
      console.error('雲端同步失敗:', e);
      return false;
    }
  };

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

  // ✨ 監聽表單變更，設定 Dirty 狀態
  useEffect(() => {
    if (formData && !loading) {
      // 這裡簡單處理：只要不是初始狀態就視為 Dirty
      // 注意：這裡假設 loading 結束後 formData 已被正確設定
      if (quoteId) { // 編輯模式
        setIsDirty(true);
      } else { // 新增模式
        // 檢查是否與初始狀態不同 (這裡簡化判斷，只要有輸入就算)
        if (formData.clientName || formData.items.length > 1 || formData.items[0].name !== '顧問諮詢服務') {
          setIsDirty(true);
        }
      }
    }
  }, [formData, subtotal, tax, grandTotal]);

  // 修正初始載入造成的 Dirty
  useEffect(() => { setIsDirty(false); }, [quoteId]); // 切換單號時重置

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
      note: '',
      nameBoxWidth: null,   // 項目名稱欄位寬度 (null = 自動)
      nameBoxHeight: null,  // 項目名稱欄位高度 (null = 自動)
      specBoxWidth: null,   // 規格描述欄位寬度 (null = 自動)
      specBoxHeight: null   // 規格描述欄位高度 (null = 自動)
    } : {
      id: Date.now(),
      name: '', spec: '', unit: '式', price: 0, qty: 1, frequency: '', note: '',
      nameBoxWidth: null,
      nameBoxHeight: null,
      specBoxWidth: null,
      specBoxHeight: null
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

  // 智慧同步功能 (Smart Sync) - 支援統編防重複
  const syncCustomerData = async (clientName, data) => {
    if (!clientName) return;
    try {
      let customerDoc = null;

      // ✨ 優先用統編查詢（更準確，防止重複）
      if (data.clientTaxId && data.clientTaxId.length === 8) {
        const taxQuery = query(
          collection(db, 'artifacts', appId, 'public', 'data', 'customers'),
          where("taxId", "==", data.clientTaxId)
        );
        const taxSnapshot = await getDocs(taxQuery);
        if (!taxSnapshot.empty) {
          customerDoc = taxSnapshot.docs[0];
        }
      }

      // 若統編沒找到，再用名稱查詢（向後相容）
      if (!customerDoc) {
        const nameQuery = query(
          collection(db, 'artifacts', appId, 'public', 'data', 'customers'),
          where("name", "==", clientName)
        );
        const nameSnapshot = await getDocs(nameQuery);
        if (!nameSnapshot.empty) {
          customerDoc = nameSnapshot.docs[0];
        }
      }

      const customerPayload = {
        name: data.clientName,
        taxId: data.clientTaxId || '',
        contact: data.clientContact || '',
        phone: data.clientPhone || '',
        fax: data.clientFax || '',
        address: data.clientAddress || '',
        email: data.clientEmail || '',
        updatedAt: serverTimestamp()
      };

      if (customerDoc) {
        // 更新既有客戶
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', customerDoc.id), customerPayload);
      } else {
        // 新增客戶
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), {
          ...customerPayload,
          createdAt: serverTimestamp()
        });
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

  const save = async (silent = false, updates = {}) => {
    // 1. UI 防呆：如果是儲存中，或(不是新單且沒修改)，則不執行
    const isNewQuote = !quoteId;
    if (saving) return; // Prevent double submit
    if (!isNewQuote && !isDirty && !silent) return; // Prevent unnecessary save

    if (!silent) setSaving(true);

    try {
      let newId = quoteId;
      let finalQuoteNumber = formData.quoteNumber;

      if (isNewQuote) {
        // ✨✨✨ 新增模式：使用 Transaction 原子性生成單號 + 防撞檢查 ✨✨✨
        await runTransaction(db, async (transaction) => {
          // 1. 準備計數器 Ref
          const counterRef = doc(db, 'artifacts', appId, 'public', 'data', 'sys_counters', 'quotations');
          const counterDoc = await transaction.get(counterRef);

          let nextSeq = 1;
          const now = new Date();
          const yy = String(now.getFullYear()).slice(-2);
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const prefix = `J-${yy}-${mm}`;

          if (counterDoc.exists()) {
            const data = counterDoc.data();
            // 讀取當前序號並 +1
            const currentSeq = data.currentSeq || 0;
            nextSeq = currentSeq + 1;
          } else {
            // Fallback: 如果計數器不存在，從現有資料中撈取最大值 (修正字串排序問題)
            // 不使用 limit(1) 因為字串排序 999 > 1000
            // 改為撈取最近一批 (例如 100 筆) 並手動比對數字大小
            const q = query(
              collection(db, 'artifacts', appId, 'public', 'data', 'quotations'),
              orderBy('createdAt', 'desc'), // 改用時間排序，找最新的
              limit(50)
            );
            const snapshot = await getDocs(q);

            let maxSeq = 0;
            snapshot.forEach(doc => {
              const qNum = doc.data().quoteNumber;
              // 解析 J-YY-MMXXX...
              if (qNum && qNum.startsWith(prefix)) {
                // 取出前綴之後的部分 (即流水號)
                const seqPart = qNum.replace(prefix, '').split('-V')[0];
                const seqNum = parseInt(seqPart, 10);
                if (!isNaN(seqNum) && seqNum > maxSeq) {
                  maxSeq = seqNum;
                }
              }
            });
            nextSeq = maxSeq + 1;
          }

          // 2. 防撞迴圈：確保此號碼真的沒被用過
          let isCollision = true;
          while (isCollision) {
            // 格式化單號 (補零至3碼，若超過3碼則不補)
            const seqStr = String(nextSeq).padStart(3, '0');
            finalQuoteNumber = `${prefix}${seqStr}`;

            // 檢查是否已存在 (Direct Lookup)
            const checkQuery = query(
              collection(db, 'artifacts', appId, 'public', 'data', 'quotations'),
              where('quoteNumber', '==', finalQuoteNumber)
            );
            const checkSnap = await getDocs(checkQuery);

            if (checkSnap.empty) {
              isCollision = false;
            } else {
              // 撞號了 (counter 落後於實際資料)，自動 +1 重試
              console.warn(`碰撞偵測：${finalQuoteNumber} 已存在，嘗試下一個...`);
              nextSeq++;
            }
          }

          // 3. 寫回計數器 (更新為最新可用的)
          transaction.set(counterRef, { currentSeq: nextSeq, lastUpdated: serverTimestamp() }, { merge: true });

          // 4. 建立新報價單
          const newQuoteRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'quotations'));
          newId = newQuoteRef.id;

          const payload = {
            ...formData,
            ...updates,
            quoteNumber: finalQuoteNumber, // 寫入正確單號
            subtotal, tax, grandTotal,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          transaction.set(newQuoteRef, payload);
        });

        // Transaction 成功後，更新本地狀態
        if (!quoteId) setActiveQuoteId(newId);
        setFormData(prev => ({ ...prev, quoteNumber: finalQuoteNumber }));

      } else {
        // ✨ 既有模式：直接更新
        const payload = { ...formData, ...updates, subtotal, tax, grandTotal, updatedAt: serverTimestamp() };
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quotations', quoteId), payload);
      }

      await syncCustomerData(updates.clientName || formData.clientName, { ...formData, ...updates });
      await syncProductData(formData.items);

      setIsDirty(false); // ✨ 儲存成功，清除 Dirty 狀態

      if (!silent) {
        // 分成 'create' (新建立) 與 'update' (覆蓋更新)
        const syncSuccess = await handleCloudSync(isNewQuote ? 'create' : 'update');
        triggerToast(
          syncSuccess ? '儲存成功，並已同步至雲端' : '儲存成功，但雲端同步失敗',
          syncSuccess ? 'success' : 'error'
        );
      }
    } catch (e) {
      console.error("儲存失敗:", e);
      alert(`儲存失敗: ${e.message}`);
    }
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
    const syncSuccess = await handleCloudSync('version');
    triggerToast(
      syncSuccess ? '已建立新版本，並已同步至雲端' : '已建立新版本，但雲端同步失敗',
      syncSuccess ? 'success' : 'error'
    );
    setSaving(false);
    onBack();
  };

  const capturePrintHtml = () => {
    // 構建報價項目表格行
    const itemsRows = formData.items.map((item, idx) => `
      <tr style="page-break-inside: auto;">
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; vertical-align: top;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
          <div style="font-size: 14px; font-weight: 700; color: #111827; white-space: pre-wrap;">${item.name || ''}</div>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
          <div style="font-size: 12px; color: #4b5563; white-space: pre-wrap;">${item.spec || ''}</div>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #111827; vertical-align: top;">${item.frequency || ''}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #111827; vertical-align: top;">${item.unit || ''}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px; color: #111827; vertical-align: top;">${item.qty || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px; color: #111827; vertical-align: top;">${(item.price || 0).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px; font-weight: 500; color: #111827; vertical-align: top;">${((item.price || 0) * (item.qty || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    // 處理備註的換行
    const notesHtml = (formData.notes || '-').replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>報價單 - ${formData.quoteNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif;
      line-height: 1.5;
      color: #111827;
      background: #fff;
      font-size: 14px;
    }
    
    .page-container { 
      width: 100%; 
      max-width: 100%;
      margin: 0; 
      padding: 8mm 10mm;
    }
    
    /* 每頁重複的極簡表頭 */
    .repeat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f0fdfa;
      border-bottom: 2px solid #0d9488;
      margin-bottom: 16px;
      font-size: 11px;
    }
    .repeat-header-left { font-weight: 700; color: #134e4a; }
    .repeat-header-right { display: flex; gap: 16px; align-items: center; }
    .repeat-header-badge { 
      background: #0d9488; 
      color: white; 
      padding: 2px 8px; 
      border-radius: 4px; 
      font-weight: 700; 
    }
    
    /* 主表頭 */
    .main-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 3px solid #0d9488;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .company-section h1 { 
      font-size: 28px; 
      font-weight: 700; 
      color: #0f766e; 
      letter-spacing: 6px; 
      margin-bottom: 8px; 
    }
    .company-section h2 { 
      font-size: 16px; 
      font-weight: 600; 
      color: #374151; 
      margin-bottom: 16px; 
    }
    .company-details { font-size: 13px; color: #6b7280; line-height: 1.8; }
    
    .quote-meta { text-align: right; min-width: 280px; }
    .meta-row { 
      display: flex; 
      justify-content: space-between; 
      margin: 4px 0; 
      font-size: 13px; 
    }
    .meta-label { color: #6b7280; }
    .meta-value { color: #111827; }
    .meta-value.highlight { font-weight: 700; color: #0d9488; font-size: 15px; }
    
    .project-box {
      background: #f0fdfa;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #99f6e4;
      margin-top: 12px;
      text-align: left;
    }
    .project-label { font-size: 11px; font-weight: 700; color: #0d9488; margin-bottom: 4px; text-transform: uppercase; }
    .project-name { font-size: 14px; color: #134e4a; font-weight: 500; }
    
    /* 客戶資料區塊 */
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
      margin: 20px 0 12px;
    }
    .client-grid { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 6px 24px; 
      font-size: 13px; 
    }
    .client-row { display: flex; }
    .client-label { color: #6b7280; min-width: 75px; }
    .client-value { color: #111827; }
    .client-value.bold { font-weight: 600; }
    .client-row.full { grid-column: span 2; }
    
    /* 報價項目表格 */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    .items-table th {
      background: #f0fdfa;
      color: #0d9488;
      padding: 10px 8px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      border-bottom: 2px solid #0d9488;
      text-transform: uppercase;
    }
    .items-table th.center { text-align: center; }
    .items-table th.right { text-align: right; }
    
    /* 底部區塊 */
    .footer-section {
      display: flex;
      gap: 24px;
      margin-top: 24px;
      page-break-inside: avoid;
    }
    .footer-left { flex: 1; }
    .footer-right { width: 40%; }
    
    .notes-box { margin-bottom: 16px; }
    .notes-title { 
      font-size: 11px; 
      font-weight: 700; 
      color: #374151; 
      text-transform: uppercase; 
      margin-bottom: 6px; 
    }
    .notes-content { 
      font-size: 13px; 
      color: #4b5563; 
      line-height: 1.7;
      white-space: pre-wrap;
    }
    
    .bank-box {
      background: #f0fdfa;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #0d9488;
      margin-bottom: 16px;
    }
    
    .totals-box {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .total-row { 
      display: flex; 
      justify-content: space-between; 
      margin: 6px 0; 
      font-size: 13px;
      color: #6b7280;
    }
    .total-row.grand { 
      border-top: 1px solid #d1d5db; 
      padding-top: 12px; 
      margin-top: 12px; 
    }
    .total-row.grand .label { font-weight: 700; color: #111827; font-size: 14px; }
    .total-row.grand .value { font-weight: 700; font-size: 20px; color: #0d9488; }
    .currency-note { text-align: right; font-size: 11px; color: #9ca3af; margin-top: 8px; }
    
    /* 簽名區塊 */
    .signatures {
      display: flex;
      justify-content: space-between;
      gap: 48px;
      margin-top: 30px;
      page-break-inside: avoid;
    }
    .signature-box { flex: 1; text-align: center; position: relative; }
    .signature-line { 
      border-bottom: 1px solid #333; 
      height: 80px; 
      margin-bottom: 8px;
      position: relative;
    }
    .stamp-img {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 150px;
      height: auto;
      opacity: 0.85;
    }
    .signature-label { font-size: 12px; font-weight: 600; color: #6b7280; }
    
    /* 頁尾 */
    .page-footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
    }
    .page-footer a { color: #0d9488; text-decoration: none; font-weight: 600; }
    
    /* 固定頁首頁尾 - 每頁重複 */
    .running-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f0fdfa;
      border-bottom: 2px solid #0d9488;
      font-size: 11px;
      z-index: 1000;
    }
    .running-header-left { font-weight: 700; color: #134e4a; display: flex; align-items: center; }
    .running-header-right { display: flex; gap: 16px; align-items: center; }
    .running-header-badge { 
      background: #0d9488; 
      color: white; 
      padding: 2px 8px; 
      border-radius: 4px; 
      font-weight: 700; 
    }
    
    .running-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px 12px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
      background: #fff;
    }
    .running-footer a { color: #0d9488; text-decoration: none; font-weight: 600; }
    
    @media print {
      @page { 
        margin: 15mm 10mm; 
        size: A4 portrait; 
      }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .running-header { position: fixed; }
      .running-footer { position: fixed; }
    }
    
    /* 頁面內容區需要留出頁首頁尾空間 */
    .page-content {
      padding-top: 50px;
      padding-bottom: 18mm;
    }
  </style>
</head>
<body>
  <!-- 固定頁首 - 每頁重複 -->
  <div class="running-header">
    <div class="running-header-left">
      <img src="${logoPreview}" alt="Logo" style="height: 24px; vertical-align: middle; margin-right: 8px;">
      傑太環境工程顧問有限公司
    </div>
    <div class="running-header-right">
      <span>報價單號：<span style="font-weight: 700; color: #0d9488;">${formData.quoteNumber}</span></span>
      <span style="color: #4b5563;">${formData.date}</span>
      <span class="running-header-badge">NT$ ${grandTotal.toLocaleString()}</span>
    </div>
  </div>
  
  <!-- 固定頁尾 - 每頁重複 -->
  <div class="running-footer">
    <a href="https://www.jetenv.com.tw/">https://www.jetenv.com.tw/</a>
    <span>傑太環境工程顧問有限公司</span>
    <span>${formData.quoteNumber}</span>
  </div>

  <div class="page-container page-content">

    <!-- 主表頭 -->
    <div class="main-header">
      <div class="company-section" style="display: flex; gap: 24px; align-items: flex-start;">
        <img src="${logoPreview}" alt="Company Logo" style="height: 96px; width: auto; object-fit: contain;">
        <div>
          <h1>報 價 單</h1>
          <h2>傑太環境工程顧問有限公司</h2>
        <div class="company-details">
          <div>統一編號：60779653</div>
          <div>地　　址：新北市土城區金城路二段245巷40號1F</div>
          <div>電　　話：${formData.companyPhone || '02-6609-5888 #103'}</div>
          <div>聯 絡 人：${formData.companyContact || '張惟荏'}</div>
        </div>
        </div>
      </div>
      <div class="quote-meta">
        <div class="meta-row">
          <span class="meta-label">報價單號：</span>
          <span class="meta-value highlight">${formData.quoteNumber}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">報價日期：</span>
          <span class="meta-value">${formData.date}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">有效期限：</span>
          <span class="meta-value">${formData.validUntil}</span>
        </div>
        <div class="project-box">
          <div class="project-label">專案名稱 Project Name</div>
          <div class="project-name">${formData.projectName || '-'}</div>
        </div>
      </div>
    </div>

    <!-- 客戶資料 -->
    <div class="section-title">客戶資料 Customer</div>
    <div class="client-grid">
      <div class="client-row"><span class="client-label">客戶名稱：</span><span class="client-value bold">${formData.clientName || '-'}</span></div>
      <div class="client-row"><span class="client-label">統一編號：</span><span class="client-value">${formData.clientTaxId || '-'}</span></div>
      <div class="client-row"><span class="client-label">聯絡人：</span><span class="client-value">${formData.clientContact || '-'}</span></div>
      <div class="client-row"><span class="client-label">電話：</span><span class="client-value">${formData.clientPhone || '-'}</span></div>
      <div class="client-row full"><span class="client-label">地址：</span><span class="client-value">${formData.clientAddress || '-'}</span></div>
      <div class="client-row full"><span class="client-label">Email：</span><span class="client-value">${formData.clientEmail || '-'}</span></div>
    </div>

    <!-- 報價項目表格 -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="center" style="width: 35px;">No.</th>
          <th style="width: ${formData.columnWidths?.name || 18}%;">項目名稱</th>
          <th style="width: ${formData.columnWidths?.spec || 42}%;">規格描述 / 備註</th>
          <th class="center" style="width: ${formData.columnWidths?.frequency || 5}%;">頻率</th>
          <th class="center" style="width: ${formData.columnWidths?.unit || 5}%;">單位</th>
          <th class="right" style="width: ${formData.columnWidths?.qty || 5}%;">數量</th>
          <th class="right" style="width: ${formData.columnWidths?.price || 8}%;">單價</th>
          <th class="right" style="width: ${formData.columnWidths?.total || 10}%;">複價(NT$)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- 底部區塊：備註 + 金額 -->
    <div class="footer-section">
      <div class="footer-left">
        <div class="notes-box">
          <div class="notes-title">付款方式 Payment Method</div>
          <div class="notes-content">${formData.paymentMethod || '-'}</div>
        </div>
        <div class="notes-box">
          <div class="notes-title">付款期限 Payment Terms</div>
          <div class="notes-content">${formData.paymentTerms || '-'}</div>
        </div>
        <div class="notes-box">
          <div class="notes-title">備註 Notes</div>
          <div class="notes-content">${notesHtml}</div>
        </div>
      </div>
      <div class="footer-right">
        <div class="bank-box">
          <div class="notes-title">銀行帳號 Bank Account</div>
          <div class="notes-content">
            <div>戶名：傑太環境工程顧問有限公司</div>
            <div>銀行：合作金庫 (006) 北土城分行</div>
            <div>帳號：5377 717 318387</div>
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
            <span class="label">總計 (Total)</span>
            <span class="value">NT$ ${grandTotal.toLocaleString()}</span>
          </div>
          <div class="currency-note">幣別：新台幣 (TWD)</div>
        </div>
      </div>
    </div>

    <!-- 簽名區塊 -->
    <div class="signatures">
      <div class="signature-box">
        <div class="signature-line">
          <img class="stamp-img" src="${stampPreview}" alt="Company Stamp">
        </div>
        <div class="signature-label">傑太環境工程顧問有限公司 (簽章)</div>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">客戶確認簽回 (簽章)</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  };

  const generateQuoteHtml = () => {
    const itemsHtml = formData.items.map((item, idx) => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">${idx + 1}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">${item.name || ''}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${(item.spec || '').replace(/\n/g, '<br/>')}</td>
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
    .quote-info { text-align: right; min-width: 320px; }
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
    
    /* Summary - 使用 Table Layout 確保 PDF 渲染正常 */
    .summary { 
      display: table; 
      width: 100%; 
      border-spacing: 0;
      margin-top: 32px; 
    }
    .notes-section { 
      display: table-cell;
      width: 60%;
      vertical-align: top;
      padding-right: 24px;
    }
    .summary-right { 
      display: table-cell;
      width: 40%; 
      vertical-align: top;
    }
    .bank-box {
      background: #f0fdfa;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #0d9488;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 16px;
    }
    .totals-box { 
      width: 100%;
      box-sizing: border-box; 
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
    .signature-box { flex: 1; text-align: center; position: relative; }
    .signature-line { 
      border-bottom: 1px solid #333; 
      height: 80px; 
      margin-bottom: 8px;
      position: relative;
    }
    .stamp-img {
      position: absolute;
      bottom: 25px;
      left: 50%;
      transform: translateX(-50%);
      width: 140px;
      height: auto;
      opacity: 0.9;
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
</head>
<body>
  <!-- Wrapping Table for Repeating Headers -->
  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr>
        <td>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #f0fdfa; border-bottom: 2px solid #0d9488; margin-bottom: 16px; font-size: 11px;">
             <div style="font-weight: bold; color: #134e4a;">傑太環境工程顧問有限公司</div>
             <div style="display: flex; gap: 16px; align-items: center;">
               <span>報價單號：<span style="font-weight: bold; color: #0d9488;">${formData.quoteNumber}</span></span>
               <span style="color: #4b5563;">${formData.date}</span>
               <span style="background: #0d9488; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;">NT$ ${grandTotal.toLocaleString()}</span>
             </div>
          </div>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
  <div class="container" style="border: none; max-width: none; padding: 0;">
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
            <div class="notes-content">${(formData.notes || '-').replace(/\n/g, '<br/>')}</div>
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
        <div class="summary-right">
          <div class="bank-box">
            <div class="notes-title">銀行帳號 Bank Account</div>
            <div class="notes-content">
              <div>戶名：傑太環境工程顧問有限公司</div>
              <div>銀行：合作金庫 (006) 北土城分行</div>
              <div>帳號：5377 717 318387</div>
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
      </div>

    <div class="signatures">
      <div class="signature-box">
        <div class="signature-line">
          <img class="stamp-img" src="${STAMP_BASE64}" alt="Company Stamp" />
        </div>
        <div class="signature-label">傑太環境工程顧問有限公司 (簽章)</div>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">客戶確認簽回 (簽章)</div>
      </div>
    </div>

    <div class="footer">
      <a href="https://www.jetenv.com.tw/">https://www.jetenv.com.tw/</a> | 傑太環境工程顧問有限公司 | ${formData.quoteNumber}      </div>
    </div>
  </div>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  };

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
    setSendingMessage('儲存報價單...');

    try {
      // Step 1: 儲存報價單
      await save(true);

      // Step 2: 生成 PDF HTML (使用新的 capturePrintHtml)
      setSendingMessage('產生 PDF 報價單...');
      const quoteHtml = capturePrintHtml();

      // Step 3: 準備 Email 內容
      setSendingMessage('準備寄送...');
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

      // Step 4: 呼叫 n8n webhook
      setSendingMessage('寄送中...');
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

      // Step 5: 更新狀態為「已發送」
      setSendingMessage('更新狀態...');
      const newStatus = 'sent';
      setFormData(prev => ({ ...prev, status: newStatus }));
      await save(true, { status: newStatus });

      alert(`✅ 報價單已成功寄送至 ${formData.clientEmail}`);

    } catch (error) {
      console.error('寄送失敗:', error);
      alert(`❌ 寄送失敗: ${error.message}\n請稍後再試或聯繫系統管理員`);
    } finally {
      setSending(false);
      setSendingMessage('');
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <SendingOverlay isVisible={sending} message={sendingMessage} />
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
              <button onClick={() => save()} disabled={saving || (!quoteId ? false : !isDirty)} className={`btn-primary text-xs sm:text-sm ${(!quoteId ? false : !isDirty) ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
            {/* THEAD: 極簡header - 只在打印時每頁重複 */}
            <thead className="hidden print:table-header-group">
              <tr>
                <td>
                  <div className="flex items-center justify-between py-1 px-3 bg-teal-50 border-b-2 border-teal-600 mb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <img src={logoPreview} alt="Logo" className="h-6 w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
                      <span className="font-bold text-teal-900">傑太環境工程顧問有限公司</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-600">報價單號：<span className="font-bold text-teal-700">{formData.quoteNumber}</span></span>
                      <span className="text-gray-600">{formData.date}</span>
                      <span className="bg-teal-600 text-white px-2 py-0.5 rounded font-bold">NT$ {grandTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {/* 完整header - 螢幕顯示+打印第一頁 */}
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
              <tr>
                <td>
                  {/* Client Info */}
                  <section className="mb-2">
                    <div className="flex justify-between items-end mb-2 border-b border-gray-200 pb-1">
                      <h3 className="font-bold text-gray-700">客戶資料 Customer</h3>
                      {!isPrintMode && (
                        <SearchableClientSelect
                          customers={customers}
                          onSelect={(c) => {
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
                          }}
                          placeholder="搜尋客戶名稱或統編..."
                        />
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
                    <table className="w-full divide-y divide-gray-300 border-t border-b border-gray-300" style={{ tableLayout: 'fixed' }}>
                      <thead className="bg-teal-50">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-bold text-teal-800" style={{ width: '30px' }}>No.</th>
                          {/* 項目名稱 */}
                          <th className="px-2 py-2 text-left text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.name || 18}%` }}>
                            項目名稱
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.name || 18;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, name: Math.max(8, Math.min(35, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
                          {/* 規格描述 */}
                          <th className="px-2 py-2 text-left text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.spec || 35}%` }}>
                            規格描述 / 備註
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.spec || 35;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, spec: Math.max(15, Math.min(55, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
                          {/* 頻率 */}
                          <th className="px-2 py-2 text-center text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.frequency || 6}%` }}>
                            頻率
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.frequency || 6;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, frequency: Math.max(4, Math.min(12, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
                          {/* 單位 */}
                          <th className="px-2 py-2 text-center text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.unit || 5}%` }}>
                            單位
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.unit || 5;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, unit: Math.max(3, Math.min(10, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
                          {/* 數量 */}
                          <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.qty || 6}%` }}>
                            數量
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.qty || 6;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, qty: Math.max(4, Math.min(12, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
                          {/* 單價 */}
                          <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.price || 8}%` }}>
                            單價
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.price || 8;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, price: Math.max(5, Math.min(15, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
                          {/* 複價 */}
                          <th className="px-2 py-2 text-right text-xs font-bold text-teal-800 relative" style={{ width: `${formData.columnWidths?.total || 10}%` }}>
                            複價(NT$)
                            {!isPrintMode && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-teal-200 hover:bg-teal-400 transition-colors"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startWidth = formData.columnWidths?.total || 10;
                                  const tableWidth = e.target.closest('table').offsetWidth;
                                  const onMouseMove = (moveE) => {
                                    const diff = ((moveE.clientX - startX) / tableWidth) * 100;
                                    setFormData(prev => ({ ...prev, columnWidths: { ...prev.columnWidths, total: Math.max(6, Math.min(18, Math.round(startWidth + diff))) } }));
                                  };
                                  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
                                  document.addEventListener('mousemove', onMouseMove);
                                  document.addEventListener('mouseup', onMouseUp);
                                }}
                              />
                            )}
                          </th>
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
                                  style={{ resize: 'vertical', minHeight: '60px' }}
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
                                  style={{ resize: 'vertical', minHeight: '60px' }}
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
                    <div className={`flex ${isPrintMode ? 'flex-row gap-6' : 'flex-col md:flex-row gap-8'} break-inside-avoid`}>
                      <div className="flex-1 space-y-4">
                        <SmartSelect label="付款方式 Payment Method" options={PAYMENT_METHODS} value={formData.paymentMethod} onChange={(val) => setFormData({ ...formData, paymentMethod: val })} isPrintMode={isPrintMode} />
                        <SmartSelect label="付款期限 Payment Terms" options={PAYMENT_TERMS} value={formData.paymentTerms} onChange={(val) => setFormData({ ...formData, paymentTerms: val })} isPrintMode={isPrintMode} />
                        <NoteSelector value={formData.notes} onChange={(val) => setFormData({ ...formData, notes: val })} isPrintMode={isPrintMode} />

                        {/* 銀行帳號 - 編輯模式 */}
                        {!isPrintMode && (
                          <div className="bg-teal-50 p-4 rounded-lg border-l-4 border-teal-500 mt-4">
                            <div className="text-xs font-bold text-teal-700 uppercase tracking-wider mb-2">銀行帳號 Bank Account</div>
                            <div className="space-y-1 text-sm text-gray-700">
                              <div><span className="text-gray-500">戶名：</span>傑太環境工程顧問有限公司</div>
                              <div><span className="text-gray-500">銀行：</span>合作金庫 (006) 北土城分行</div>
                              <div><span className="text-gray-500">帳號：</span><span className="font-mono font-semibold tracking-wider">5377 717 318387</span></div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 右側：列印模式時包含銀行帳號+總計，編輯模式只有總計 */}
                      <div className={`${isPrintMode ? 'flex-1 space-y-4' : 'w-full md:w-80'}`}>
                        {/* 銀行帳號 - 列印模式顯示在右側 */}
                        {isPrintMode && (
                          <div className="bg-teal-50 p-4 rounded-lg border-l-4 border-teal-500">
                            <div className="text-xs font-bold text-teal-700 uppercase tracking-wider mb-2">銀行帳號 Bank Account</div>
                            <div className="space-y-1 text-sm text-gray-700">
                              <div><span className="text-gray-500">戶名：</span>傑太環境工程顧問有限公司</div>
                              <div><span className="text-gray-500">銀行：</span>合作金庫 (006) 北土城分行</div>
                              <div><span className="text-gray-500">帳號：</span><span className="font-mono font-semibold tracking-wider">5377 717 318387</span></div>
                            </div>
                          </div>
                        )}

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
                        <div className="border-b border-gray-800 h-20 mb-2"></div>
                        <p className="text-sm font-bold text-gray-600">傑太環境工程顧問有限公司 (簽章)</p>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="border-b border-gray-800 h-20 mb-2"></div>
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
            margin: 10mm 10mm 10mm 10mm;
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

    </>
  );
};

export default QuoteEditor;
