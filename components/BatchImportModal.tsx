
import React, { useState } from 'react';
import { BatchItem } from '../types';

interface BatchImportModalProps {
  items: BatchItem[];
  onClose: () => void;
  onConfirm: (finalItems: BatchItem[]) => void;
}

export const BatchImportModal: React.FC<BatchImportModalProps> = ({ items, onClose, onConfirm }) => {
  const [list, setList] = useState<BatchItem[]>(items.map(i => ({ ...i, selected: true })));

  const toggleItem = (index: number) => {
    setList(prev => prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item));
  };

  const selectedCount = list.filter(i => i.selected).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl scale-in-center">
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0">
          <div>
            <h2 className="text-2xl font-serif text-gray-900">Found {items.length} Items</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Review items to add to your vault</p>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-gray-50/30">
          {list.map((item, idx) => (
            <div 
              key={idx}
              onClick={() => toggleItem(idx)}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4 ${item.selected ? 'bg-white border-gray-900 shadow-xl scale-[1.02]' : 'bg-white/50 border-transparent opacity-60'}`}
            >
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${item.selected ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {item.type === 'clothing' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 8l-2-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v1l-2 2m18 0l-2 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7l-2-2m18 0H3" strokeWidth="2"/></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.691.387a6 6 0 01-3.86.517l-2.387-.477a2 2 0 00-1.022.547l-1.162 1.162a1 1 0 00.707 1.707h15.046a1 1 0 00.707-1.707l-1.162-1.162z" strokeWidth="2"/><path d="M12 2v4M8 4l2 2M16 4l-2 2" strokeWidth="2"/></svg>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{item.brand}</span>
                  <span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-md ${item.type === 'clothing' ? 'bg-indigo-50 text-indigo-500' : 'bg-pink-50 text-pink-500'}`}>{item.type}</span>
                </div>
                <h4 className="text-sm font-bold text-gray-800 leading-tight">{item.name}</h4>
                <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">{item.notes}</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${item.selected ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                {item.selected && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-gray-100 bg-white">
          <button 
            onClick={() => onConfirm(list.filter(i => i.selected))}
            disabled={selectedCount === 0}
            className="w-full py-5 bg-gray-900 text-white text-xs font-bold uppercase tracking-[0.2em] rounded-2xl hover:bg-black transition-all shadow-2xl disabled:opacity-30 active:scale-[0.98]"
          >
            Import {selectedCount} Selected Items
          </button>
        </div>
      </div>
    </div>
  );
};
