import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { FileText, Users, Package, StickyNote } from 'lucide-react';

import { auth } from './firebase';
import Spinner from './components/Spinner';
import Toast from './components/Toast';
import Dashboard from './components/Dashboard';
import QuoteEditor from './components/QuoteEditor';
import CustomerManager from './components/CustomerManager';
import ProductManager from './components/ProductManager';
import NoteManager from './components/NoteManager';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [printMode, setPrintMode] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const triggerToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
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
                  { id: 'notes', label: '備註管理', icon: StickyNote },
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
            triggerToast={triggerToast}
            onEdit={(id) => { setActiveQuoteId(id); setView('editor'); }}
            onCreate={() => { setActiveQuoteId(null); setView('editor'); }}
            onDuplicate={(id) => { setActiveQuoteId(id); setView('editor'); }}
          />
        )}
        {view === 'customers' && <CustomerManager />}
        {view === 'products' && <ProductManager />}
        {view === 'notes' && <NoteManager />}
        {view === 'editor' && (
          <QuoteEditor
            user={user}
            quoteId={activeQuoteId}
            setActiveQuoteId={setActiveQuoteId}
            triggerToast={triggerToast}
            onBack={() => setView('dashboard')}
            onPrintToggle={setPrintMode}
            isPrintMode={printMode}
          />
        )}
      </main>

      <Toast
        isVisible={showToast}
        message={toastMessage}
        type={toastType}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}