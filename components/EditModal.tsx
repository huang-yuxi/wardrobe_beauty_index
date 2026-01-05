
import React, { useState, useRef } from 'react';
import { CatalogItem, ItemType, RefillStatus, Season } from '../types';
import { analyzeProduct } from '../services/geminiService';

interface EditModalProps {
  item?: CatalogItem | null;
  type: ItemType;
  isAiEnabled: boolean;
  onClose: () => void;
  onSave: (item: Partial<CatalogItem>) => void;
  onDelete?: (id: string) => void;
}

const COLOR_MAP: Record<string, string> = {
  'Black': '#000000', 
  'White': '#FFFFFF', 
  'Beige': '#F5F5DC', 
  'Navy': '#000080', 
  'Grey': '#808080', 
  'Red': '#FF0000', 
  'Pink': '#FFC0CB', 
  'Gold': '#FFD700', 
  'Green': '#008000', 
  'Blue': '#0000FF'
};

export const EditModal: React.FC<EditModalProps> = ({ item, type, isAiEnabled, onClose, onSave, onDelete }) => {
  const isBeauty = type === 'beauty';
  const suggestions = isBeauty 
    ? ['Serum', 'Moisturizer', 'Cleanser', 'SPF', 'Foundation', 'Mascara', 'Lipstick'] 
    : ['T-Shirt', 'Denim', 'Knitwear', 'Blazer', 'Dress', 'Coat', 'Sneakers'];

  const [formData, setFormData] = useState<Partial<CatalogItem>>(item || {
    name: '',
    brand: '',
    type: type,
    category: '',
    status: 'in-stock' as RefillStatus,
    color: '',
    season: 'All-Season' as Season,
    openedDate: '',
    expiryMonths: 12,
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
        } catch (err) { console.error(err); } 
        finally { setAnalyzing(false); }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden flex flex-col max-h-[95vh] shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="p-8 flex justify-between items-center bg-white sticky top-0 z-10">
          <h2 className="text-2xl font-serif text-gray-900">{item ? 'Edit Entry' : `New ${type}`}</h2>
          <button onClick={onClose} className="p-3 text-gray-400 hover:bg-gray-50 rounded-2xl transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-[4/3] rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-all relative overflow-hidden group"
          >
            {formData.imageUrl ? (
              <img src={formData.imageUrl} className="w-full h-full object-cover" />
            ) : (
              <div className="text-center">
                 <svg className="w-10 h-10 text-gray-300 mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="2"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2"/></svg>
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attach Photo</p>
              </div>
            )}
            {analyzing && (
              <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center">
                <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Magic Parsing...</p>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

          <div className="space-y-6">
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Primary Color</label>
              <div className="flex flex-wrap gap-3">
                {Object.entries(COLOR_MAP).map(([name, hex]) => (
                  <button 
                    key={name}
                    title={name}
                    onClick={() => setFormData(p => ({ ...p, color: name }))}
                    className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${formData.color === name ? 'border-gray-900 scale-110 shadow-md ring-2 ring-gray-200' : 'border-gray-100 hover:scale-105'}`}
                    style={{ backgroundColor: hex }}
                  >
                    {formData.color === name && (
                      <svg className={`w-5 h-5 ${['Black', 'Navy'].includes(name) ? 'text-white' : 'text-gray-900'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</label>
                <input type="text" value={formData.brand} onChange={e => setFormData(p => ({ ...p, brand: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm outline-none focus:ring-2 ring-gray-100" placeholder="e.g. Chanel" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</label>
                <input type="text" value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm outline-none focus:ring-2 ring-gray-100" placeholder="Sub-type..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm outline-none focus:ring-2 ring-gray-100" placeholder="Product name..." />
            </div>

            {!isBeauty ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Season</label>
                <div className="flex gap-2">
                  {(['Spring', 'Summer', 'Autumn', 'Winter', 'All-Season'] as Season[]).map(s => (
                    <button 
                      key={s}
                      onClick={() => setFormData(p => ({ ...p, season: s }))}
                      className={`flex-1 py-3 text-[9px] font-bold uppercase rounded-xl border-2 transition-all ${formData.season === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-400 border-gray-100'}`}
                    >
                      {s.split('-')[0]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Opened Date</label>
                  <input type="date" value={formData.openedDate} onChange={e => setFormData(p => ({ ...p, openedDate: e.target.value }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm outline-none focus:ring-2 ring-gray-100" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shelf Life (Months)</label>
                  <input type="number" value={formData.expiryMonths} onChange={e => setFormData(p => ({ ...p, expiryMonths: parseInt(e.target.value) }))} className="w-full p-4 bg-gray-50 rounded-2xl border-none text-sm outline-none focus:ring-2 ring-gray-100" />
                </div>
              </div>
            )}

            {isBeauty && (
              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Stock</label>
                <div className="flex gap-2">
                  {(['in-stock', 'low', 'out'] as RefillStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setFormData(p => ({ ...p, status: s }))}
                      className={`flex-1 py-4 text-[9px] font-bold uppercase rounded-xl border-2 transition-all ${
                        formData.status === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-100'
                      }`}
                    >
                      {s === 'in-stock' ? 'Full' : s === 'low' ? 'Low' : 'Empty'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 border-t bg-white flex gap-3">
          {item && onDelete && (
            <button onClick={() => onDelete(item.id)} className="px-6 text-red-500 font-bold text-[10px] uppercase tracking-widest">Delete</button>
          )}
          <button onClick={() => onSave(formData)} className="flex-1 py-5 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-2xl shadow-xl active:scale-95 transition-all">
            Update Catalog
          </button>
        </div>
      </div>
    </div>
  );
};
