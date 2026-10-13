import React, { useState } from 'react';
import { X, PlusCircle, Sparkles, Shield, Zap } from 'lucide-react';
import { SearchDocument, voidSearchEngine } from '../lib/searchEngine';

interface IndexDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentIndexed: (doc: SearchDocument) => void;
}

export const IndexDocumentModal: React.FC<IndexDocumentModalProps> = ({
  isOpen,
  onClose,
  onDocumentIndexed
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SearchDocument['category']>('survival');
  const [tags, setTags] = useState('sovereign, ark, offline');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    const newDoc = voidSearchEngine.indexDocument(title, content, category, tagArray);

    setTimeout(() => {
      setIsSubmitting(false);
      onDocumentIndexed(newDoc);
      onClose();
      setTitle('');
      setContent('');
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-void-900 border border-cyan-800/80 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.25)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-void-950/90">
          <div className="flex items-center space-x-2.5">
            <PlusCircle className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100 font-mono">
                Index Document into the Void
              </h2>
              <div className="text-[10px] text-slate-400 font-sans">
                Sub-thermal in-browser indexing with zero external network calls
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
          {/* Title */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
              Document Title:
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Off-Grid Emergency Radio Protocol..."
              className="w-full bg-void-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
            />
          </div>

          {/* Category & Tags Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                Archive Category:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SearchDocument['category'])}
                className="w-full bg-void-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-2.5 py-2 text-xs text-slate-100 font-mono focus:outline-none cursor-pointer"
              >
                <option value="ark">Civilization Ark</option>
                <option value="survival">Engineering & Survival</option>
                <option value="medical">Medicine & Bio</option>
                <option value="crypto">Cryptography & zk</option>
                <option value="astronomy">Radio Astronomy</option>
                <option value="protocols">Void Protocols</option>
                <option value="user">User Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                Comma-separated Tags:
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="radio, mesh, survival..."
                className="w-full bg-void-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
              Document Markdown Content / Blueprint:
            </label>
            <textarea
              required
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Blueprint Title&#10;&#10;## 1. Materials Required&#10;- Component A...&#10;&#10;## 2. Procedure&#10;Step by step instructions..."
              className="w-full bg-void-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2.5 text-xs text-slate-100 font-mono focus:outline-none resize-none"
            />
          </div>

          {/* Privacy Notice */}
          <div className="bg-void-950/80 p-3 rounded-lg border border-slate-800 text-[10px] text-slate-400 leading-relaxed font-mono flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              This document is indexed directly in browser memory and local storage. Zero network requests will be made.
            </span>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-void-950 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-sans"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !content.trim()}
              className="px-5 py-2 rounded-lg bg-cyan-950 border border-cyan-600 hover:bg-cyan-900 text-cyan-300 text-xs font-bold font-mono transition-colors flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <Zap className="w-3.5 h-3.5 animate-spin" />
                  <span>INDEXING...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Index Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
