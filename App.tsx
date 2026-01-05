
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CatalogItem, ItemType, RefillStatus, BatchItem } from './types';
import { ItemCard } from './components/ItemCard';
import { EditModal } from './components/EditModal';
import { BatchImportModal } from './components/BatchImportModal';
import { getSmartAdvice, parseReceipt } from './services/geminiService';
import { initGoogleDrive, getToken, saveToDrive, loadFromDrive } from './services/googleDriveService';

const App: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [activeTab, setActiveTab] = useState<ItemType>('clothing');
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RefillStatus | 'all'>('all');
  const [advice, setAdvice] = useState<string | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Google Drive State
  const [isDriveInited, setIsDriveInited] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
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
  }, []);

  useEffect(() => {
    localStorage.setItem('aura-archive-items', JSON.stringify(items));
    if (lastSynced) localStorage.setItem('aura-archive-last-sync', lastSynced.toString());
  }, [items, lastSynced]);

  useEffect(() => {
    if (googleClientId) {
      localStorage.setItem('aura-archive-client-id', googleClientId);
      initGoogleDrive(googleClientId).then(() => setIsDriveInited(true));
    }
  }, [googleClientId]);

  const handleSmartImport = async () => {
    if (!(window as any).aistudio?.hasSelectedApiKey()) {
      alert("Receipt scanning requires an enhanced API connection. Please select your key.");
      await (window as any).aistudio?.openSelectKey();
    }
    receiptInputRef.current?.click();
  };

  const onReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
          alert("No items found on this receipt.");
        }
      } catch (err) {
        console.error(err);
        alert("Magic scan failed. Try a clearer photo.");
      } finally {
        setIsImporting(false);
        if (receiptInputRef.current) receiptInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
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
  };

  const handleDriveConnect = async () => {
    if (!googleClientId) {
      alert("Please enter your Google Client ID in settings first.");
      return;
    }
    try {
      await getToken();
      setIsDriveConnected(true);
      handleDrivePull(true);
    } catch (err) { console.error(err); }
  };

  const handleDrivePush = async () => {
    setIsSyncing(true);
    try {
      const syncTime = await saveToDrive(items);
      setLastSynced(syncTime);
    } catch (err) {
      setIsDriveConnected(false);
    } finally { setIsSyncing(false); }
  };

  const handleDrivePull = async (isInitialConnect = false) => {
    setIsSyncing(true);
    try {
      const cloudData = await loadFromDrive();
      if (cloudData && Array.isArray(cloudData)) {
        if (window.confirm(isInitialConnect ? `Found ${cloudData.length} cloud items. Load them?` : `Sync ${cloudData.length} items?`)) {
          setItems(prev => {
            const existingIds = new Set(prev.map(i => i.id));
            const newItems = cloudData.filter(i => !existingIds.has(i.id));
            return [...prev, ...newItems];
          });
          setLastSynced(Date.now());
        }
      }
    } catch (err) { console.error(err); } finally { setIsSyncing(false); }
  };

  const filteredItems = useMemo(() => {
    return items
      .filter(item => item.type === activeTab)
      .filter(item => activeTab === 'clothing' || statusFilter === 'all' || item.status === statusFilter)
      .filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [items, activeTab, searchQuery, statusFilter]);

  const handleSave = (itemData: Partial<CatalogItem>) => {
    if (selectedItem) {
      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...itemData, lastUpdated: Date.now() } as CatalogItem : i));
    } else {
      setItems(prev => [{ ...itemData, id: crypto.randomUUID(), lastUpdated: Date.now() } as CatalogItem, ...prev]);
    }
    closeModals();
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
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
    setIsAdviceLoading(true);
    try {
      const tips = await getSmartAdvice(item);
      setAdvice(tips || null);
    } catch (err) { console.error(err); } finally { setIsAdviceLoading(false); }
  };

  return (
    <div className="min-h-screen pb-40">
      {(isSyncing || isImporting) && (
        <div className="fixed inset-0 z-[100] bg-white/40 backdrop-blur-md flex items-center justify-center cursor-wait">
          <div className="bg-gray-900 text-white px-8 py-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-300">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            <div className="text-center">
              <span className="block text-xs font-bold uppercase tracking-[0.3em]">{isImporting ? 'Scanning Archive' : 'Syncing Archive'}</span>
              <span className="block text-[10px] text-white/40 mt-1 uppercase font-bold">Please wait a moment...</span>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div>
                <h1 className="text-3xl font-serif text-gray-900 tracking-tight">AuraArchive</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isDriveConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    {isDriveConnected ? `Cloud Live` : 'Local Archive'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowSettings(!showSettings)} className="p-2 sm:hidden text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2" /></svg>
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-100/80 p-1 rounded-2xl flex-1 sm:flex-none">
                <button onClick={() => setActiveTab('clothing')} className={`flex-1 sm:flex-none px-6 py-2.5 text-[11px] font-bold rounded-xl ${activeTab === 'clothing' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400'}`}>CLOSET</button>
                <button onClick={() => setActiveTab('beauty')} className={`flex-1 sm:flex-none px-6 py-2.5 text-[11px] font-bold rounded-xl ${activeTab === 'beauty' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400'}`}>BEAUTY</button>
              </div>
              <button onClick={() => setShowSettings(!showSettings)} className="hidden sm:flex p-3 bg-gray-50 text-gray-400 rounded-xl border border-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2"/></svg>
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="mb-6 p-6 bg-gray-50 rounded-3xl border border-gray-100 space-y-6 animate-in slide-in-from-top duration-300">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1">Archive Settings</h3>
                  <p className="text-[10px] text-gray-500">Manage cloud connectivity and AI preferences.</p>
                </div>
              </div>
              <div className="space-y-4">
                <input type="password" value={googleClientId} onChange={e => setGoogleClientId(e.target.value)} placeholder="Google Client ID..." className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-mono" />
                {!isDriveConnected ? (
                  <button onClick={handleDriveConnect} className="w-full py-4 bg-indigo-600 text-white text-[11px] font-bold rounded-xl shadow-lg">Connect Google Drive</button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleDrivePush} className="py-3 bg-gray-900 text-white text-[10px] font-bold rounded-xl">Backup to Cloud</button>
                    <button onClick={() => handleDrivePull(false)} className="py-3 bg-white border border-gray-200 text-gray-900 text-[10px] font-bold rounded-xl">Fetch Updates</button>
                  </div>
                )}
                <button onClick={async () => await (window as any).aistudio?.openSelectKey()} className="w-full py-3 bg-white border border-gray-200 text-indigo-600 text-[10px] font-bold rounded-xl uppercase tracking-widest">Update Intelligence Key</button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2.5"/></svg></span>
              <input type="text" placeholder={`Search your ${activeTab} collection...`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-2xl text-sm focus:bg-white outline-none" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filteredItems.map(item => <ItemCard key={item.id} item={item} onClick={handleItemClick} />)}
          </div>
        ) : (
          <div className="text-center py-24 bg-white/50 border-2 border-dashed border-gray-200 rounded-[3rem]">
            <h3 className="text-lg font-serif text-gray-800 mb-2">Collection is Empty</h3>
            <p className="text-gray-400 text-sm mb-8 italic">Ready to curate your first entries?</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
               <button onClick={() => setShowModal(true)} className="px-8 py-4 bg-gray-900 text-white text-[11px] font-bold uppercase rounded-full">Manual Entry</button>
               <button onClick={handleSmartImport} className="px-8 py-4 bg-indigo-600 text-white text-[11px] font-bold uppercase rounded-full">Archive Receipt</button>
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-8 inset-x-0 flex justify-center z-40 pointer-events-none gap-4">
        <button onClick={handleSmartImport} className="pointer-events-auto bg-white text-gray-900 px-6 py-5 rounded-full shadow-2xl flex items-center gap-3 active:scale-95 transition-all border border-gray-100 hover:bg-gray-50">
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="3"/></svg>
          <span className="font-bold tracking-[0.2em] text-[10px] uppercase">Smart Import</span>
        </button>
        <button onClick={() => setShowModal(true)} className="pointer-events-auto bg-gray-900 text-white px-8 py-5 rounded-full shadow-2xl flex items-center gap-4 active:scale-95 transition-all group">
          <span className="font-bold tracking-[0.2em] text-[10px] uppercase">New {activeTab === 'clothing' ? 'Garment' : 'Product'}</span>
        </button>
      </div>

      <input type="file" ref={receiptInputRef} onChange={onReceiptUpload} accept="image/*" className="hidden" />

      {showModal && (
        <EditModal item={selectedItem} type={activeTab} onClose={closeModals} onSave={handleSave} onDelete={handleDelete} />
      )}

      {showBatchModal && (
        <BatchImportModal items={batchItems} onClose={() => setShowBatchModal(false)} onConfirm={handleBatchConfirm} />
      )}

      {selectedItem && showModal && (
        <div className="fixed bottom-28 right-6 z-[60] w-72 max-w-[85vw]">
          <div className="bg-gray-900 text-white p-6 rounded-[2rem] shadow-2xl border border-white/10">
            <span className="block text-[10px] font-bold text-indigo-300 uppercase mb-3">Archive Insight</span>
            <div className="text-[11px] leading-relaxed italic">{isAdviceLoading ? 'Retrieving wisdom...' : advice}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
