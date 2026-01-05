
import React, { useState, useRef } from 'react';
import { CatalogItem, ItemType, RefillStatus } from '../types';
import { analyzeProduct } from '../services/geminiService';

interface EditModalProps {
  item?: CatalogItem | null;
  type: ItemType;
  onClose: () => void;
  onSave: (item: Partial<CatalogItem>) => void;
  onDelete?: (id: string) => void;
}

export const EditModal: React.FC<EditModalProps> = ({ item, type, onClose, onSave, onDelete }) => {
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
      const base64 = (event.target?.result as string).split(',')[1];
      setFormData(prev => ({ ...prev, imageUrl: event.target?.result as string }));
      
      setAnalyzing(true);
      try {
        const result = await analyzeProduct(base64, type);
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
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-800">{item ? 'Details' : `New ${type === 'clothing' ? 'Garment' : 'Product'}`}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Image Analysis</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-video rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors relative overflow-hidden group"
            >
              {formData.imageUrl ? (
                <>
                  <img src={formData.imageUrl} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-white text-xs font-bold px-3 py-1.5 border border-white rounded-full">Change Photo</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="2"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2"/></svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-600">Take Photo / Upload</span>
                  <span className="text-[10px] text-gray-400 mt-1">AI will auto-describe your item</span>
                </>
              )}
              {analyzing && (
                <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-3 border-gray-900 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <span className="text-xs font-bold text-gray-900 tracking-wider">AI ANALYZING...</span>
                  </div>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</label>
              <input 
                type="text" 
                value={formData.brand}
                onChange={e => setFormData(p => ({ ...p, brand: e.target.value }))}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-gray-200 outline-none text-sm font-medium transition-all"
                placeholder="e.g. Dior"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type / Kind</label>
              <input 
                type="text" 
                value={formData.category}
                onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-gray-200 outline-none text-sm font-medium transition-all"
                placeholder={isBeauty ? "e.g. Cleanser" : "e.g. Maxi Dress"}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Item Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-gray-200 outline-none text-sm font-medium transition-all"
              placeholder="Full product name..."
            />
          </div>

          {/* Only show Refill Status for Beauty products */}
          {isBeauty && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shopping Status</label>
              <div className="flex gap-2">
                {(['in-stock', 'low', 'out'] as RefillStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setFormData(p => ({ ...p, status: s }))}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                      formData.status === s 
                      ? 'bg-gray-900 text-white border-gray-900 shadow-md scale-[1.02]' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s === 'in-stock' ? 'Full' : s === 'low' ? 'Low' : 'Buy Soon'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notes & Description</label>
            <textarea 
              rows={4}
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-gray-200 outline-none text-sm resize-none font-medium leading-relaxed"
              placeholder="Additional details, shade number, styling ideas..."
            />
          </div>
        </div>

        <div className="p-4 border-t flex gap-3 bg-white">
          {item && onDelete && (
            <button 
              onClick={() => onDelete(item.id)}
              className="px-6 py-3 text-red-500 font-bold text-xs uppercase tracking-widest hover:bg-red-50 rounded-xl transition-colors"
            >
              Delete
            </button>
          )}
          <button 
            onClick={() => onSave(formData)}
            className="flex-1 py-4 bg-gray-900 text-white text-xs font-bold uppercase tracking-[0.2em] rounded-xl hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-[0.98]"
          >
            {item ? 'Save Updates' : 'Catalog Item'}
          </button>
        </div>
      </div>
    </div>
  );
};
