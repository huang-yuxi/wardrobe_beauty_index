
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
    
    // Check AI connection status on load
    const checkAi = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        setIsAiConnected(await (window as any).aistudio.hasSelectedApiKey());
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
          if (confirm(`Import ${imported.length} items? This will merge with your current list.`)) {
            setItems(prev => {
              const existingIds = new Set(prev.map(i => i.id));
              const newItems = imported.filter(i => !existingIds.has(i.id));
              return [...prev, ...newItems];
            });
          }
        }
      } catch (err) {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
  };

  const copyConfig = () => {
    if (!googleClientId) return alert("Enter a Client ID first.");
    navigator.clipboard.writeText(googleClientId);
    alert("Configuration copied! Text this code to your wife.");
  };

  const pasteConfig = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes('.apps.googleusercontent.com')) {
        setGoogleClientId(text);
        alert("Configuration imported successfully!");
      } else {
        alert("That doesn't look like a valid Google Client ID.");
      }
    } catch (e) {
      const manual = prompt("Paste the configuration code here:");
      if (manual && manual.includes('.apps.googleusercontent.com')) {
        setGoogleClientId(manual);
      }
    }
  };

  const activateAi = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setIsAiConnected(true);
    }
  };

  const ensureAiConnection = async () => {
    if (!(window as any).aistudio?.hasSelectedApiKey || !(await (window as any).aistudio.hasSelectedApiKey())) {
      alert("Magic scanning requires a one-time connection to Gemini AI. Opening setup now...");
      await activateAi();
    }
    return true;
  };

  const onReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await ensureAiConnection();
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
        alert("Magic scan failed. Ensure you have a valid API project selected in settings.");
      } finally {
        setIsImporting(false);
        if (receiptInputRef.current) receiptInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTextImport = async () => {
    if (!pasteContent.trim()) return;
    await ensureAiConnection();
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
    } catch (err) {
      alert("AI scan failed.");
    } finally {
      setIsImporting(false);
    }
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
    setIsAdviceLoading(true);
    try {
      const tips = await getSmartAdvice(item);
      setAdvice(tips || null);
    } catch (err) { console.error(err); } finally { setIsAdviceLoading(false); }
  };

  return (
    <div className="min-h-screen pb-40">
      {(isSyncing || isImporting) && (
        <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-md flex items-center justify-center">
          <div className="bg-gray-900 text-white px-8 py-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-300">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">{isImporting ? 'Magic Scanning' : 'Cloud Syncing'}</p>
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
                    {isDriveConnected ? 'Sync Active' : 'Offline Mode'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-xl sm:hidden transition-all ${showSettings ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2"/></svg>
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-100/80 p-1 rounded-2xl flex-1 sm:flex-none">
                <button onClick={() => { setActiveTab('clothing'); setIsShoppingMode(false); }} className={`flex-1 sm:flex-none px-6 py-2.5 text-[11px] font-bold rounded-xl transition-all ${activeTab === 'clothing' && !isShoppingMode ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400'}`}>CLOSET</button>
                <button onClick={() => { setActiveTab('beauty'); setIsShoppingMode(false); }} className={`flex-1 sm:flex-none px-6 py-2.5 text-[11px] font-bold rounded-xl transition-all ${activeTab === 'beauty' && !isShoppingMode ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400'}`}>BEAUTY</button>
              </div>
              <button 
                onClick={() => { setIsShoppingMode(!isShoppingMode); if (!isShoppingMode) setActiveTab('beauty'); }}
                className={`hidden sm:flex items-center gap-2 px-6 py-2.5 text-[11px] font-bold rounded-xl transition-all relative ${isShoppingMode ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 0a2 2 0 100 4 2 2 0 000-4z" strokeWidth="2"/></svg>
                {isShoppingMode ? 'SHOPPING' : 'REFILLS'}
                {itemsNeedingRefill > 0 && !isShoppingMode && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-black">{itemsNeedingRefill}</span>
                )}
              </button>
              <button onClick={() => setShowSettings(!showSettings)} className={`hidden sm:flex p-3 rounded-xl border transition-all ${showSettings ? 'bg-gray-900 text-white border-gray-900 shadow-md' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="2"/></svg>
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="mb-6 p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-6 animate-in slide-in-from-top duration-300">
              <div className="flex justify-between items-center">
                 <h3 className="text-xs font-bold text-gray-900 uppercase tracking-[0.2em]">Sync & Intelligence</h3>
                 <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-[10px] text-gray-400 font-bold uppercase hover:text-indigo-600">Advanced</button>
              </div>

              {/* Intelligence Section */}
              <div className="bg-white p-6 rounded-3xl border border-gray-200">
                <div className="flex justify-between items-start mb-4">
                   <div>
                     <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">AI Intelligence</h4>
                     <p className="text-[10px] text-gray-500 mt-1">Powers Magic Scanning & Receipt Recognition</p>
                   </div>
                   <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase ${isAiConnected ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                      {isAiConnected ? 'Active' : 'Offline'}
                   </span>
                </div>
                {!isAiConnected ? (
                  <button onClick={activateAi} className="w-full py-4 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2"/></svg>
                    Activate Intelligence
                  </button>
                ) : (
                  <button onClick={activateAi} className="w-full py-4 bg-white border border-gray-200 text-gray-600 text-[10px] font-bold uppercase rounded-xl hover:bg-gray-50 transition-all">
                    Update Connection
                  </button>
                )}
                <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                  <p className="text-[9px] text-gray-400 leading-relaxed italic">
                    Requires a Google Gemini API Project. 
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="ml-1 text-indigo-600 font-bold underline">Learn about billing</a>
                  </p>
                </div>
              </div>

              {!isDriveConnected ? (
                <div className="bg-white p-6 rounded-3xl border border-gray-200">
                  <h4 className="text-xs font-bold text-gray-800 mb-1 uppercase tracking-wider">Cloud Sync</h4>
                  <p className="text-[10px] text-gray-500 mb-4">Backup your closet to Google Drive</p>
                  <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all">
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="" />
                    <span className="text-[10px] font-bold text-gray-700 uppercase">Connect Drive</span>
                  </button>
                </div>
              ) : (
                <div className="bg-gray-900 p-6 rounded-3xl text-white shadow-xl shadow-gray-100 relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                         <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Cloud Archive</p>
                         <h4 className="text-lg font-serif">Cloud Vault Active</h4>
                       </div>
                    </div>
                    <div className="flex items-center gap-4 mt-6">
                       <button onClick={handleDrivePush} className="flex-1 py-3 bg-white text-gray-900 text-[10px] font-bold uppercase rounded-xl shadow-lg">Push Data</button>
                       <button onClick={handleDrivePull} className="flex-1 py-3 bg-gray-800 text-white text-[10px] font-bold uppercase rounded-xl border border-white/20">Fetch Updates</button>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                       <p className="text-[10px] opacity-60">Synced: {lastSynced ? new Date(lastSynced).toLocaleTimeString() : 'Never'}</p>
                       <button onClick={handleLogout} className="text-[10px] font-bold uppercase opacity-60 hover:opacity-100">Disconnect</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Backup Fallback */}
              <div className="bg-white p-6 rounded-3xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 mb-3 uppercase tracking-wider">Manual Data Control</h4>
                <div className="flex gap-3">
                  <button onClick={manualExport} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 text-[10px] font-bold uppercase rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth="2.5"/></svg>
                    Export
                  </button>
                  <button onClick={() => backupInputRef.current?.click()} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 text-[10px] font-bold uppercase rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeWidth="2.5"/></svg>
                    Restore
                  </button>
                </div>
                <input type="file" ref={backupInputRef} onChange={manualImport} accept=".json" className="hidden" />
              </div>

              {showAdvanced && (
                <div className="p-6 bg-white rounded-3xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200 shadow-sm">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Google Sync Credentials</p>
                    <button onClick={() => setShowHelp(!showHelp)} className="text-[10px] text-indigo-600 font-bold uppercase flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2"/></svg>
                      Setup Steps
                    </button>
                  </div>
                  <input type="password" value={googleClientId} onChange={e => setGoogleClientId(e.target.value)} placeholder="000000-xxxx.apps.googleusercontent.com" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-mono" />
                  
                  <div className="flex gap-2">
                    <button onClick={copyConfig} className="flex-1 py-3 bg-gray-900 text-white text-[10px] font-bold uppercase rounded-xl">Copy Config</button>
                    <button onClick={pasteConfig} className="flex-1 py-3 bg-gray-100 text-gray-900 text-[10px] font-bold uppercase rounded-xl">Paste Config</button>
                  </div>

                  {showHelp && (
                    <div className="p-5 bg-indigo-50/50 rounded-2xl text-[11px] text-indigo-900 leading-relaxed border border-indigo-100 animate-in slide-in-from-top-2">
                      <p className="mb-3 font-bold text-indigo-900 uppercase tracking-wider text-xs">How to get your Client ID (FREE):</p>
                      <ol className="list-decimal list-inside space-y-3">
                        <li>Go to <a href="https://console.cloud.google.com/" target="_blank" className="underline font-bold">Google Cloud Console</a></li>
                        <li>Create a project named <b>"AuraArchive"</b></li>
                        <li>Search for <b>"Google Drive API"</b> and click <b>Enable</b></li>
                        <li>Go to <b>"OAuth consent screen"</b>, choose <b>External</b>, and fill in App Name/Email</li>
                        <li className="bg-red-50 p-2 rounded-lg border border-red-100">
                           <span className="font-bold">CRITICAL:</span> Under <b>"Audience" (or "Test Users")</b>, add your emails.
                           <br/><span className="italic mt-1 block opacity-80 font-bold">Use LOWERCASE only. No spaces. Type manually.</span>
                        </li>
                        <li>Go to <b>"Credentials"</b> &gt; <b>Create Credentials</b> &gt; <b>OAuth client ID</b></li>
                        <li>Select <b>Web Application</b></li>
                        <li>Under <b>Authorized JavaScript Origins</b>, add:<br/><code className="bg-white px-1 rounded font-bold break-all">{window.location.origin}</code></li>
                        <li>Copy the resulting <b>Client ID</b> and paste it above!</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
              {syncError && <p className="text-[10px] text-red-500 text-center font-bold uppercase">{syncError}</p>}
            </div>
          )}

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2.5"/></svg></span>
            <input type="text" placeholder={`Search ${activeTab}...`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-2xl text-sm focus:bg-white outline-none" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {isShoppingMode && (
          <div className="mb-6 p-6 bg-indigo-50 border border-indigo-100 rounded-[2rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <div>
                <h2 className="text-indigo-900 font-serif text-xl">Restock Guide</h2>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">{filteredItems.length} items to refill</p>
             </div>
             <button onClick={() => setIsShoppingMode(false)} className="px-6 py-2.5 bg-white text-indigo-600 text-[10px] font-bold uppercase rounded-xl shadow-sm">Full Collection</button>
          </div>
        )}

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filteredItems.map(item => <ItemCard key={item.id} item={item} onClick={handleItemClick} />)}
          </div>
        ) : (
          <div className="text-center py-24 bg-white/50 border-2 border-dashed border-gray-200 rounded-[3rem]">
            <h3 className="text-lg font-serif text-gray-800 mb-2">No items found</h3>
            <p className="text-gray-400 text-sm mb-8 italic">Ready for your first entries?</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
               <button onClick={() => setShowModal(true)} className="px-8 py-4 bg-gray-900 text-white text-[11px] font-bold uppercase rounded-full shadow-lg">New Entry</button>
               <button onClick={() => receiptInputRef.current?.click()} className="px-8 py-4 bg-indigo-600 text-white text-[11px] font-bold uppercase rounded-full shadow-lg">Magic Import</button>
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-8 inset-x-0 flex justify-center z-40 pointer-events-none gap-3">
        <div className="flex bg-white/90 backdrop-blur-xl p-1.5 rounded-full shadow-2xl border border-gray-100 pointer-events-auto">
          <button onClick={() => receiptInputRef.current?.click()} className="p-4 hover:bg-gray-50 rounded-full text-indigo-600 group transition-all" title="Upload Receipt Photo">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="2"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2"/></svg>
          </button>
          <button onClick={() => setShowPasteModal(true)} className="p-4 hover:bg-gray-50 rounded-full text-indigo-600 group transition-all" title="Paste Email Text">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2"/></svg>
          </button>
          <div className="w-[1px] bg-gray-100 mx-2" />
          <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-8 py-4 rounded-full flex items-center gap-3 active:scale-95 transition-all">
            <span className="font-bold tracking-[0.2em] text-[10px] uppercase">New Entry</span>
          </button>
        </div>
      </div>

      {showPasteModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in duration-300">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="text-xl font-serif text-gray-900">Analyze Order Text</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Paste email content below</p>
                 </div>
                 <button onClick={() => setShowPasteModal(false)} className="p-2 text-gray-400 hover:text-gray-900"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2"/></svg></button>
              </div>
              <textarea 
                className="w-full h-64 p-4 bg-gray-50 border border-gray-100 rounded-3xl text-sm focus:bg-white outline-none resize-none font-mono"
                placeholder="Paste confirmation email text here..."
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
              />
              <button 
                onClick={handleTextImport}
                disabled={!pasteContent.trim() || isImporting}
                className="w-full mt-6 py-5 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-30"
              >
                Start AI Analysis
              </button>
           </div>
        </div>
      )}

      <input type="file" ref={receiptInputRef} onChange={onReceiptUpload} accept="image/*" className="hidden" />
      {showModal && <EditModal item={selectedItem} type={activeTab} onClose={closeModals} onSave={handleSave} onDelete={handleDelete} />}
      {showBatchModal && <BatchImportModal items={batchItems} onClose={() => setShowBatchModal(false)} onConfirm={handleBatchConfirm} />}

      {selectedItem && showModal && (
        <div className="fixed bottom-28 right-6 z-[60] w-72 max-w-[85vw]">
          <div className="bg-gray-900 text-white p-6 rounded-[2rem] shadow-2xl border border-white/10">
            <span className="block text-[10px] font-bold text-indigo-300 uppercase mb-3 tracking-widest">Aura Insight</span>
            <div className="text-[11px] leading-relaxed italic">{isAdviceLoading ? 'Retrieving wisdom...' : advice}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
