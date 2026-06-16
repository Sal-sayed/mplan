'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

interface URLInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export default function URLInput({ onSubmit, isLoading }: URLInputProps) {
  const [url, setUrl] = useState('');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const validateUrl = useCallback((value: string) => {
    if (!value) {
      setIsValid(null);
      return;
    }
    try {
      const parsed = new URL(
        value.startsWith('http') ? value : `https://${value}`
      );
      setIsValid(!!parsed.hostname.includes('.'));
    } catch {
      setIsValid(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || isLoading) return;
    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    try {
      new URL(finalUrl);
      onSubmit(finalUrl);
    } catch {
      setIsValid(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="w-full max-w-2xl mx-auto"
    >
      <form onSubmit={handleSubmit} className="relative group">
        {/* Animated gradient border */}
        <div
          className="absolute -inset-[1px] rounded-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]"
          style={{
            background: isFocused
              ? 'conic-gradient(from var(--border-angle, 0deg), #8b5cf6, #3b82f6, #06b6d4, #ec4899, #8b5cf6)'
              : 'conic-gradient(from 0deg, rgba(139,92,246,0.5), rgba(59,130,246,0.3), rgba(139,92,246,0.5))',
            animation: isFocused ? 'spin 3s linear infinite' : 'none',
          }}
        />

        <div className="relative flex items-center bg-overlay backdrop-blur-2xl rounded-2xl border border-line overflow-hidden">
          <div className="flex items-center pl-5 pr-2">
            <Globe
              className={`w-5 h-5 transition-colors duration-300 ${
                isValid === true
                  ? 'text-emerald-400'
                  : isValid === false
                  ? 'text-red-400'
                  : 'text-faint'
              }`}
            />
          </div>

          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              validateUrl(e.target.value);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Enter website URL (e.g., example.com)"
            className="flex-1 bg-transparent py-5 px-2 text-ink placeholder-slate-500 outline-none text-lg"
            disabled={isLoading}
          />

          <motion.button
            type="submit"
            disabled={isLoading || !url}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="m-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-onaccent font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Generate Plan</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </form>

      {/* Validation message */}
      <AnimatePresence>
        {isValid === false && url.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-3 flex items-center gap-2 text-red-400 text-sm pl-2"
          >
            <AlertCircle className="w-4 h-4" />
            Please enter a valid URL
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
