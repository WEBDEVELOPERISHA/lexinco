// public/js/feed.js
import React, { useState, useEffect, useRef } from 'https://cdn.jsdelivr.net/npm/react@18/umd/react.development.js';
import ReactDOM from 'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js';
import {
  ChevronUp, ChevronDown, Upload, Mic, Eye, EyeOff, X, AlertCircle, Send
} from 'https://cdn.jsdelivr.net/npm/lucide-react/dist/umd/lucide-react.js';

// === LexincoFeed Component (Paste Your Full Component Here) ===
const LexincoFeed = () => {
  const [currentCard, setCurrentCard] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [blurVideo, setBlurVideo] = useState(true);
  const [alterVoice, setAlterVoice] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const containerRef = useRef(null);

  const storyCards = [
    {
      type: 'static',
      title: 'Wage Theft at Metro Diner',
      subtitle: 'Server forced to work off-clock',
      description: 'Maria worked 15+ unpaid hours per week. Management threatened deportation when she asked for proper pay.',
      impact: '23 other workers affected',
      location: 'Downtown Seattle',
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=800&fit=crop'
    },
    {
      type: 'video',
      title: 'Anonymous Worker #847',
      subtitle: 'Construction site safety violations',
      description: 'They removed safety harnesses to "save time". Three workers were injured last month.',
      verified: true,
      views: '12.4K',
      supports: 847
    },
    {
      type: 'static',
      title: 'Retail Chain Discrimination',
      subtitle: 'Pregnancy discrimination at BigBox',
      description: 'Denied breaks, forced to lift heavy items, then fired for "performance issues" after announcing pregnancy.',
      impact: '7 similar cases reported',
      location: 'Portland, OR',
      image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=800&fit=crop'
    },
    {
      type: 'video',
      title: 'Anonymous Worker #923',
      subtitle: 'Restaurant health code violations',
      description: 'Manager told us to serve expired food. When I refused, they cut my hours to zero.',
      verified: true,
      views: '28.1K',
      supports: 1203
    }
  ];

  const toastMessages = [
    '847 people just supported a worker',
    'New case filed in your area',
    '1.2K workers viewing right now',
    'Justice won: $45K recovered',
    '156 supporters joined this hour'
  ];

  useEffect(() => {
    const timer = setTimeout(() => setShowCTA(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const toastInterval = setInterval(() => {
      const randomMsg = toastMessages[Math.floor(Math.random() * toastMessages.length)];
      setToastMessage(randomMsg);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 8000);
    return () => clearInterval(toastInterval);
  }, []);

  // === Swipe Support ===
  useEffect(() => {
    const container = containerRef.current;
    let touchStartY = 0;

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartY - touchEndY;
      if (Math.abs(diff) > 50) {
        if (diff > 0) handleScroll('down');
        else handleScroll('up');
      }
    };

    container?.addEventListener('touchstart', handleTouchStart, { passive: true });
    container?.addEventListener('touchend', handleTouchEnd);

    return () => {
      container?.removeEventListener('touchstart', handleTouchStart);
      container?.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentCard]);

  const handleScroll = (direction) => {
    if (direction === 'up' && currentCard > 0) {
      setCurrentCard(currentCard - 1);
    } else if (direction === 'down' && currentCard < storyCards.length - 1) {
      setCurrentCard(currentCard + 1);
    }
  };

  const StaticCard = ({ card }) => (
    <div className="relative w-full h-full bg-black">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${card.image})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
      </div>
      <div className="relative h-full flex flex-col justify-end p-6 pb-24">
        <div className="space-y-3">
          <div className="inline-block px-3 py-1 bg-red-600 text-white text-xs font-bold uppercase tracking-wider">
            Verified Report
          </div>
          <h2 className="text-white text-3xl font-bold leading-tight">{card.title}</h2>
          <p className="text-red-500 text-lg font-semibold">{card.subtitle}</p>
          <p className="text-white text-base leading-relaxed max-w-lg">{card.description}</p>
          <div className="flex gap-4 pt-2">
            <div className="text-gray-300 text-sm">
              <span className="text-red-500 font-bold">{card.impact}</span>
            </div>
            <div className="text-gray-400 text-sm">📍 {card.location}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const VideoCard = ({ card }) => (
    <div className="relative w-full h-full bg-black">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-48 h-48 rounded-full bg-red-600/20 blur-3xl animate-pulse" />
        </div>
      </div>
      <div className="relative h-full flex flex-col justify-between p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
              <Eye className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className="text-white font-semibold text-sm">{card.title}</div>
              <div className="text-gray-400 text-xs flex items-center gap-2">
                {card.verified && <span className="text-red-500">✓ Verified</span>}
                <span>{card.views} views</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3 pb-20">
          <p className="text-red-500 text-lg font-semibold">{card.subtitle}</p>
          <p className="text-white text-base leading-relaxed max-w-lg">{card.description}</p>
          <div className="text-gray-300 text-sm pt-2">
            <span className="text-red-500 font-bold">{card.supports}</span> people support this worker
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden" ref={containerRef}>
      {/* Story Cards */}
      <div
        className="h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateY(-${currentCard * 100}vh)` }}
      >
        {storyCards.map((card, idx) => (
          <div key={idx} className="h-screen w-full">
            {card.type === 'static' ? <StaticCard card={card} /> : <VideoCard card={card} />}
          </div>
        ))}
      </div>

      {/* Micro-brand Message */}
      <div className="absolute bottom-8 left-6 text-white text-xs opacity-30 italic pointer-events-none">
        "Silence is expensive."
      </div>

      {/* Navigation */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4">
        <button
          onClick={() => handleScroll('up')}
          disabled={currentCard === 0}
          className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center disabled:opacity-30 hover:bg-white/20 transition-all"
          aria-label="Previous story"
        >
          <ChevronUp className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => handleScroll('down')}
          disabled={currentCard === storyCards.length - 1}
          className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center disabled:opacity-30 hover:bg-white/20 transition-all"
          aria-label="Next story"
        >
          <ChevronDown className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Floating CTAs */}
      <div
        className={`absolute bottom-24 right-6 flex flex-col gap-3 transition-all duration-700 ${
          showCTA ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <button
          onClick={() => setShowUploadModal(true)}
          className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          aria-label="Upload story"
        >
          <Upload className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => setShowSupportForm(true)}
          className="px-6 py-3 bg-white text-black font-bold rounded-full shadow-lg hover:scale-105 transition-transform"
        >
          Support
        </button>
      </div>

      {/* Social Proof Toast */}
      {showToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full shadow-lg animate-fade-in flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          {toastMessage}
        </div>
      )}

      {/* Support Form */}
      {showSupportForm && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-end animate-fade-in">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-slide-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-black">Show Your Support</h3>
              <button onClick={() => setShowSupportForm(false)} aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border-l-4 border-red-600">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-800">
                  Your support helps workers know they're not alone. All submissions are confidential.
                </p>
              </div>
              <input
                type="email"
                placeholder="Email (optional, for updates)"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-600 focus:outline-none"
              />
              <textarea
                placeholder="Share why this matters to you..."
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-600 focus:outline-none resize-none"
              />
              <button className="w-full py-4 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                <Send className="w-5 h-5" />
                Send Support
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-black">Share Your Story</h3>
              <button onClick={() => setShowUploadModal(false)} aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">Upload video or record now</p>
                <button className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 transition-colors">
                  Choose File
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    {blurVideo ? <Eye className="w-5 h-5 text-red-600" /> : <EyeOff className="w-5 h-5 text-gray-400" />}
                    <div>
                      <div className="font-semibold text-sm">Blur Face</div>
                      <div className="text-xs text-gray-600">Protect your identity</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setBlurVideo(!blurVideo)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${blurVideo ? 'bg-red-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${blurVideo ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <Mic className={`w-5 h-5 ${alterVoice ? 'text-red-600' : 'text-gray-400'}`} />
                    <div>
                      <div className="font-semibold text-sm">Alter Voice</div>
                      <div className="text-xs text-gray-600">Change voice pitch</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAlterVoice(!alterVoice)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${alterVoice ? 'bg-red-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${alterVoice ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <p className="text-xs text-gray-700 leading-relaxed">
                  Your safety is our priority. All uploads are encrypted and you can remain completely anonymous.
                </p>
              </div>
              <button className="w-full py-4 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors">
                Upload Story
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-slide-up { animation: slide-up 0.4s ease-out; }
        .animate-scale-in { animation: scale-in 0.3s ease-out; }
      `}</style>
    </div>
  );
};

// === Render ===
ReactDOM.createRoot(document.getElementById('root')).render(<LexincoFeed />);