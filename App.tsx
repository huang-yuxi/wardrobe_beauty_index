
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CatalogItem, ItemType, RefillStatus, BatchItem } from './types';
import { ItemCard } from './components/ItemCard';
import { EditModal } from './components/EditModal';
import { BatchImportModal } from './components/BatchImportModal';
import { getSmartAdvice, parseReceipt } from './services/geminiService';
import { initGoogleDrive, signIn, signOut, saveToDrive, loadFromDrive, isSyncAvailable } from './services/googleDriveService';

const App: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [activeTab, setActiveTab] = useState<ItemType>('clothing');
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [advice, setAdvice] = useState<string | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isAiConnected, setIsAiConnected] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Google Drive State
  const [isDriveConnected, setIsDriveConnected] = useState(!!localStorage.getItem('aura-drive-session'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    const saved = localStorage.getItem('aura-archive-last-sync');
    return saved ? parseInt(saved) : null;
  });
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('aura-archive-client-id') || '');

  useEffect(() => {
    const saved = localStorage.getItem('aura-archive-items');
    if (saved) {
      try { setItems(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
    
    const checkAi = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const connected = await (window as any).aistudio.hasSelectedApiKey();
        setIsAiConnected(connected);
      }
    };
    checkAi();
  }, []);

  useEffect(() => {
    localStorage.setItem('aura-archive-items', JSON.stringify(items));
    if (lastSynced) localStorage.setItem('aura-archive-last-sync', lastSynced.toString());
  }, [items, lastSynced]);

  useEffect(() => {
    if (googleClientId && googleClientId.length > 10) {
      localStorage.setItem('aura-archive-client-id', googleClientId);
      initGoogleDrive(googleClientId).catch(console.error);
    }
  }, [googleClientId]);

  const handleLogin = async () => {
    if (!googleClientId) return setShowAdvanced(true);
    setSyncError(null);
    try {
      await signIn();
      setIsDriveConnected(true);
      handleDrivePull();
    } catch (err: any) {
      setSyncError("Sign-in failed. Check 'Test Users' in Google Console.");
    }
  };

  const handleLogout = () => {
    signOut();
    setIsDriveConnected(false);
  };

  const handleDrivePush = async () => {
    if (!isSyncAvailable()) return handleLogin();
    setIsSyncing(true);
    setSyncError(null);
    try {
      const syncTime = await saveToDrive(items);
      setLastSynced(syncTime);
    } catch (err) {
      setSyncError("Cloud save failed. Try reconnecting.");
    } finally { setIsSyncing(false); }
  };

  const handleDrivePull = async () => {
    if (!isSyncAvailable()) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const cloudData = await loadFromDrive();
      if (cloudData && Array.isArray(cloudData)) {
        setItems(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newItems = cloudData.filter(i => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
        setLastSynced(Date.now());
      }
    } catch (err) { 
      setSyncError("Cloud pull failed.");
    } finally { setIsSyncing(false); }
  };

  const manualExport = () => {
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-archive-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const manualImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          if (confirm(`Import ${imported.length} items?`)) {
            setItems(prev => {
              const existingIds = new Set(prev.map(i => i.id));
              const newItems = imported.filter(i => !existingIds.has(i.id));
              return [...prev, ...newItems];
            });
          }
        }
      } catch (err) { alert("Invalid backup file."); }
    };
    reader.readAsText(file);
  };

  const activateAi = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setIsAiConnected(true);
    }
  };

  const onReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAiConnected) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      try {
        const detected = await parseReceipt(base64, true);
        if (detected.length > 0) {
          setBatchItems(detected);
          setShowBatchModal(true);
        } else {
          alert("No items found on receipt.");
        }
      } catch (err: any) {
        setIsAiConnected(false);
        alert("AI session expired. Please re-link in settings.");
      } finally {
        setIsImporting(false);
        if (receiptInputRef.current) receiptInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTextImport = async () => {
    if (!pasteContent.trim() || !isAiConnected) return;
    setIsImporting(true);
    try {
      const detected = await parseReceipt(pasteContent, false);
      if (detected.length > 0) {
        setBatchItems(detected);
        setShowBatchModal(true);
        setShowPasteModal(false);
        setPasteContent('');
      } else {
        alert("No items identified.");
      }
    } catch (err) { alert("AI scan failed."); } finally { setIsImporting(false); }
  };

  const handleBatchConfirm = (finalItems: BatchItem[]) => {
    const newItems: CatalogItem[] = finalItems.map(item => ({
      id: crypto.randomUUID(),
      name: item.name,
      brand: item.brand,
      category: item.category,
      type: item.type,
      status: 'in-stock',
      notes: item.notes,
      lastUpdated: Date.now()
    }));
    setItems(prev => [...newItems, ...prev]);
    setShowBatchModal(false);
    if (isDriveConnected) handleDrivePush();
  };

  const filteredItems = useMemo(() => {
    return items
      .filter(item => item.type === activeTab)
      .filter(item => isShoppingMode ? (item.status === 'low' || item.status === 'out') : true)
      .filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [items, activeTab, searchQuery, isShoppingMode]);

  const itemsNeedingRefill = useMemo(() => {
    return items.filter(i => i.type === 'beauty' && (i.status === 'low' || i.status === 'out')).length;
  }, [items]);

  const handleSave = (itemData: Partial<CatalogItem>) => {
    if (selectedItem) {
      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...itemData, lastUpdated: Date.now() } as CatalogItem : i));
    } else {
      setItems(prev => [{ ...itemData, id: crypto.randomUUID(), lastUpdated: Date.now() } as CatalogItem, ...prev]);
    }
    if (isDriveConnected) handleDrivePush();
    closeModals();
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (isDriveConnected) handleDrivePush();
    closeModals();
  };

  const closeModals = () => {
    setShowModal(false);
    setSelectedItem(null);
    setAdvice(null);
  };

  const handleItemClick = async (item: CatalogItem) => {
    setSelectedItem(item);
    setShowModal(true);
    if (isAiConnected) {
      setIsAdviceLoading(true);
      try {
        const tips = await getSmartAdvice(item);
        setAdvice(tips || null);
      } catch (err) { console.error(err); } finally { setIsAdviceLoading(false); }
    }
  };

  return (
    <div className="min-h-screen pb-40">
      {(isSyncing || isImporting) && (
        <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-md flex items-center justify-center">
          <div className="bg-gray-900 text-white px-8 py-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">{isImporting ? 'AI Processing' : 'Syncing'}</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-serif text-gray-900 tracking-tight">AuraArchive</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                {isAiConnected ? 'Intelligence Enabled' : 'Personal Catalog'}
              </p>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className={`p-3 rounded-xl border transition-all ${showSettings ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-400'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2"/></svg>
            </button>
          </div>

          <div className="flex gap-2 mb-6">
            <div className="flex bg-gray-100 p-1 rounded-2xl flex-1">
              <button onClick={() => { setActiveTab('clothing'); setIsShoppingMode(false); }} className={`flex-1 py-2.5 text-[11px] font-bold rounded-xl transition-all ${activeTab === 'clothing' && !isShoppingMode ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400'}`}>CLOSET</button>
              <button onClick={() => { setActiveTab('beauty'); setIsShoppingMode(false); }} className={`flex-1 py-2.5 text-[11px] font-bold rounded-xl transition-all ${activeTab === 'beauty' && !isShoppingMode ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400'}`}>BEAUTY</button>
            </div>
            <button 
              onClick={() => { setIsShoppingMode(!isShoppingMode); if (!isShoppingMode) setActiveTab('beauty'); }}
              className={`px-6 py-2.5 text-[11px] font-bold rounded-xl relative transition-all ${isShoppingMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              REFILLS {itemsNeedingRefill > 0 && <span className="ml-1 text-red-400">({itemsNeedingRefill})</span>}
            </button>
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2.5"/></svg></span>
            <input type="text" placeholder={`Search ${activeTab}...`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:bg-white outline-none" />
          </div>

          {showSettings && (
            <div className="mt-6 p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-6 animate-in slide-in-from-top duration-200">
               <div className="bg-white p-6 rounded-3xl border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-1">AI Power-Up</h4>
                  <p className="text-[10px] text-gray-400 mb-4">Link Gemini for magic scanning & smart tips</p>
                  <button onClick={activateAi} className={`w-full py-4 text-[10px] font-bold uppercase rounded-xl transition-all ${isAiConnected ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'}`}>
                    {isAiConnected ? 'API Project Linked' : 'Activate Intelligence'}
                  </button>
                  {isAiConnected && (
                    <div className="mt-3 flex justify-center">
                       <button onClick={() => setIsAiConnected(false)} className="text-[9px] font-bold text-gray-300 uppercase hover:text-red-500">Unlink API</button>
                    </div>
                  )}
               </div>

               <div className="bg-white p-6 rounded-3xl border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-1">Sync & Backup</h4>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setShowAdvanced(true)} className="flex-1 py-3 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded-xl">Cloud Sync</button>
                    <button onClick={manualExport} className="flex-1 py-3 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded-xl">Export JSON</button>
                    <button onClick={() => backupInputRef.current?.click()} className="flex-1 py-3 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded-xl">Import</button>
                  </div>
               </div>

               {showAdvanced && (
                 <div className="p-6 bg-white rounded-3xl border-2 border-indigo-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase">Google Client ID</p>
                      <button onClick={() => setShowHelp(!showHelp)} className="text-[9px] text-indigo-600 font-bold underline">Setup Steps</button>
                    </div>
                    <input type="password" value={googleClientId} onChange={e => setGoogleClientId(e.target.value)} placeholder="000.apps.googleusercontent.com" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-mono" />
                    <button onClick={handleLogin} className="w-full py-4 bg-gray-900 text-white text-[10px] font-bold uppercase rounded-xl">Connect Google Drive</button>
                    {isDriveConnected && (
                      <div className="flex gap-2">
                        <button onClick={handleDrivePush} className="flex-1 py-3 bg-indigo-50 text-indigo-600 text-[9px] font-bold uppercase rounded-xl">Push to Cloud</button>
                        <button onClick={handleDrivePull} className="flex-1 py-3 bg-indigo-50 text-indigo-600 text-[9px] font-bold uppercase rounded-xl">Pull from Cloud</button>
                      </div>
                    )}
                 </div>
               )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filteredItems.map(item => <ItemCard key={item.id} item={item} onClick={handleItemClick} />)}
          </div>
        ) : (
          <div className="text-center py-24 bg-white/50 border-2 border-dashed border-gray-200 rounded-[3rem]">
            <h3 className="text-lg font-serif text-gray-800 mb-2">No items here yet</h3>
            <p className="text-gray-400 text-xs mb-8 italic">Ready to catalog your {activeTab}?</p>
            <button onClick={() => setShowModal(true)} className="px-12 py-4 bg-gray-900 text-white text-[11px] font-bold uppercase rounded-full">Add Item</button>
          </div>
        )}
      </main>

      <div className="fixed bottom-8 inset-x-0 flex justify-center z-40 pointer-events-none gap-3">
        <div className="flex bg-white/95 backdrop-blur-xl p-1.5 rounded-full shadow-2xl border border-gray-100 pointer-events-auto">
          {isAiConnected && (
            <>
              <button onClick={() => receiptInputRef.current?.click()} className="p-4 hover:bg-indigo-50 rounded-full text-indigo-600 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="2"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2"/></svg>
              </button>
              <button onClick={() => setShowPasteModal(true)} className="p-4 hover:bg-indigo-50 rounded-full text-indigo-600 transition-all">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2"/></svg>
              </button>
              <div className="w-[1px] bg-gray-100 mx-1" />
            </>
          )}
          <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-10 py-4 rounded-full flex items-center gap-3">
            <span className="font-bold tracking-[0.2em] text-[10px] uppercase">New Entry</span>
          </button>
        </div>
      </div>

      <input type="file" ref={receiptInputRef} onChange={onReceiptUpload} accept="image/*" className="hidden" />
      <input type="file" ref={backupInputRef} onChange={manualImport} accept=".json" className="hidden" />
      
      {showModal && <EditModal item={selectedItem} type={activeTab} isAiEnabled={isAiConnected} onClose={closeModals} onSave={handleSave} onDelete={handleDelete} />}
      {showBatchModal && <BatchImportModal items={batchItems} onClose={() => setShowBatchModal(false)} onConfirm={handleBatchConfirm} />}

      {showPasteModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
              <h3 className="text-xl font-serif text-gray-900 mb-6">AI Text Analysis</h3>
              <textarea className="w-full h-64 p-4 bg-gray-50 border rounded-3xl text-sm outline-none resize-none font-mono" placeholder="Paste order email..." value={pasteContent} onChange={e => setPasteContent(e.target.value)} />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowPasteModal(false)} className="px-6 py-4 text-gray-400 font-bold text-[10px] uppercase">Cancel</button>
                <button onClick={handleTextImport} className="flex-1 py-4 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-2xl shadow-xl shadow-indigo-100">Process with AI</button>
              </div>
           </div>
        </div>
      )}

      {selectedItem && showModal && advice && (
        <div className="fixed bottom-28 right-6 z-[60] w-72 max-w-[85vw]">
          <div className="bg-gray-900 text-white p-6 rounded-[2rem] shadow-2xl border border-white/10 animate-in slide-in-from-right duration-300">
            <span className="block text-[10px] font-bold text-indigo-300 uppercase mb-3 tracking-widest">Aura Insight</span>
            <div className="text-[11px] leading-relaxed italic">{advice}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
