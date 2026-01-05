
import React, { useState, useRef } from 'react';
import { CatalogItem, ItemType, RefillStatus } from '../types';
import { analyzeProduct } from '../services/geminiService';

interface EditModalProps {
  item?: CatalogItem | null;
  type: ItemType;
  isAiEnabled: boolean;
  onClose: () => void;
  onSave: (item: Partial<CatalogItem>) => void;
  onDelete?: (id: string) => void;
}

export const EditModal: React.FC<EditModalProps> = ({ item, type, isAiEnabled, onClose, onSave, onDelete }) => {
  const isBeauty = type === 'beauty';
  
  const [formData, setFormData] = useState<Partial<CatalogItem>>(item || {
    name: '',
    brand: '',
    type: type,
    category: '',
    status: 'in-stock' as RefillStatus,
    imageUrl: '',
    notes: '',
  });
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const resultBase64 = event.target?.result as string;
      setFormData(prev => ({ ...prev, imageUrl: resultBase64 }));
      
      // Only trigger AI if enabled
      if (isAiEnabled) {
        setAnalyzing(true);
        try {
          const base64Clean = resultBase64.split(',')[1];
          const result = await analyzeProduct(base64Clean, type);
          setFormData(prev => ({
            ...prev,
            name: result.name || prev.name,
            brand: result.brand || prev.brand,
            category: result.category || prev.category,
            notes: result.description ? (prev.notes ? `${prev.notes}\n${result.description}` : result.description) : prev.notes
          }));
        } catch (err) {
          console.error("AI analysis failed", err);
        } finally {
          setAnalyzing(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
          <h2 className="text-xl font-serif text-gray-900">{item ? 'Edit Details' : `New ${type}`}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-video rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-all relative overflow-hidden group"
          >
            {formData.imageUrl ? (
              <>
                <img src={formData.imageUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-white text-[10px] font-bold uppercase tracking-widest border border-white px-4 py-2 rounded-full">Replace Photo</span>
                </div>
              </>
            ) : (
              <div className="text-center p-8">
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 mx-auto">
                   <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="2"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2"/></svg>
                </div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Attach Photo</p>
                {isAiEnabled && <p className="text-[10px] text-indigo-500 font-bold mt-1 uppercase">AI Auto-Parsing Enabled</p>}
              </div>
            )}
            {analyzing && (
              <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Magic in progress...</p>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</label>
              <input type="text" value={formData.brand} onChange={e => setFormData(p => ({ ...p, brand: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-medium focus:bg-white transition-all outline-none" placeholder="e.g. Chanel" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</label>
              <input type="text" value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-medium focus:bg-white transition-all outline-none" placeholder={isBeauty ? "e.g. Lip Balm" : "e.g. Knitwear"} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Product Name</label>
            <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-medium focus:bg-white transition-all outline-none" placeholder="Full name of the item..." />
          </div>

          {isBeauty && (
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shopping Status</label>
              <div className="flex gap-2">
                {(['in-stock', 'low', 'out'] as RefillStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setFormData(p => ({ ...p, status: s }))}
                    className={`flex-1 py-3 text-[10px] font-bold uppercase rounded-xl border-2 transition-all ${
                      formData.status === s ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {s === 'in-stock' ? 'Full' : s === 'low' ? 'Low' : 'Empty'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notes</label>
            <textarea rows={3} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm font-medium focus:bg-white transition-all outline-none resize-none" placeholder="Shade, size, or styling notes..." />
          </div>
        </div>

        <div className="p-6 border-t bg-white flex gap-3">
          {item && onDelete && (
            <button onClick={() => onDelete(item.id)} className="px-6 text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 rounded-2xl transition-all">Delete</button>
          )}
          <button onClick={() => onSave(formData)} className="flex-1 py-5 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-gray-200 active:scale-[0.98] transition-all">
            {item ? 'Save Updates' : 'Add to Collection'}
          </button>
        </div>
      </div>
    </div>
  );
};
