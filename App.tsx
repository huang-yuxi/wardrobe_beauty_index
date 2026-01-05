
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CatalogItem, ItemType, RefillStatus, BatchItem, Season } from './types';
import { ItemCard } from './components/ItemCard';
import { EditModal } from './components/EditModal';
import { BatchImportModal } from './components/BatchImportModal';
import { getSmartAdvice, parseReceipt } from './services/geminiService';
import { initGoogleDrive, signIn, signOut, saveToDrive, loadFromDrive, isSyncAvailable } from './services/googleDriveService';

const COLORS = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Pink', hex: '#FFC0CB' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Green', hex: '#008000' },
  { name: 'Blue', hex: '#0000FF' },
];

const App: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [activeTab, setActiveTab] = useState<ItemType>('clothing');
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Advanced Filter States
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);

  const [advice, setAdvice] = useState<string | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isAiConnected, setIsAiConnected] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const [isDriveConnected, setIsDriveConnected] = useState(!!localStorage.getItem('aura-drive-session'));
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
    const checkAi = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const connected = await (window as any).aistudio.hasSelectedApiKey();
        setIsAiConnected(connected);
      }
    };
    checkAi();
  }, []);

  useEffect(() => {
    if (googleClientId && googleClientId.length > 10) {
      localStorage.setItem('aura-archive-client-id', googleClientId);
      initGoogleDrive(googleClientId).catch(err => console.error(err));
    }
  }, [googleClientId]);

  useEffect(() => {
    localStorage.setItem('aura-archive-items', JSON.stringify(items));
    if (lastSynced) localStorage.setItem('aura-archive-last-sync', lastSynced.toString());
  }, [items, lastSynced]);

  // Derived Categories for Filters
  const uniqueCategories = useMemo(() => {
    const cats = items.filter(i => i.type === activeTab).map(i => i.category);
    return Array.from(new Set(cats)).filter(Boolean);
  }, [items, activeTab]);

  const filteredItems = useMemo(() => {
    return items
      .filter(item => item.type === activeTab)
      .filter(item => isShoppingMode ? (item.status === 'low' || item.status === 'out') : true)
      .filter(item => selectedColor ? item.color === selectedColor : true)
      .filter(item => selectedCategory ? item.category === selectedCategory : true)
      .filter(item => {
        if (!selectedSeason) return true;
        // Handle both old string format and new array format for backward compatibility
        const itemSeasons = Array.isArray(item.season) ? item.season : [item.season];
        return itemSeasons.includes(selectedSeason) || itemSeasons.includes('All-Season');
      })
      .filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [items, activeTab, searchQuery, isShoppingMode, selectedColor, selectedCategory, selectedSeason]);

  const refillCount = useMemo(() => items.filter(i => i.type === 'beauty' && (i.status === 'low' || i.status === 'out')).length, [items]);

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

  const resetFilters = () => {
    setSelectedColor(null);
    setSelectedCategory(null);
    setSelectedSeason(null);
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

  const manualExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "aura_archive_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const manualImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setItems(imported);
          alert("Backup restored successfully!");
        }
      } catch (err) {
        alert("Failed to parse backup file.");
      }
    };
    reader.readAsText(file);
  };

  const activateAi = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setIsAiConnected(true);
    }
  };

  const handleLogin = async () => {
    try {
      await signIn();
      setIsDriveConnected(true);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleDrivePush = async () => {
    setIsSyncing(true);
    try {
      const timestamp = await saveToDrive(items);
      setLastSynced(timestamp);
      alert("Pushed to cloud successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to push to cloud.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDrivePull = async () => {
    setIsSyncing(true);
    try {
      const cloudData = await loadFromDrive();
      if (cloudData) {
        setItems(cloudData);
        alert("Fetched from cloud successfully.");
      } else {
        alert("No backup found in cloud.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to fetch from cloud.");
    } finally {
      setIsSyncing(false);
    }
  };

  const onReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Clean = (event.target?.result as string).split(',')[1];
        const results = await parseReceipt(base64Clean, true);
        setBatchItems(results);
        setShowBatchModal(true);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Receipt parsing failed:", err);
    } finally {
      setIsImporting(false);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
    }
  };

  const handleTextImport = async () => {
    if (!pasteContent.trim()) return;
    setIsImporting(true);
    try {
      const results = await parseReceipt(pasteContent, false);
      setBatchItems(results);
      setShowBatchModal(true);
      setShowPasteModal(false);
      setPasteContent('');
    } catch (err) {
      console.error("Text parsing failed:", err);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen pb-40">
      {(isSyncing || isImporting) && (
        <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-md flex items-center justify-center">
          <div className="bg-gray-900 text-white px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]">{isImporting ? 'Analyzing' : 'Syncing'}</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-serif text-gray-900">AuraArchive</h1>
            <button onClick={() => setShowSettings(!showSettings)} className={`p-3 rounded-2xl transition-all ${showSettings ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2.5"/></svg>
            </button>
          </div>

          <div className="flex gap-2 mb-6">
            <div className="flex bg-gray-100 p-1 rounded-2xl flex-1">
              <button onClick={() => { setActiveTab('clothing'); setIsShoppingMode(false); resetFilters(); }} className={`flex-1 py-3 text-[11px] font-bold rounded-xl transition-all ${activeTab === 'clothing' && !isShoppingMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>CLOSET</button>
              <button onClick={() => { setActiveTab('beauty'); setIsShoppingMode(false); resetFilters(); }} className={`flex-1 py-3 text-[11px] font-bold rounded-xl transition-all ${activeTab === 'beauty' && !isShoppingMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>BEAUTY</button>
            </div>
            <button 
              onClick={() => { setIsShoppingMode(!isShoppingMode); if (!isShoppingMode) { setActiveTab('beauty'); resetFilters(); } }}
              className={`px-6 py-3 text-[11px] font-bold rounded-xl transition-all ${isShoppingMode ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              REFILLS {refillCount > 0 && <span className="ml-1 opacity-70">({refillCount})</span>}
            </button>
          </div>

          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="3"/></svg></span>
            <input type="text" placeholder={`Search your items...`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm outline-none focus:ring-2 ring-gray-100" />
          </div>

          {/* Visual Filter Bar */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button 
                onClick={() => setSelectedCategory(null)} 
                className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${!selectedCategory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                All Type
              </button>
              {uniqueCategories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${selectedCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pr-4 border-r border-gray-100">
                <button onClick={() => setSelectedColor(null)} className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${!selectedColor ? 'border-gray-900 scale-110' : 'border-transparent'}`}>
                  <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-gray-200 to-gray-500"></div>
                </button>
                {COLORS.map(c => (
                  <button 
                    key={c.name}
                    onClick={() => setSelectedColor(selectedColor === c.name ? null : c.name)}
                    className={`w-6 h-6 rounded-full border transition-all ${selectedColor === c.name ? 'border-gray-900 scale-125 shadow-sm' : 'border-transparent'}`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>

              {activeTab === 'clothing' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                   {(['Spring', 'Summer', 'Autumn', 'Winter'] as Season[]).map(s => (
                     <button 
                        key={s}
                        onClick={() => setSelectedSeason(selectedSeason === s ? null : s)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${selectedSeason === s ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-400'}`}
                     >
                       {s.substring(0,3)}
                     </button>
                   ))}
                </div>
              )}
            </div>
          </div>

          {showSettings && (
            <div className="mt-6 p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-6 animate-in slide-in-from-top-4 duration-200">
               <div className="bg-white p-6 rounded-3xl border border-gray-100">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Local Management</h4>
                  <div className="flex gap-2">
                    <button onClick={manualExport} className="flex-1 py-3 bg-gray-100 text-gray-700 text-[10px] font-bold uppercase rounded-xl">Save Backup</button>
                    <button onClick={() => backupInputRef.current?.click()} className="flex-1 py-3 bg-gray-100 text-gray-700 text-[10px] font-bold uppercase rounded-xl">Restore</button>
                  </div>
               </div>

               <div className="bg-white p-6 rounded-3xl border border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Experimental Features</h4>
                    <span className={`w-2 h-2 rounded-full ${isAiConnected ? 'bg-green-500' : 'bg-gray-200'}`}></span>
                  </div>
                  <div className="space-y-2">
                    <button onClick={activateAi} className={`w-full py-4 text-[10px] font-bold uppercase rounded-xl transition-all ${isAiConnected ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                      {isAiConnected ? 'Gemini API Active' : 'Enable AI Magic (Requires Key)'}
                    </button>
                    <button onClick={() => setShowAdvanced(!showAdvanced)} className={`w-full py-4 text-[10px] font-bold uppercase rounded-xl transition-all ${showAdvanced ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {showAdvanced ? 'Hide Sync Settings' : 'Cloud Sync (Google Drive)'}
                    </button>
                  </div>
               </div>

               {showAdvanced && (
                 <div className="p-6 bg-white rounded-3xl border border-indigo-100 space-y-4 animate-in fade-in zoom-in duration-200">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-2">Google OAuth Client ID</label>
                      <input 
                        type="password" 
                        value={googleClientId} 
                        onChange={e => setGoogleClientId(e.target.value)} 
                        placeholder="000-xxx.apps.googleusercontent.com" 
                        className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-mono" 
                      />
                    </div>
                    {!isDriveConnected ? (
                      <button 
                        onClick={handleLogin} 
                        disabled={!googleClientId}
                        className="w-full py-4 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-xl shadow-lg disabled:opacity-30"
                      >
                        Sign in with Google
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                          <p className="text-[10px] font-bold text-green-600">Cloud Link Active</p>
                          <button onClick={() => { signOut(); setIsDriveConnected(false); }} className="text-[9px] font-bold text-gray-400 uppercase">Sign Out</button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleDrivePush} className="flex-1 py-3 bg-gray-900 text-white text-[9px] font-bold uppercase rounded-xl">Push to Cloud</button>
                          <button onClick={handleDrivePull} className="flex-1 py-3 bg-gray-100 text-gray-900 text-[9px] font-bold uppercase rounded-xl">Fetch from Cloud</button>
                        </div>
                      </div>
                    )}
                 </div>
               )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {filteredItems.map(item => <ItemCard key={item.id} item={item} onClick={handleItemClick} />)}
          </div>
        ) : (
          <div className="text-center py-32 bg-white rounded-[3rem] border border-gray-100">
            <p className="text-gray-400 text-sm mb-4 font-medium">No matches found.</p>
            {(selectedColor || selectedCategory || selectedSeason) && (
              <button onClick={resetFilters} className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest border-b border-indigo-200 pb-1">Clear all filters</button>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-10 inset-x-0 flex justify-center z-40 pointer-events-none gap-3">
        <div className="flex bg-white/95 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-gray-100 pointer-events-auto items-center">
          {isAiConnected && (
            <>
              <button onClick={() => receiptInputRef.current?.click()} className="p-4 hover:bg-indigo-50 rounded-full text-indigo-600 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="2"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2"/></svg>
              </button>
              <button onClick={() => setShowPasteModal(true)} className="p-4 hover:bg-indigo-50 rounded-full text-indigo-600 transition-all">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2"/></svg>
              </button>
              <div className="w-[1px] h-6 bg-gray-100 mx-1" />
            </>
          )}
          <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-10 py-4 rounded-full flex items-center gap-3 active:scale-95 transition-all">
            <span className="font-bold tracking-[0.2em] text-[10px] uppercase">New Entry</span>
          </button>
        </div>
      </div>

      <input type="file" ref={receiptInputRef} onChange={onReceiptUpload} accept="image/*" className="hidden" />
      <input type="file" ref={backupInputRef} onChange={manualImport} accept=".json" className="hidden" />
      
      {showModal && <EditModal item={selectedItem} type={activeTab} isAiEnabled={isAiConnected} onClose={closeModals} onSave={handleSave} onDelete={handleDelete} />}
      {showBatchModal && <BatchImportModal items={batchItems} onClose={() => setShowBatchModal(false)} onConfirm={(items) => {
        const newItems = items.map(i => ({...i, id: crypto.randomUUID(), status: 'in-stock', lastUpdated: Date.now()} as CatalogItem));
        setItems(prev => [...newItems, ...prev]);
        setShowBatchModal(false);
      }} />}

      {showPasteModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
              <h3 className="text-xl font-serif text-gray-900 mb-6">Analyze Email Text</h3>
              <textarea className="w-full h-64 p-4 bg-gray-50 border rounded-3xl text-sm outline-none resize-none font-mono" placeholder="Paste order confirmation..." value={pasteContent} onChange={e => setPasteContent(e.target.value)} />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowPasteModal(false)} className="px-6 py-4 text-gray-400 font-bold text-[10px] uppercase">Cancel</button>
                <button onClick={handleTextImport} className="flex-1 py-4 bg-gray-900 text-white text-[10px] font-bold uppercase rounded-2xl">Extract Items</button>
              </div>
           </div>
        </div>
      )}

      {selectedItem && showModal && advice && (
        <div className="fixed bottom-28 right-6 z-[60] w-72 max-w-[85vw]">
          <div className="bg-gray-900 text-white p-6 rounded-3xl shadow-2xl border border-white/10 animate-in zoom-in duration-300">
            <span className="block text-[9px] font-bold text-indigo-300 uppercase mb-2 tracking-widest">Aura Advice</span>
            <div className="text-[11px] leading-relaxed italic">{advice}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
