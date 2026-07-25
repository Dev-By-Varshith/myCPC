import { useState, useEffect, useRef } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { 
  BarChart3, 
  BrainCircuit, 
  Sparkles, 
  Ghost, 
  Eye, 
  Flame, 
  Dna, 
  Settings,
  Target,
  Activity
} from 'lucide-react'
import './index.css'
import { runFullAnalysis, saveGoals, loadGoals, generateDailyPlan, fetchAllTags, fetchProblemsByTags, fetchSolverRankBreakdown, RANK_TIERS, loadUserProfile, saveUserProfile, loadDailyProgress, saveDailyProgress, syncDailyProgress, findDynamicRivals, fetchRatingHistories, fetchDynamicCoachInsights } from './cfAnalytics'
import { getDailyQueue, getAllTracked, addToSpacedRep, reviewProblem, removeFromSpacedRep, savePreFlight, getPreFlights, hasCompletedPreFlight, isTiltActive, triggerTilt, getTiltRemainingSeconds, getTodayCycle, setTodayCycle, updateCycleProblemStatus, getCycleHistory } from './spacedRep'
import SkillTree3D from './SkillTree3D';
import Heatmap3D from './Heatmap3D';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

function App() {
  const [user, setUser] = useState(null);
  const [isSpatialHome, setIsSpatialHome] = useState(true);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);

  const [activeView, setActiveView] = useState('command_center');
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [codeModal, setCodeModal] = useState({ isOpen: false, code: '', handle: '', url: '' });
  const [searchQuery, setSearchQuery] = useState('1920B');
  const [isSearching, setIsSearching] = useState(false);
  const [rankFilter, setRankFilter] = useState('All Ranks');
  
  // Profile Hub State
  const [cfHandle, setCfHandle] = useState('tourist');
  const [lcHandle, setLcHandle] = useState('');
  const [profile, setProfile] = useState({ avatar: '', rank: '', rating: '', loading: false });
  const [heatmap, setHeatmap] = useState([]);
  const [heatmapMode, setHeatmapMode] = useState('2d'); // '2d' | '3d'
  const [runRateData, setRunRateData] = useState({ monthExpected: 0, yearExpected: 0, yearlyData: [], monthCount: 0, yearCount: 0 });
  
  // Palantir Analytics State
  const [palantirData, setPalantirData] = useState(null);
  const [palantirLoading, setPalantirLoading] = useState(false);

  // Topic Explorer State
  const [teAllTags, setTeAllTags] = useState([]);
  const [teTagInput, setTeTagInput] = useState('');
  const [teSelectedTags, setTeSelectedTags] = useState([]);
  const [teProblems, setTeProblems] = useState([]);
  const [teBreakdowns, setTeBreakdowns] = useState({});
  const [teLoading, setTeLoading] = useState(false);
  const [teStatus, setTeStatus] = useState('');
  const [teMinRating, setTeMinRating] = useState(1400);
  const [teMaxRating, setTeMaxRating] = useState(3500);
  const [teSortBy, setTeSortBy] = useState('gm_desc');
  const [teRankHighlight, setTeRankHighlight] = useState('grandmaster');
  const [teTagSuggestions, setTeTagSuggestions] = useState([]);
  const [teShowSuggestions, setTeShowSuggestions] = useState(false);
  const [tePageSize] = useState(50);
  const [tePage, setTePage] = useState(0);

  // Training Hub State
  const [thProfile, setThProfile] = useState(loadUserProfile());
  const [thSetupMode, setThSetupMode] = useState(!loadUserProfile());
  const [thSetupHandle, setThSetupHandle] = useState('');
  const [thSetupGoalRank, setThSetupGoalRank] = useState('candidate master');
  const [thSetupDays, setThSetupDays] = useState(50);
  const [thSetupDailyQ, setThSetupDailyQ] = useState(3);
  const [thProgress, setThProgress] = useState(loadDailyProgress());
  const [thRivals, setThRivals] = useState(null);
  const [thRivalHistories, setThRivalHistories] = useState(null);
  const [thLoading, setThLoading] = useState(false);
  const [thStatus, setThStatus] = useState('');
  const [thCalMonth, setThCalMonth] = useState(new Date().getMonth());
  const [thCalYear, setThCalYear] = useState(new Date().getFullYear());

  // GM Analytics State
  const [gmCoachData, setGmCoachData] = useState(null);
  const [gmCoachLoading, setGmCoachLoading] = useState(false);
  const [gmCoachStatus, setGmCoachStatus] = useState('');

  // ── NEW: Spaced Repetition State ─────────────────────────────────────
  const [srQueue, setSrQueue] = useState([]);
  const [srAll, setSrAll] = useState([]);
  const [srActiveId, setSrActiveId] = useState(null);   // which problem is "open" for review
  const [srTimer, setSrTimer] = useState(0);            // seconds elapsed
  const srTimerRef = useRef(null);

  // ── NEW: Pre-Flight State ─────────────────────────────────────────────
  const [pfProblem, setPfProblem] = useState(null);    // { id, name, rating, statement }
  const [pfTC, setPfTC] = useState('');
  const [pfSpace, setPfSpace] = useState('');
  const [pfEdgeCases, setPfEdgeCases] = useState('');
  const [pfApproach, setPfApproach] = useState('');
  const [pfDone, setPfDone] = useState(false);
  const [pfSaved, setPfSaved] = useState(false);

  // ── NEW: Tilt State ───────────────────────────────────────────────────
  const [tiltActive, setTiltActive] = useState(false);
  const [tiltRemaining, setTiltRemaining] = useState(0);
  const [tiltHistory, setTiltHistory] = useState([]);
  const tiltRef = useRef(null);

  // ── NEW: Socratic Coach State ─────────────────────────────────────────
  const [coachProblemId, setCoachProblemId] = useState('');
  const [coachCode, setCoachCode] = useState('');
  const [coachHintLevel, setCoachHintLevel] = useState(1);
  const [coachHints, setCoachHints] = useState([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachNvidiaKey, setCoachNvidiaKey] = useState(() => localStorage.getItem('ag_nvidia_key') || '');
  const [coachWeakness, setCoachWeakness] = useState(null);
  const [coachSession, setCoachSession] = useState(null);  // { sessionId, startedAt }

  // ── NEW: Training Cycle State ─────────────────────────────────────────
  const [cycleToday, setCycleToday] = useState(getTodayCycle());
  const [cycleHistory, setCycleHistory] = useState(getCycleHistory(30));
  const [cycleTimer, setCycleTimer] = useState(null);  // { problemIdx, secondsLeft, running }
  const cycleTimerRef = useRef(null);
  const [backendHealth, setBackendHealth] = useState(null);

  const GM_REFS = ['tourist', 'jiangly', 'Benq'];

  // ── Effects ───────────────────────────────────────────────────────────
  // Refresh SR queue on mount
  const refreshSR = () => { setSrQueue(getDailyQueue()); setSrAll(getAllTracked()); };

  // Tilt ticker
  const startTiltTicker = () => {
    if (tiltRef.current) clearInterval(tiltRef.current);
    tiltRef.current = setInterval(() => {
      if (isTiltActive()) {
        setTiltActive(true);
        setTiltRemaining(getTiltRemainingSeconds());
      } else {
        setTiltActive(false);
        setTiltRemaining(0);
        clearInterval(tiltRef.current);
      }
    }, 1000);
  };

  // SR problem timer
  const startSRTimer = () => {
    if (srTimerRef.current) clearInterval(srTimerRef.current);
    setSrTimer(0);
    srTimerRef.current = setInterval(() => setSrTimer(t => t + 1), 1000);
  };
  const stopSRTimer = () => { if (srTimerRef.current) clearInterval(srTimerRef.current); };

  // Cycle countdown timer
  const startCycleTimer = (seconds, idx) => {
    if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    setCycleTimer({ problemIdx: idx, secondsLeft: seconds, running: true });
    cycleTimerRef.current = setInterval(() => {
      setCycleTimer(prev => {
        if (!prev || prev.secondsLeft <= 1) {
          clearInterval(cycleTimerRef.current);
          return { ...prev, secondsLeft: 0, running: false };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  };

  // On mount
  const [_init] = useState(() => {
    refreshSR();
    // Check backend health
    fetch(`${BACKEND}/api/health`).then(r => r.json()).then(setBackendHealth).catch(() => setBackendHealth(null));
    // Tilt init
    if (isTiltActive()) { setTiltActive(true); setTiltRemaining(getTiltRemainingSeconds()); startTiltTicker(); }
    return true;
  });

  // ── Handlers ──────────────────────────────────────────────────────────

  // Start backend tilt polling for current handle
  const startTiltPolling = async () => {
    try {
      await fetch(`${BACKEND}/api/tilt/start-polling`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: cfHandle })
      });
      startTiltTicker();
    } catch { console.error('Backend offline — tilt polling unavailable'); }
  };

  // SR: open a problem for review
  const openSRProblem = (id) => {
    setSrActiveId(id);
    setPfDone(hasCompletedPreFlight(id));
    setPfTC(''); setPfSpace(''); setPfEdgeCases(''); setPfApproach(''); setPfSaved(false);
    startSRTimer();
  };
  const closeSRProblem = () => { setSrActiveId(null); stopSRTimer(); setSrTimer(0); };

  const submitSRReview = (outcome) => {
    if (!srActiveId) return;
    reviewProblem(srActiveId, outcome);
    closeSRProblem();
    refreshSR();
  };

  // Pre-Flight submit
  const submitPreFlight = () => {
    if (!pfTC || !pfEdgeCases || !pfApproach) { alert('Fill all Pre-Flight fields before proceeding.'); return; }
    savePreFlight(srActiveId || pfProblem?.id, { targetTC: pfTC, spaceTC: pfSpace, edgeCases: pfEdgeCases, approach: pfApproach });
    setPfSaved(true);
    setPfDone(true);
  };

  // Coach: get a hint from LLM via backend
  const getCoachHint = async () => {
    if (!coachNvidiaKey) { alert('Enter your Nvidia NIM API key in the Coach panel first.'); return; }
    setCoachLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/coach/hint`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemStatement: `CF Problem ${coachProblemId}`,
          userCode: coachCode,
          preflightTC: pfTC,
          preflightApproach: pfApproach,
          hintLevel: coachHintLevel,
          prevHints: coachHints,
          nvidiaKey: coachNvidiaKey,
        })
      });
      const data = await res.json();
      if (data.hint) {
        setCoachHints(prev => [...prev, { level: coachHintLevel, text: data.hint, time: new Date().toLocaleTimeString() }]);
        setCoachHintLevel(l => Math.min(l + 1, 3));
      } else {
        alert(data.error || 'LLM unavailable');
      }
    } catch { alert('Backend offline — start node_backend/server.js'); }
    setCoachLoading(false);
  };

  // Coach: load weakness profile
  const loadWeaknessProfile = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/coach/weakness-profile?handle=${cfHandle}`);
      const data = await res.json();
      setCoachWeakness(data);
    } catch { setCoachWeakness(null); }
  };

  // Training cycle
  const planToday = async (type) => {
    let problems = [];
    if (type !== 'deload') {
      try {
        const minR = type === 'volume' ? 800 : 2000;
        const maxR = type === 'volume' ? 1600 : 3000;
        const count = type === 'volume' ? 10 : 2;
        const res = await fetch(`${BACKEND}/api/problems/tag-search?tags=&minRating=${minR}&maxRating=${maxR}&handle=${cfHandle}&limit=${count}`);
        const data = await res.json();
        problems = (data.problems || []).slice(0, count).map(p => ({
          id: `${p.contest_id}-${p.problem_index}`,
          name: p.problem_name,
          rating: p.rating,
          contestId: p.contest_id,
          index: p.problem_index,
          status: 'pending',
          timerSec: type === 'volume' ? 600 : 7200,
        }));
      } catch {}
    }
    const cycle = setTodayCycle(type, problems);
    setCycleToday(cycle);
    setCycleHistory(getCycleHistory(30));
  };

  const fetchPalantirData = async () => {
    setPalantirLoading(true);
    try {
      const pData = await runFullAnalysis(cfHandle, rankMeta.targetRating);
      setPalantirData(pData);
    } catch (e) {
      console.error(e);
    }
    setPalantirLoading(false);
  };

  const handleLoadDynamicCoach = async () => {
    setGmCoachLoading(true);
    try {
      const data = await fetchDynamicCoachInsights(cfHandle, msg => setGmCoachStatus(msg));
      setGmCoachData(data);
    } catch(e) {
      console.error(e);
      setGmCoachStatus('Failed to load dynamic insights.');
    }
    setGmCoachLoading(false);
  };

  const [ratingCurve, setRatingCurve] = useState([]);
  const [monthlyTags, setMonthlyTags] = useState([]);

  const getCfColor = (rating) => {
    if (!rating || rating < 1200) return '#808080';
    if (rating < 1400) return '#008000';
    if (rating < 1600) return '#03a89e';
    if (rating < 1900) return '#4444ff';
    if (rating < 2100) return '#aa00aa';
    if (rating < 2300) return '#ff8c00';
    if (rating < 2400) return '#ff8c00';
    if (rating < 2600) return '#ff0000';
    return '#aa0000';
  };

  const fetchUserProfile = async () => {
    setProfile(prev => ({ ...prev, loading: true }));
    try {
      const [infoRes, statusRes, ratingRes] = await Promise.all([
        fetch(`https://codeforces.com/api/user.info?handles=${cfHandle}`),
        fetch(`https://codeforces.com/api/user.status?handle=${cfHandle}`),
        fetch(`https://codeforces.com/api/user.rating?handle=${cfHandle}`)
      ]);
      const infoData = await infoRes.json();
      const statusData = await statusRes.json();
      const ratingData = await ratingRes.json();

      if (infoData.status === "OK") {
        const user = infoData.result[0];
        setProfile({ avatar: user.titlePhoto, rank: user.rank || 'Unrated', rating: user.rating || 0, loading: false });
      } else { setProfile(prev => ({ ...prev, loading: false })); return; }

      // Rating Curve
      if (ratingData.status === "OK") {
        setRatingCurve(ratingData.result.map(r => ({ rating: r.newRating, time: r.ratingUpdateTimeSeconds, name: r.contestName })));
      }

      if (statusData.status === "OK") {
        const subs = statusData.result;
        const today = new Date();
        const dates = {};
        for (let i = 363; i >= 0; i--) {
          const d = new Date(today); d.setDate(d.getDate() - i);
          dates[d.toISOString().split('T')[0]] = { count: 0, maxRating: 0 };
        }
        // Monthly tags for current month
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const currentDayOfYear = Math.floor((today - startOfYear) / 86400000) + 1;
        const daysInYear = (currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0)) ? 366 : 365;
        const currentDayOfMonth = today.getDate();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        const tagMap = {};

        const yearlyDates = {};
        for (let i = 0; i < daysInYear; i++) {
          const d = new Date(startOfYear); d.setDate(d.getDate() + i);
          yearlyDates[d.toISOString().split('T')[0]] = { count: 0, maxRating: 0 };
        }
        
        let monthCount = 0;
        let yearCount = 0;

        subs.forEach(sub => {
          if (sub.verdict === "OK") {
            const d = new Date(sub.creationTimeSeconds * 1000);
            const dateStr = d.toISOString().split('T')[0];
            if (dates[dateStr]) {
              dates[dateStr].count++;
              if ((sub.problem.rating || 0) > dates[dateStr].maxRating) dates[dateStr].maxRating = sub.problem.rating || 0;
            }
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
              monthCount++;
              (sub.problem.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
            }
            if (d.getFullYear() === currentYear) {
              yearCount++;
              if (yearlyDates[dateStr]) {
                yearlyDates[dateStr].count++;
                if ((sub.problem.rating || 0) > yearlyDates[dateStr].maxRating) {
                  yearlyDates[dateStr].maxRating = sub.problem.rating || 0;
                }
              }
            }
          }
        });

        const monthExpected = Math.round((monthCount / currentDayOfMonth) * daysInMonth) || 0;
        const yearExpected = Math.round((yearCount / currentDayOfYear) * daysInYear) || 0;

        let cumulative = 0;
        const yearlyData = Object.entries(yearlyDates).map(([date, data]) => {
          cumulative += data.count;
          return { date, count: data.count, cumulativeCount: cumulative, maxRating: data.maxRating };
        });

        setRunRateData({ monthExpected, yearExpected, yearlyData, monthCount, yearCount });

        setHeatmap(Object.entries(dates).map(([date, data]) => ({ date, count: data.count, maxRating: data.maxRating })));
        setMonthlyTags(Object.entries(tagMap).sort((a,b) => b[1]-a[1]).slice(0, 12));
      }
    } catch(e) { console.error(e); setProfile(prev => ({ ...prev, loading: false })); }
  };

  const [solutions, setSolutions] = useState([
    { handle: "tourist", rank: "legendary grandmaster", lang: "C++17 (GCC 7-32)", time: "15ms", mem: "256KB" },
    { handle: "Benq", rank: "grandmaster", lang: "C++20 (GCC 13-64)", time: "31ms", mem: "1024KB" },
    { handle: "Radewoosh", rank: "international grandmaster", lang: "C++17 (GCC 7-32)", time: "15ms", mem: "0KB" }
  ]);

  useEffect(() => {
    fetchUserProfile();
    setTimeout(() => {
      const mockTimeline = [
        { handle: "tourist", rank: "GM", problem: "A", time: 120, verdict: "AC" },
        { handle: "tourist", rank: "GM", problem: "B", time: 310, verdict: "AC" },
        { handle: "base_16", rank: "EXP", problem: "A", time: 340, verdict: "WA" },
        { handle: "base_16", rank: "EXP", problem: "A", time: 450, verdict: "AC" },
        { handle: "tourist", rank: "GM", problem: "C", time: 820, verdict: "AC" }
      ];
      setTimeline(mockTimeline);
      setLoading(false);
    }, 1500);
  }, []);

  const renderSidebar = () => (
    <aside className="sidebar">
      <div style={{ padding: '0 16px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="status-dot-vision"></div>
        <div>
          <h1 className="text-sm text-primary" style={{ letterSpacing: '0.05em' }}>CF_GRANDMASTER</h1>
          <p className="text-micro text-cyan">SYSTEM.ONLINE</p>
        </div>
      </div>
      
      <div className="text-micro text-muted" style={{ padding: '0 16px', marginBottom: '8px' }}>DASHBOARD VIEWS</div>
      <div className="nav-item" onClick={() => setIsSpatialHome(true)} style={{ color: 'var(--accent-orange)' }}>
         ⌂ Spatial Home
      </div>
      <div className={`nav-item ${activeView === 'command_center' ? 'active' : ''}`} onClick={() => setActiveView('command_center')}>
        Command Center
      </div>
      <div className={`nav-item ${activeView === 'crucible' ? 'active' : ''}`} onClick={() => setActiveView('crucible')}>
        The Crucible (Matrix)
      </div>
      <div className={`nav-item ${activeView === 'golden_path' ? 'active' : ''}`} onClick={() => setActiveView('golden_path')}>
        Promotions & Golden Path
      </div>
      <div className={`nav-item ${activeView === 'graveyard' ? 'active' : ''}`} onClick={() => setActiveView('graveyard')}>
        The Graveyard
      </div>
      <div className={`nav-item ${activeView === 'code_explorer' ? 'active' : ''}`} onClick={() => setActiveView('code_explorer')}>
        GM Code Explorer
      </div>
      <div className={`nav-item ${activeView === 'palantir_hub' ? 'active' : ''}`} onClick={() => setActiveView('palantir_hub')} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '8px', paddingTop: '16px' }}>
        ◆ Palantir Intelligence
      </div>
      <div className={`nav-item ${activeView === 'topic_explorer' ? 'active' : ''}`} onClick={() => { setActiveView('topic_explorer'); if (teAllTags.length === 0) fetchAllTags().then(setTeAllTags).catch(() => {}); }}>
        🔍 Topic Explorer
      </div>
      <div className={`nav-item ${activeView === 'training_hub' ? 'active' : ''}`} onClick={() => setActiveView('training_hub')}>
        🔥 Training Hub
      </div>
      <div className={`nav-item ${activeView === 'skill_tree' ? 'active' : ''}`} onClick={() => setActiveView('skill_tree')}>
        🧬 Neural Skill Tree
      </div>
      <div className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '8px', paddingTop: '16px' }}>
        ⚙️ Profile & Settings
      </div>
    </aside>
  );

  const renderCommandCenter = () => {
    // Rating chart dimensions
    const chartW = 740, chartH = 260;
    const paddingY = 20;
    const bands = [{min:0,max:1200,color:'#808080'},{min:1200,max:1400,color:'#008000'},{min:1400,max:1600,color:'#03a89e'},{min:1600,max:1900,color:'#4444ff'},{min:1900,max:2100,color:'#aa00aa'},{min:2100,max:2400,color:'#ff8c00'},{min:2400,max:4000,color:'#ff0000'}];
    const actualMin = ratingCurve.length > 0 ? Math.min(...ratingCurve.map(p => p.rating)) : 1000;
    const actualMax = ratingCurve.length > 0 ? Math.max(...ratingCurve.map(p => p.rating)) : 3000;
    const rMin = Math.max(0, Math.floor(actualMin / 200) * 200 - 200);
    const rMax = Math.ceil(actualMax / 200) * 200 + 200;
    const plotH = chartH - paddingY * 2;
    const toY = (r) => chartH - paddingY - ((r - rMin) / (rMax - rMin)) * plotH;
    const curvePoints = ratingCurve.length > 1 ? ratingCurve.map((p, i) => `${(i / (ratingCurve.length - 1)) * chartW},${toY(p.rating)}`).join(' ') : '';
    const currentRating = profile.rating || 0;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const currentMonthName = monthNames[new Date().getMonth()];

    return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto auto', gap: '20px' }}>
      {/* Rating Curve â€” spans 2 cols */}
      <div className="glass-panel-outer" style={{ gridColumn: 'span 2', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="text-micro text-muted">RATING TRAJECTORY</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span className="text-mono text-xl" style={{ color: getCfColor(currentRating) }}>{currentRating}</span>
            <span className="text-mono text-micro" style={{ color: getCfColor(currentRating), textTransform: 'capitalize' }}>{profile.rank}</span>
          </div>
        </div>
        <div className="quant-table-container" style={{ padding: '0', overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
          {ratingCurve.length > 1 ? (
          <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: '260px', display: 'block' }} preserveAspectRatio="none">
            {bands.map((b, i) => {
              if (b.min >= rMax || b.max <= rMin) return null;
              const yTop = toY(Math.min(b.max, rMax));
              const yBottom = toY(Math.max(b.min, rMin));
              return (
                <rect key={i} x="0" y={yTop} width={chartW} height={Math.max(0, yBottom - yTop)} fill={b.color} style={{ opacity: 0.2 }} />
              );
            })}
            
            {/* Axis labels */}
            <text x="5" y="15" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">{rMax}</text>
            <text x="5" y={chartH - 5} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">{rMin}</text>
            
            <polyline points={curvePoints} className="rating-line" />
            {ratingCurve.map((p, i) => i % Math.max(1, Math.floor(ratingCurve.length / 30)) === 0 && (
              <circle key={i} cx={(i / (ratingCurve.length - 1)) * chartW} cy={toY(p.rating)} r="3" className="rating-dot" />
            ))}
          </svg>
          ) : (
            <p className="text-mono text-sm text-muted text-center" style={{ padding: '60px 0' }}>Sync your identity to load rating curve</p>
          )}
        </div>
      </div>

      {/* Profile Hub */}
      <div className="glass-panel-outer" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 className="text-micro text-muted">IDENTITY HUB</h2>
        <div className="quant-table-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg-glass-inner)', overflow: 'hidden', border: `2px solid ${getCfColor(currentRating)}` }}>
              {profile.avatar && <img src={profile.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div>
              <div className="text-mono text-lg" style={{ color: getCfColor(currentRating) }}>{cfHandle}</div>
              <div className="text-mono text-micro text-secondary" style={{ textTransform: 'capitalize' }}>{profile.rank || 'Sync Profile in Settings'}</div>
            </div>
          </div>
          <button onClick={() => setActiveView('settings')} style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '10px', cursor: 'pointer', fontWeight: 'bold', width: '100%', transition: 'opacity 0.2s' }}>
            EDIT GLOBAL PROFILE
          </button>
        </div>
        {/* Macro-Cycle Periodization */}
        <div className="quant-table-container" style={{ padding: '14px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div className="text-micro text-secondary">TRAINING CYCLE (TODAY)</div>
            {backendHealth ? (
               <div className="text-mono text-micro text-green">DB SYNCED</div>
            ) : (
               <div className="text-mono text-micro text-orange">DB OFFLINE</div>
            )}
          </div>
          
          {cycleToday ? (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-mono text-sm text-primary" style={{ textTransform: 'uppercase' }}>{cycleToday.type} PHASE</span>
                  <span className="text-mono text-sm text-cyan">{cycleToday.problems.filter(p => p.status === 'passed').length} / {cycleToday.problems.length} AC</span>
                </div>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                   {cycleToday.problems.map((p, idx) => (
                     <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: p.status === 'passed' ? 'rgba(0, 255, 136, 0.1)' : 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '4px' }}>
                       <span className="text-mono text-micro text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{p.id}</span>
                       {p.status === 'passed' ? (
                         <span className="text-mono text-micro text-green">AC</span>
                       ) : (
                         <div style={{ display: 'flex', gap: '4px' }}>
                           <button onClick={() => updateCycleProblemStatus(new Date().toISOString().split('T')[0], p.id, 'passed')} style={{ background: 'none', border: 'none', color: '#00ff88', cursor: 'pointer' }}>✓</button>
                           <button onClick={() => updateCycleProblemStatus(new Date().toISOString().split('T')[0], p.id, 'failed')} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>✗</button>
                         </div>
                       )}
                     </div>
                   ))}
                </div>
             </div>
          ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', flexGrow: 1 }}>
                <button onClick={() => planToday('volume')} style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--accent-blue)', color: 'var(--text-primary)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} className="text-mono text-sm">SET VOLUME (10x -500 ELO)</button>
                <button onClick={() => planToday('intensity')} style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--accent-orange-muted)', color: 'var(--text-primary)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} className="text-mono text-sm">SET INTENSITY (2x +200 ELO)</button>
                <button onClick={() => planToday('deload')} style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', color: 'var(--text-primary)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} className="text-mono text-sm">SET DELOAD (Rest)</button>
             </div>
          )}
        </div>
      </div>

      {/* Heatmap — 2D / 3D toggle */}
      <div className="glass-panel-outer" style={{ gridColumn: 'span 3', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 className="text-micro text-muted" style={{ marginBottom: 6 }}>PROBLEM SOLVE HEATMAP (52 WEEKS) — COLORED BY HIGHEST RATED SOLVE</h2>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {[{l:'<1200',c:'#808080'},{l:'1400',c:'#00ff88'},{l:'1600',c:'#00e5cc'},{l:'1900',c:'#4488ff'},{l:'2100',c:'#cc44ff'},{l:'2400+',c:'#ff4444'}].map((b,i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: b.c, boxShadow: `0 0 5px ${b.c}77` }}></div>
                  <span className="text-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{b.l}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
            {['2d','3d'].map(mode => (
              <button key={mode} onClick={() => setHeatmapMode(mode)} style={{
                padding: '5px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: heatmapMode === mode ? 'rgba(94,207,255,0.18)' : 'transparent',
                color: heatmapMode === mode ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontWeight: heatmapMode === mode ? 700 : 500, fontSize: 11,
                transition: 'all 0.2s', transform: 'none'
              }}>{mode.toUpperCase()}</button>
            ))}
          </div>
        </div>

        {heatmapMode === '2d' ? (
          <>
            {/* Month Labels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(52, 1fr)', gap: '2px', marginBottom: '6px' }}>
              {(() => {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const labels = [];
                let prevM = -1;
                for (let i = 0; i < 52; i++) {
                  const dayIdx = i * 7;
                  if (dayIdx >= heatmap.length) break;
                  const d = new Date(heatmap[dayIdx].date);
                  const m = d.getMonth();
                  if (m !== prevM) {
                    labels.push({ name: months[m], col: i + 1 });
                    prevM = m;
                  }
                }
                return labels.map((l, idx) => (
                  <span key={idx} className="text-mono" style={{ 
                    gridColumnStart: l.col, 
                    fontSize: '9px', 
                    color: 'var(--text-muted)', 
                    opacity: 0.6,
                    whiteSpace: 'nowrap'
                  }}>
                    {l.name}
                  </span>
                ));
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(52, 1fr)', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gap: '2px' }}>
            {heatmap.map((day, i) => {
              const hBg = day.maxRating > 0 ? getCfColor(day.maxRating) : 'rgba(255,255,255,0.04)';
              const hOp = day.count > 0 ? Math.min(0.45 + day.count * 0.18, 1) : 0.18;
              return (
                <div key={i}
                  title={`${day.date}: ${day.count} solves | Max: ${day.maxRating || 'N/A'}`}
                  className="heatmap-cell"
                  style={{ background: hBg, opacity: hOp, boxShadow: day.count > 3 ? `0 0 6px ${hBg}99` : 'none' }}
                />
              );
            })}
          </div>
        </>
        ) : (
          <Heatmap3D heatmap={heatmap} />
        )}
      </div>

      {/* Monthly Tag Analytics */}
      <div className="glass-panel-outer" style={{ padding: '20px' }}>
        <h2 className="text-micro text-muted" style={{ marginBottom: '14px' }}>TAG ANALYTICS â€” {currentMonthName.toUpperCase()} {new Date().getFullYear()}</h2>
        <div className="quant-table-container" style={{ padding: '12px' }}>
          {monthlyTags.length > 0 ? monthlyTags.map(([tag, cnt], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span className="text-mono text-sm text-secondary" style={{ width: '140px' }}>{tag}</span>
              <div style={{ flexGrow: 1, height: '8px', background: 'var(--bg-glass-inner)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min((cnt / (monthlyTags[0]?.[1] || 1)) * 100, 100)}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '4px', opacity: 0.7 }}></div>
              </div>
              <span className="text-mono text-sm text-cyan" style={{ width: '30px', textAlign: 'right' }}>{cnt}</span>
            </div>
          )) : (
            <p className="text-mono text-sm text-muted" style={{ padding: '20px', textAlign: 'center' }}>Sync identity to load tags</p>
          )}
        </div>
      </div>

      {/* Tactical Gap Matrix */}
      <div className="glass-panel-outer" style={{ gridColumn: 'span 2', padding: '20px' }}>
        <h2 className="text-micro text-muted" style={{ marginBottom: '14px' }}>TACTICAL GAP MATRIX</h2>
        {(() => {
          const tags = ['dp', 'graphs', 'greedy', 'math', 'constructive', 'strings'];
          const diffs = ['1400', '1600', '1800', '2000', '2200'];
          return (
            <div className="quant-table-container" style={{ display: 'grid', gridTemplateColumns: `90px repeat(${diffs.length}, 1fr)`, overflow: 'auto' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px' }}></div>
              {diffs.map(d => <div key={d} className="text-mono text-micro text-center" style={{ padding: '8px', borderLeft: '1px solid var(--border-quant-harsh)', background: 'rgba(0,0,0,0.3)' }}>{d}</div>)}
              {tags.map(tag => (
                <div style={{ display: 'contents' }} key={tag}>
                  <div className="text-mono text-sm text-secondary" style={{ padding: '10px 8px', borderTop: '1px solid var(--border-quant-harsh)' }}>{tag}</div>
                  {diffs.map(diff => {
                    const myAc = Math.floor(Math.random() * 80) + 10;
                    const tgtAc = Math.floor(Math.random() * 40) + 50;
                    const bg = myAc < tgtAc - 20 ? 'rgba(255,69,58,0.1)' : myAc >= tgtAc ? 'rgba(48,209,88,0.1)' : 'transparent';
                    return (
                      <div key={diff} style={{ borderTop: '1px solid var(--border-quant-harsh)', borderLeft: '1px solid var(--border-quant-harsh)', background: bg, padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="text-mono text-micro text-primary">{myAc}%</span>
                        <span className="text-mono text-micro text-muted">tgt:{tgtAc}%</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── NEW: Run Rate Analytics & Yearly Graph ── */}
      <div className="glass-panel-outer" style={{ gridColumn: 'span 3', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="var(--accent-cyan)" /> Ascension Run Rate & Yearly Trajectory
            </h2>
            <p className="text-micro text-secondary" style={{ marginTop: '4px' }}>Projected solve volume based on current pacing.</p>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="text-micro text-muted">MONTH'S PACE</div>
              <div className="text-mono text-xl text-primary">{runRateData.monthCount} <span className="text-sm text-muted">→ {runRateData.monthExpected}</span></div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-micro text-muted">YEAR'S PACE</div>
              <div className="text-mono text-xl" style={{ color: 'var(--accent-cyan)' }}>{runRateData.yearCount} <span className="text-sm text-muted">→ {runRateData.yearExpected}</span></div>
            </div>
          </div>
        </div>

        {/* Dynamic Gradient Yearly Graph */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '16px', flexGrow: 1 }}>
          {runRateData.yearlyData && runRateData.yearlyData.length > 0 ? (
            (() => {
              const yd = runRateData.yearlyData;
              const yMax = Math.max(10, ...yd.map(d => d.cumulativeCount));
              const svgW = 1000, svgH = 200;
              const pX = 10, pY = 20;
              const plW = svgW - pX * 2, plH = svgH - pY * 2;
              const getX = i => pX + (i / (yd.length - 1)) * plW;
              const getY = c => svgH - pY - (c / yMax) * plH;
              
              const points = yd.map((d, i) => `${getX(i)},${getY(d.cumulativeCount)}`).join(' ');

              // Filter out 0-rating to avoid grey overwriting colored days
              let lastValidColor = '#555';

              return (
                <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: '160px', display: 'block', overflow: 'visible' }} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="yearlyGradient" x1="0" y1="0" x2="1" y2="0">
                      {yd.map((d, i) => {
                        if (d.maxRating > 0) {
                          lastValidColor = getCfColor(d.maxRating);
                        }
                        return <stop key={i} offset={`${(i / (yd.length - 1)) * 100}%`} stopColor={lastValidColor} />;
                      })}
                    </linearGradient>
                    <linearGradient id="yearlyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid lines */}
                  {[0, 0.5, 1].map(r => (
                    <line key={r} x1={pX} y1={svgH - pY - r * plH} x2={svgW - pX} y2={svgH - pY - r * plH} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  ))}
                  <text x={pX} y={pY - 5} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">{yMax}</text>
                  <text x={pX} y={svgH - 5} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">0</text>
                  <text x={svgW - pX} y={svgH - 5} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace" textAnchor="end">Dec 31</text>

                  {/* Fill area */}
                  <polygon points={`${pX},${svgH - pY} ${points} ${svgW - pX},${svgH - pY}`} fill="url(#yearlyFill)" />
                  
                  {/* The dynamic gradient line */}
                  <polyline points={points} fill="none" stroke="url(#yearlyGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  
                  {/* Glowing end dot */}
                  <circle cx={getX(yd.length - 1)} cy={getY(yd[yd.length - 1].cumulativeCount)} r="5" fill="var(--accent-cyan)" style={{ filter: 'drop-shadow(0 0 6px var(--accent-cyan))' }} />
                </svg>
              );
            })()
          ) : (
             <div className="text-mono text-muted text-center" style={{ padding: '60px' }}>No yearly data available.</div>
          )}
        </div>
      </div>
    </div>
    );
  };

  const renderGraveyard = () => {
    const isTilt = isTiltActive();
    return (
      <div className="glass-panel-outer" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
        <h2 className="text-lg text-primary" style={{ marginBottom: '16px', letterSpacing: '-0.02em' }}>
          🪦 The Graveyard <span className="text-muted">— Ebbinghaus Spaced Repetition Engine</span>
        </h2>
        {isTilt && (
          <div style={{ background: 'rgba(255, 68, 68, 0.15)', border: '1px solid #ff4444', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="text-mono text-sm text-primary" style={{ color: '#ff4444' }}>TILT LOCKOUT ENGAGED</div>
              <div className="text-micro text-secondary">3+ WAs within 5 minutes. Take a breath. Codeforces submissions paused.</div>
            </div>
            <div className="text-mono text-lg text-primary">{Math.floor(tiltRemaining / 60)}:{(tiltRemaining % 60).toString().padStart(2, '0')}</div>
          </div>
        )}
        
        {srActiveId ? (
          <div className="glass-panel-outer" style={{ flexGrow: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 className="text-lg text-cyan">{srActiveId}</h3>
               <div className="text-mono text-sm text-primary">Timer: {Math.floor(srTimer / 60)}:{(srTimer % 60).toString().padStart(2, '0')}</div>
             </div>
             
             {!pfDone ? (
               <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="text-micro text-muted">PRE-FLIGHT GATE — REQUIRED BEFORE CODING</div>
                  <input className="text-mono text-sm" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', padding: '12px', color: 'var(--text-primary)' }} placeholder="Target Time Complexity (e.g. O(N log N))" value={pfTC} onChange={e => setPfTC(e.target.value)} />
                  <input className="text-mono text-sm" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', padding: '12px', color: 'var(--text-primary)' }} placeholder="Space Complexity (e.g. O(N))" value={pfSpace} onChange={e => setPfSpace(e.target.value)} />
                  <input className="text-mono text-sm" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', padding: '12px', color: 'var(--text-primary)' }} placeholder="3 Edge Cases to handle..." value={pfEdgeCases} onChange={e => setPfEdgeCases(e.target.value)} />
                  <textarea className="text-mono text-sm" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', padding: '12px', color: 'var(--text-primary)', height: '100px', resize: 'none' }} placeholder="Approach summary..." value={pfApproach} onChange={e => setPfApproach(e.target.value)} />
                  <button onClick={submitPreFlight} style={{ padding: '12px', background: 'var(--accent-cyan)', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>SUBMIT PRE-FLIGHT</button>
               </div>
             ) : (
               <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                 <div className="text-mono text-sm text-green">Pre-Flight Approved. Workspace unlocked.</div>
                 <div style={{ display: 'flex', gap: '16px', marginTop: 'auto' }}>
                    <button onClick={() => submitSRReview('pass')} style={{ flex: 1, padding: '16px', background: 'rgba(0, 255, 136, 0.2)', border: '1px solid #00ff88', color: '#00ff88', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>PASSED (Advance Stage)</button>
                    <button onClick={() => submitSRReview('fail')} style={{ flex: 1, padding: '16px', background: 'rgba(255, 68, 68, 0.2)', border: '1px solid #ff4444', color: '#ff4444', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>FAILED (Reset to Stage 1)</button>
                 </div>
               </div>
             )}
          </div>
        ) : (
          <>
            <div className="text-micro text-secondary" style={{ marginBottom: '8px' }}>TODAY'S QUEUE ({srQueue.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '40%' }}>
              {srQueue.map(p => (
                <div key={p.id} className="glass-panel-outer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => openSRProblem(p.id)}>
                  <div>
                    <div className="text-mono text-sm text-primary">{p.id} - {p.name} <span style={{ color: getCfColor(p.rating), marginLeft: '8px' }}>[{p.rating}]</span></div>
                    <div className="text-micro text-muted">Stage: {p.reviewStage}/5 | Fails: {p.failedCount}</div>
                  </div>
                  <div className="text-mono text-micro text-cyan">REVIEW NOW ▶</div>
                </div>
              ))}
              {srQueue.length === 0 && <div className="text-mono text-sm text-muted" style={{ padding: '20px' }}>No reviews due today.</div>}
            </div>

            <div className="text-micro text-secondary" style={{ marginTop: '24px', marginBottom: '8px' }}>ALL TRACKED SINS ({srAll.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
               {srAll.map(p => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: '1px solid var(--border-quant-harsh)' }} className="text-mono text-sm text-secondary">
                  <span className="text-primary">{p.id}</span>
                  <span>Stage {p.reviewStage}</span>
                  <span style={{ color: p.failedCount > 0 ? '#ff4444' : 'inherit' }}>Fails: {p.failedCount}</span>
                  <span>Next: {new Date(p.nextReviewAt).toLocaleDateString()}</span>
                </div>
               ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderCrucible = () => {
    return (
      <div className="glass-panel-outer" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
         <h2 className="text-lg text-primary" style={{ marginBottom: '16px', letterSpacing: '-0.02em' }}>
           🧠 The Crucible <span className="text-muted">— Socratic LLM Coach (Nvidia NIM)</span>
         </h2>
         <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <input className="text-mono text-sm" type="password" placeholder="Nvidia API Key (nvapi-...)" value={coachNvidiaKey} onChange={e => { setCoachNvidiaKey(e.target.value); localStorage.setItem('ag_nvidia_key', e.target.value); }} style={{ flex: 1, padding: '12px', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', color: 'var(--text-primary)' }} />
            <input className="text-mono text-sm" placeholder="Problem ID (e.g. 1920B)" value={coachProblemId} onChange={e => setCoachProblemId(e.target.value)} style={{ width: '150px', padding: '12px', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', color: 'var(--text-primary)' }} />
         </div>
         
         <div style={{ display: 'flex', gap: '20px', flexGrow: 1, overflow: 'hidden' }}>
            {/* Left side: Code & Approach */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
               <textarea className="text-mono text-sm" placeholder="Paste your current code here..." value={coachCode} onChange={e => setCoachCode(e.target.value)} style={{ flex: 2, background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', padding: '12px', color: 'var(--accent-green-muted)', resize: 'none' }} />
               <textarea className="text-mono text-sm" placeholder="Explain your approach (what is failing?)..." value={pfApproach} onChange={e => setPfApproach(e.target.value)} style={{ flex: 1, background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', padding: '12px', color: 'var(--text-primary)', resize: 'none' }} />
               <button onClick={getCoachHint} disabled={coachLoading} style={{ padding: '16px', background: 'var(--accent-cyan)', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: coachLoading ? 'wait' : 'pointer' }}>
                 {coachLoading ? 'ANALYZING...' : `REQUEST HINT LEVEL ${coachHintLevel}/3`}
               </button>
            </div>
            
            {/* Right side: Transcripts & Weakness Profile */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
               <div className="glass-panel-outer" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="text-micro text-secondary">SOCRATIC TERMINAL</div>
                    <button onClick={loadWeaknessProfile} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer' }} className="text-mono text-micro">ANALYZE WEAKNESSES</button>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {coachHints.map((h, i) => (
                       <div key={i} style={{ borderLeft: `2px solid ${h.level === 3 ? '#ff4444' : '#00ff88'}`, paddingLeft: '12px' }}>
                         <div className="text-mono text-micro text-muted" style={{ marginBottom: '4px' }}>HINT LEVEL {h.level} [{h.time}]</div>
                         <div className="text-sm text-primary" style={{ lineHeight: 1.5 }}>{h.text}</div>
                       </div>
                     ))}
                     {coachHints.length === 0 && <div className="text-mono text-sm text-muted">No hints requested yet. Provide your code and ask the coach.</div>}
                  </div>
               </div>

               {coachWeakness && (
                 <div className="glass-panel-outer" style={{ padding: '16px' }}>
                    <div className="text-micro text-secondary" style={{ marginBottom: '12px' }}>WEAKNESS PRESCRIPTION ({coachWeakness.totalSessions} sessions)</div>
                    {coachWeakness.profile.slice(0, 5).map(w => (
                      <div key={w.tag} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-quant-harsh)' }} className="text-mono text-sm text-primary">
                        <span>{w.tag}</span>
                        <span style={{ color: w.hintRate > 0.5 ? '#ff4444' : 'inherit' }}>Hint Rate: {Math.round(w.hintRate * 100)}%</span>
                      </div>
                    ))}
                 </div>
               )}
            </div>
         </div>
      </div>
    );
  };


  const renderGoldenPath = () => {
    // Generate 20 mock problems to ensure high data density
    const mockProblems = Array.from({ length: 20 }, (_, i) => {
      const id = `${1900 - i}${['A', 'B', 'C', 'D', 'E', 'F'][i % 6]}`;
      const name = ['Scuza', 'Copil Copac Draws Trees', 'LuoTianyi and the Show', 'Forever Winter', 'The Human Equation', 'Counting Rhyme'][i % 6];
      const rating = 1600 + (i % 5) * 100;
      const overlap = 95 - i * 2; // Decreasing overlap
      const attempts = (1.1 + (i % 4) * 0.4).toFixed(1);
      const isTrap = overlap > 70 && attempts >= 1.8;
      return { id: `${id} - ${name}`, rating, overlap, attempts, isTrap };
    });

    return (
      <div className="glass-panel-outer" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
        {/* Header & Filters */}
        <div style={{ marginBottom: '16px' }}>
          <h2 className="text-lg text-primary" style={{ marginBottom: '12px', letterSpacing: '-0.02em' }}>
            The Golden Path: <span className="text-muted">Ascension Cohort Intersection</span>
          </h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            {['Target Cohort: Newly Promoted Masters (2100+)', 'Timeframe: 6 Months Pre-Promotion', 'Problem Tags: All'].map(filter => (
              <div key={filter} className="text-sm text-secondary" style={{ 
                padding: '6px 12px', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                borderRadius: 'var(--radius-inner)',
                backdropFilter: 'blur(10px)',
                cursor: 'pointer'
              }}>
                {filter} <span style={{ fontSize: '10px', marginLeft: '4px' }}>â–¼</span>
              </div>
            ))}
          </div>
        </div>

        {/* High-Density Intersection Data Table */}
        <div style={{ 
          flexGrow: 1, 
          background: 'rgba(10, 10, 12, 0.4)', 
          borderRadius: 'var(--radius-inner)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Table Header */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '2fr 80px 2fr 100px 40px', 
            padding: '8px 16px', 
            background: 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid rgba(255,255,255,0.08)'
          }} className="text-micro text-secondary">
            <span>PROBLEM ID / NAME</span>
            <span>RATING</span>
            <span>COHORT OVERLAP</span>
            <span>AVG ATTEMPTS</span>
            <span></span>
          </div>
          
          {/* Table Body (Scrollable) */}
          <div style={{ overflowY: 'auto', flexGrow: 1 }}>
            {mockProblems.map((prob, idx) => (
              <div key={idx} style={{ 
                display: 'grid', 
                gridTemplateColumns: '2fr 80px 2fr 100px 40px', 
                padding: '4px 16px', // Extremely tight padding for density
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                alignItems: 'center'
              }} className="text-mono text-sm">
                
                <span className="text-primary" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '12px' }}>
                  {prob.id}
                </span>
                
                <span className="text-cyan">{prob.rating}</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px' }}>
                  <span style={{ width: '32px', textAlign: 'right' }}>{prob.overlap}%</span>
                  <div style={{ flexGrow: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                    <div style={{ width: `${prob.overlap}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '2px' }}></div>
                  </div>
                </div>
                
                <span style={{ color: prob.attempts >= 1.8 ? 'var(--accent-orange-muted)' : 'var(--text-secondary)' }}>
                  {prob.attempts}
                </span>
                
                {/* Trapdoor Indicator */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {prob.isTrap && (
                    <div title="Trapdoor: High Overlap, High Friction" style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      background: 'var(--accent-orange-muted)',
                      boxShadow: '0 0 8px var(--accent-orange-muted)'
                    }}></div>
                  )}
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderCodeExplorer = () => {
    // Grandmaster Global Analytics Data (Fallback to static if not dynamically loaded yet)
    const stats = gmCoachData ? gmCoachData.gmStats : {
      analyzedGms: ['tourist', 'jiangly', 'Benq', 'Radewoosh', 'Petr'],
      avgSolved: 6245,
      maxSolved: 12840,
      avgDifficulty: 2540,
      avgAttempts: 1.42,
      avgTime2400: '18m 45s',
      cadence: '3.2 ACs / day',
      tags: [
        { name: 'dp', value: 18 },
        { name: 'math', value: 14 },
        { name: 'data structures', value: 12 },
        { name: 'graphs', value: 11 }
      ]
    };

    const handleSearch = async () => {
      setIsSearching(true);
      setSolutions([]); // clear current
      
      try {
        // Parse "1920B" -> 1920, B
        const match = searchQuery.match(/^(\d+)([A-Z]\d*)$/i);
        if (!match) {
           alert("Invalid Problem ID format. Use e.g. 1920B");
           setIsSearching(false);
           return;
        }
        const contestId = match[1];
        const index = match[2].toUpperCase();

        // Fetch real data from Codeforces API
        const res = await fetch(`https://codeforces.com/api/contest.status?contestId=${contestId}&from=1&count=2000`);
        const data = await res.json();
        
        if (data.status === "OK") {
            // Filter for OK, C++, and specific problem index
            const valid = data.result.filter(s => 
                s.verdict === "OK" && 
                s.problem.index === index && 
                s.programmingLanguage.includes("C++")
            );
            
            // Extract unique handles up to 100 to avoid massive URL
            const uniqueHandles = new Set();
            const handleToSub = new Map(); // handle -> submission data
            
            for (let s of valid) {
                const handle = s.author.members[0].handle;
                if (!uniqueHandles.has(handle)) {
                    uniqueHandles.add(handle);
                    handleToSub.set(handle, {
                        lang: s.programmingLanguage,
                        time: s.timeConsumedMillis + "ms",
                        mem: Math.round(s.memoryConsumedBytes / 1024) + "KB",
                        subId: s.id,
                        contestId: contestId
                    });
                }
                if (uniqueHandles.size >= 100) break;
            }

            if (uniqueHandles.size === 0) {
                setIsSearching(false);
                return;
            }

            // Fetch actual ranks for these users
            const handlesStr = Array.from(uniqueHandles).join(';');
            const infoRes = await fetch(`https://codeforces.com/api/user.info?handles=${handlesStr}`);
            const infoData = await infoRes.json();
            
            const realSolutions = [];
            if (infoData.status === "OK") {
                for (let user of infoData.result) {
                    const subInfo = handleToSub.get(user.handle);
                    if (subInfo) {
                        realSolutions.push({
                            handle: user.handle,
                            rank: user.rank || "unrated",
                            lang: subInfo.lang,
                            time: subInfo.time,
                            mem: subInfo.mem,
                            subId: subInfo.subId,
                            contestId: subInfo.contestId
                        });
                    }
                }
            }
            setSolutions(realSolutions);
        } else {
            alert("Codeforces API Error: " + data.comment);
        }
      } catch(e) {
          console.error(e);
          alert("Network error fetching from Codeforces.");
      }
      setIsSearching(false);
    };

    const openCode = async (handle, contestId, subId) => {
      const targetUrl = `https://codeforces.com/contest/${contestId}/submission/${subId}`;
      setCodeModal({ isOpen: true, handle, code: "Scraping raw source code via local proxy...", url: targetUrl });
      
      try {
         // Use our local Node.js proxy to bypass Cloudflare
         const proxyUrl = `http://localhost:3001/?url=${encodeURIComponent(targetUrl)}`;
         const res = await fetch(proxyUrl);
         
         const html = await res.text();
         const match = html.match(/<pre id="program-source-text"[^>]*>([\s\S]*?)<\/pre>/);
         
         if (match && match[1]) {
             let rawCode = match[1]
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"');
             setCodeModal({ isOpen: true, handle, code: rawCode, url: targetUrl });
         } else {
             setCodeModal({ 
                 isOpen: true, 
                 handle, 
                 code: "ERROR: Cloudflare Anti-Bot Protection blocked the scraper.\n\nCodeforces detected the proxy request and dropped the connection.\n\nPlease view the source code directly via the official link below.",
                 url: targetUrl 
             });
         }
      } catch(e) {
         setCodeModal({ 
             isOpen: true, 
             handle, 
             code: "ERROR: Local Proxy connection failed. Is the Node server running on port 3001?",
             url: targetUrl 
         });
      }
    };

    // Filter logic
    const displayedSolutions = solutions.filter(sol => {
       if (rankFilter === 'All Ranks') return true;
       if (rankFilter === 'Grandmaster+') return sol.rank && sol.rank.includes('grandmaster');
       if (rankFilter === 'Master+') return sol.rank && (sol.rank.includes('master') || sol.rank.includes('grandmaster'));
       if (rankFilter === 'Candidate Master+') return sol.rank && (sol.rank.includes('master') || sol.rank.includes('candidate'));
       if (rankFilter === 'Expert+') return sol.rank && (sol.rank.includes('expert') || sol.rank.includes('master') || sol.rank.includes('candidate'));
       return true;
    }).slice(0, 50); // limit to top 50 in UI

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '4px', gap: '16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 0 8px' }}>
          <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', margin: 0 }}>
            Grandmaster <span className="text-muted">Analytics & Code Explorer</span>
          </h2>
          <button 
            onClick={handleLoadDynamicCoach} 
            disabled={gmCoachLoading}
            style={{ 
              background: gmCoachLoading ? 'var(--bg-glass-inner)' : 'var(--accent-cyan)', 
              color: gmCoachLoading ? 'var(--text-muted)' : '#000', 
              border: '1px solid var(--accent-cyan)', 
              borderRadius: '8px', padding: '6px 14px', cursor: gmCoachLoading ? 'default' : 'pointer', fontWeight: 'bold' 
            }} 
            className="text-mono text-micro"
          >
            {gmCoachLoading ? '⏳ ANALYZING GMs...' : '⚡ DYNAMIC GM ANALYSIS'}
          </button>
        </div>

        {gmCoachStatus && gmCoachLoading && (
           <div className="text-mono text-sm text-cyan text-center" style={{ margin: '10px 0' }}>{gmCoachStatus}</div>
        )}
        
        {/* Deep Analytics Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', flexShrink: 0 }}>
          
          {/* Global GM Averages */}
          <div className="glass-panel-outer" style={{ padding: '20px' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>DYNAMIC GM AGGREGATES ({stats.analyzedGms?.length || 5} ELITES)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                <span className="text-micro text-secondary">AVERAGE SOLVED</span>
                <span className="text-mono text-lg text-cyan">{stats.avgSolved}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                <span className="text-micro text-secondary">MAX SOLVED (RECORD)</span>
                <span className="text-mono text-lg text-primary">{stats.maxSolved}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                <span className="text-micro text-secondary">AVG DIFFICULTY</span>
                <span className="text-mono text-lg text-red-muted">{stats.avgDifficulty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span className="text-micro text-secondary">WA/AC RATIO</span>
                <span className="text-mono text-lg text-orange-muted">{stats.avgAttempts}</span>
              </div>
            </div>
            {gmCoachData && (
               <div className="text-mono text-micro text-secondary" style={{ marginTop: '12px', textAlign: 'right' }}>
                 Sampled: {stats.analyzedGms.join(', ')}
               </div>
            )}
          </div>

          {/* Coach Analysis / Insights */}
          <div className="glass-panel-outer" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>COACH'S TACTICAL INSIGHTS</h3>
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center' }}>
              <p className="text-mono text-sm" style={{ color: 'var(--text-primary)', lineHeight: '1.5' }}>
                "To reach Grandmaster, volume alone is insufficient. Elite GMs currently average <span className="text-cyan">{stats.cadence}</span>, but their average problem difficulty is <span style={{ color: 'var(--accent-red-muted)' }}>{stats.avgDifficulty}</span>."
              </p>
              <div style={{ background: 'rgba(255,69,58,0.05)', borderLeft: '2px solid var(--accent-red-muted)', padding: '10px 14px' }}>
                <p className="text-mono text-micro text-secondary">
                  <strong>CRITICAL GAP:</strong> {gmCoachData?.userProfile 
                    ? `Your current rating is ${gmCoachData.userProfile.rating}. You are targeting ${rankMeta.targetRating || 1900}, but you must condition yourself to solve ${stats.avgDifficulty}s to reach GM.` 
                    : `You are currently solving problems ~${Math.max(0, stats.avgDifficulty - (rankMeta.targetRating || 1900))} points below the dynamic GM training threshold.`}
                </p>
              </div>
              <p className="text-mono text-micro text-muted">
                GMs average {stats.avgTime2400} to implement a 2400-rated problem. 
                Speed is gained through deep pattern recognition in <span className="text-primary">{stats.tags[0]?.name?.toUpperCase() || 'DP'}</span> and <span className="text-primary">{stats.tags[1]?.name?.toUpperCase() || 'MATH'}</span>.
              </p>
            </div>
          </div>

          {/* Tag Archetype */}
          <div className="glass-panel-outer" style={{ padding: '20px' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>DYNAMIC GM TAG ARCHETYPE</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {stats.tags.map((tag, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span className="text-mono text-micro text-secondary text-uppercase">{tag.name}</span>
                    <span className="text-mono text-micro text-cyan">{tag.value}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-glass-inner)', borderRadius: '2px' }}>
                    <div style={{ width: `${tag.value * 4}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '2px' }}></div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
                <span className="text-micro text-muted">A GMs tag distribution is heavily skewed towards dynamic programming and combinatorics compared to lower ranks.</span>
              </div>
            </div>
          </div>

        </div>

        {/* Code Explorer Tool */}
        <div className="glass-panel-outer" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
          <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>GM SOLUTION SEARCH ENGINE</h3>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Problem ID (e.g., 1920B)" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: 'var(--radius-inner)',
              padding: '12px 16px', color: 'var(--text-primary)', outline: 'none', width: '240px'
            }} 
            className="text-mono" 
          />
          
          <select 
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            style={{
              background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: 'var(--radius-inner)',
              padding: '12px 16px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', appearance: 'none'
            }}
            className="text-mono text-sm"
          >
            <option value="All Ranks">All Ranks</option>
            <option value="Grandmaster+">Grandmaster+</option>
            <option value="Master+">Master+</option>
            <option value="Candidate Master+">Candidate Master+</option>
            <option value="Expert+">Expert+</option>
          </select>

          <button 
            onClick={handleSearch}
            style={{
              background: isSearching ? 'var(--bg-glass-inner)' : 'var(--accent-cyan)', 
              color: isSearching ? 'var(--text-muted)' : '#000', 
              border: '1px solid var(--accent-cyan)', 
              borderRadius: 'var(--radius-inner)', padding: '0 24px',
              cursor: isSearching ? 'default' : 'pointer', fontWeight: 'bold', transition: 'all 0.2s'
            }}>
            {isSearching ? 'SEARCHING CF...' : 'SEARCH CODEFORCES'}
          </button>
        </div>

        <div className="quant-table-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 200px 1fr 100px 100px', padding: '12px 16px', background: 'var(--bg-glass-inner)', borderBottom: '1px solid var(--border-quant-harsh)', borderRadius: '8px 8px 0 0' }} className="text-micro text-secondary">
            <span>HANDLE</span><span>RANK</span><span>LANGUAGE</span><span>TIME</span><span>MEM</span>
          </div>
          <div style={{ overflowY: 'auto', flexGrow: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '0 0 8px 8px', border: '1px solid rgba(255,255,255,0.03)', borderTop: 'none' }}>
            {isSearching ? (
               <div className="text-mono text-sm text-muted text-center" style={{ padding: '40px' }}>Querying Codeforces API live...</div>
            ) : displayedSolutions.map((sol, idx) => (
              <div key={idx} onClick={() => openCode(sol.handle, sol.contestId, sol.subId)} style={{ 
                display: 'grid', gridTemplateColumns: '150px 200px 1fr 100px 100px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer'
              }} className="text-mono text-sm hover-bg">
                <span className="text-primary">{sol.handle}</span>
                <span style={{ 
                    color: sol.rank.includes('grandmaster') ? 'var(--accent-red-muted)' : 
                           sol.rank.includes('master') ? 'var(--accent-orange-muted)' : 
                           sol.rank.includes('expert') ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    textTransform: 'capitalize'
                }}>{sol.rank}</span>
                <span className="text-muted">{sol.lang}</span>
                <span className="text-cyan">{sol.time}</span>
                <span className="text-muted">{sol.mem}</span>
              </div>
            ))}
            {!isSearching && displayedSolutions.length === 0 && (
               <div className="text-mono text-sm text-muted text-center" style={{ padding: '60px' }}>
                 Enter a Codeforces Problem ID (e.g., 1920B) to search for top GM solutions.
               </div>
            )}
          </div>
          </div>
        </div>
      </div>
    );
  };



  const exportTearSheet = () => {
    const tearSheet = `<!DOCTYPE html><html><head><title>CP Performance Tear Sheet</title>
<style>body{font-family:'SF Mono',monospace;background:#0a0a0c;color:#e0e0e0;padding:40px;max-width:800px;margin:0 auto}
h1{color:#00d4aa;border-bottom:1px solid #333;padding-bottom:16px}h2{color:#888;font-size:14px;margin-top:32px}
.metric{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1a1a1a}
.val{color:#00d4aa;font-weight:bold}.warn{color:#ff6b6b}</style></head><body>
<h1>â—† Competitive Programming Performance Tear Sheet</h1>
<p style="color:#666">Generated ${new Date().toISOString().split('T')[0]} | Handle: ${cfHandle}</p>
<h2>EXECUTION METRICS</h2>
<div class="metric"><span>Inter-Submission Cadence</span><span class="val">14.2 min avg</span></div>
<div class="metric"><span>GM Baseline Cadence</span><span class="val">22.8 min avg</span></div>
<div class="metric"><span>Session Depth Score</span><span class="warn">Volume-Priority (Below GM Baseline)</span></div>
<h2>STRUCTURAL COMPLEXITY</h2>
<div class="metric"><span>Template Maturity Index</span><span class="val">Level 3 / 5</span></div>
<div class="metric"><span>Custom Structures Deployed</span><span class="val">ModularInt, DSU, SegTree</span></div>
<div class="metric"><span>Missing GM Tooling</span><span class="warn">LazySegTree, LiChaoTree, CentroidDecomp</span></div>
<h2>ENDURANCE PROFILE</h2>
<div class="metric"><span>Avg Time-to-Solve (1900+)</span><span class="val">28 min</span></div>
<div class="metric"><span>GM Baseline (1900+)</span><span class="val">45 min</span></div>
<div class="metric"><span>Editorial Dependency Rate</span><span class="warn">62% (GM Baseline: 15%)</span></div>
<h2>COMPILE LATENCY</h2>
<div class="metric"><span>Avg Local Compile</span><span class="val">1.2s</span></div>
<div class="metric"><span>P99 Compile</span><span class="val">3.8s</span></div>
</body></html>`;
    const blob = new Blob([tearSheet], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cp_tearsheet_${cfHandle}_${Date.now()}.html`;
    a.click();
  };

  // â”€â”€ Foundry Intelligence State â”€â”€
  const [foundryTarget, setFoundryTarget] = useState('grandmaster');
  const [foundryData, setFoundryData] = useState(null);
  const [foundryStatus, setFoundryStatus] = useState('');
  const [foundryLoading, setFoundryLoading] = useState(false);
  const [goals, setGoals] = useState(() => loadGoals());
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ targetRating: 2400, dailyQuota: 3, sprintDays: 50, focusTags: '' });

  const RANK_META = {
    'grandmaster': { label: 'Grandmaster', color: '#ff0000', short: 'GM' },
    'international master': { label: 'Int. Master', color: '#ff8c00', short: 'IM' },
    'master': { label: 'Master', color: '#ffd700', short: 'M' },
    'candidate master': { label: 'Candidate Master', color: '#aa00aa', short: 'CM' },
  };
  const rankMeta = RANK_META[foundryTarget] || RANK_META['grandmaster'];

  const runFoundrySync = async () => {
    setFoundryLoading(true);
    setFoundryData(null);
    try {
      const result = await runFullAnalysis(cfHandle, foundryTarget, msg => setFoundryStatus(msg));
      setFoundryData(result);
      setFoundryStatus('');
    } catch (e) {
      setFoundryStatus('Error: ' + e.message);
    }
    setFoundryLoading(false);
  };

  const handleSaveGoals = () => {
    const g = {
      targetRating: parseInt(goalDraft.targetRating) || 2400,
      dailyQuota: parseInt(goalDraft.dailyQuota) || 3,
      sprintDays: parseInt(goalDraft.sprintDays) || 50,
      focusTags: goalDraft.focusTags.split(',').map(t => t.trim()).filter(Boolean),
      sprintStart: goals.sprintStart || Math.floor(Date.now() / 1000),
    };
    saveGoals(g);
    setGoals(g);
    setGoalEditing(false);
  };

  const renderPalantirHub = () => {
    const fd = foundryData;
    const u = fd?.user;
    const co = fd?.cohort;
    const gaps = fd?.gaps;
    const recs = fd?.recommendations || [];
    const daily = fd?.dailyPlan || [];
    const rising = fd?.rising || [];
    const sprintDay = fd?.sprintDay || 1;

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'auto', padding: '4px' }}>
        {/* Header Bar */}
        <div className="glass-panel-outer" style={{ padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', margin: 0 }}>â—† Foundry <span className="text-muted">Intelligence Hub</span></h2>
            <p className="text-micro text-secondary" style={{ marginTop: '4px' }}>
              {u ? `${u.handle} (${u.rating}) vs ${co?.size || 0} recently promoted ${rankMeta.label}s` : `Analyzing ${cfHandle} against live ${rankMeta.label} cohort`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={runFoundrySync} disabled={foundryLoading} style={{ background: foundryLoading ? 'var(--bg-glass-inner)' : 'var(--accent-cyan)', color: foundryLoading ? 'var(--text-muted)' : '#000', border: '1px solid var(--accent-cyan)', borderRadius: '8px', padding: '8px 18px', cursor: foundryLoading ? 'default' : 'pointer', fontWeight: 'bold' }} className="text-mono text-sm">
              {foundryLoading ? 'â³ SYNCING...' : 'âŸ³ SYNC LIVE'}
            </button>
            <button onClick={() => setGoalEditing(!goalEditing)} style={{ background: 'none', border: `1px solid ${rankMeta.color}`, color: rankMeta.color, borderRadius: '8px', padding: '8px 18px', cursor: 'pointer' }} className="text-mono text-sm">âš™ GOALS</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: fd ? '#30d158' : '#ff6b6b', boxShadow: `0 0 8px ${fd ? '#30d158' : '#ff6b6b'}`, animation: 'pulse 2s infinite' }}></div>
              <span className="text-micro text-secondary">{fd ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>

        {/* Rank Toggle */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {Object.entries(RANK_META).map(([key, meta]) => (
            <button key={key} onClick={() => setFoundryTarget(key)} style={{ padding: '7px 18px', borderRadius: '8px', border: `1px solid ${foundryTarget === key ? meta.color : 'rgba(255,255,255,0.08)'}`, background: foundryTarget === key ? `${meta.color}22` : 'none', color: foundryTarget === key ? meta.color : 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', transition: 'all 0.2s' }}>{meta.short}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {goals.sprintStart && <span className="text-mono text-micro" style={{ color: 'var(--accent-cyan)' }}>SPRINT DAY {sprintDay}/{goals.sprintDays || 50}</span>}
            <span className="text-mono text-micro" style={{ color: rankMeta.color }}>TARGET: {rankMeta.label.toUpperCase()}</span>
          </div>
        </div>

        {/* Goal Editor */}
        {goalEditing && (
          <div className="glass-panel-outer" style={{ padding: '16px', flexShrink: 0 }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '12px' }}>SET GOALS & SPRINT</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label className="text-micro text-secondary">Target Rating</label>
                <input type="number" value={goalDraft.targetRating} onChange={e => setGoalDraft(p => ({ ...p, targetRating: e.target.value }))} style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
              <div>
                <label className="text-micro text-secondary">Daily Quota</label>
                <input type="number" value={goalDraft.dailyQuota} onChange={e => setGoalDraft(p => ({ ...p, dailyQuota: e.target.value }))} style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
              <div>
                <label className="text-micro text-secondary">Sprint Days</label>
                <input type="number" value={goalDraft.sprintDays} onChange={e => setGoalDraft(p => ({ ...p, sprintDays: e.target.value }))} style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
              <div>
                <label className="text-micro text-secondary">Focus Tags (comma-sep)</label>
                <input value={goalDraft.focusTags} onChange={e => setGoalDraft(p => ({ ...p, focusTags: e.target.value }))} placeholder="dp, math, graphs" style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSaveGoals} style={{ background: 'var(--accent-cyan)', color: '#000', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold' }} className="text-mono text-sm">SAVE & START SPRINT</button>
              <button onClick={() => { const g = { ...goals, sprintStart: Math.floor(Date.now() / 1000) }; saveGoals(g); setGoals(g); }} style={{ background: 'none', border: '1px solid var(--accent-orange-muted)', color: 'var(--accent-orange-muted)', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer' }} className="text-mono text-sm">RESET SPRINT</button>
            </div>
          </div>
        )}

        {/* Loading / Status */}
        {foundryLoading && (
          <div className="glass-panel-outer" style={{ padding: '40px', textAlign: 'center', flexShrink: 0 }}>
            <div className="text-mono text-primary" style={{ marginBottom: '8px' }}>â³ {foundryStatus}</div>
            <div style={{ width: '200px', height: '3px', background: 'var(--bg-glass-inner)', borderRadius: '2px', margin: '0 auto', overflow: 'hidden' }}>
              <div style={{ width: '60%', height: '100%', background: rankMeta.color, animation: 'pulse 1.5s infinite' }}></div>
            </div>
          </div>
        )}

        {/* No data yet */}
        {!fd && !foundryLoading && (
          <div className="glass-panel-outer" style={{ padding: '60px', textAlign: 'center' }}>
            <p className="text-mono text-muted">Click <span style={{ color: 'var(--accent-cyan)' }}>SYNC LIVE</span> to analyze <span className="text-primary">{cfHandle}</span> against real, recently-promoted {rankMeta.label}s from Codeforces.</p>
            <p className="text-micro text-secondary" style={{ marginTop: '8px' }}>This fetches live data from the CF API â€” no hardcoded numbers.</p>
          </div>
        )}

        {/* â”€â”€ LIVE DATA MODULES â”€â”€ */}
        {fd && !foundryLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flexGrow: 1 }}>

            {/* A: Your Profile vs Cohort Average */}
            <div className="glass-panel-outer" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 className="text-micro text-muted">YOU vs {rankMeta.short} COHORT ({co?.size || 0} users)</h3>
                <span className="text-mono text-micro" style={{ color: rankMeta.color }}>{u?.rating} â†’ {goals.targetRating || '?'}</span>
              </div>
              <div className="quant-table-container" style={{ padding: '10px' }}>
                {[
                  { label: 'TOTAL SOLVED', you: u?.totalSolved, them: co?.avgSolved },
                  { label: 'AVG DIFFICULTY', you: u?.avgDifficulty, them: co?.avgDifficulty },
                  { label: 'CURRENT RATING', you: u?.rating, them: co?.avgRating },
                  { label: 'VOLUME GAP', you: null, them: null, custom: <span style={{ color: gaps?.volumeGap > 50 ? 'var(--accent-red-muted)' : 'var(--accent-green-muted)' }}>{gaps?.volumeGap || 0} problems behind</span> },
                  { label: 'DIFFICULTY GAP', you: null, them: null, custom: <span style={{ color: (gaps?.difficultyGap || 0) > 100 ? 'var(--accent-red-muted)' : 'var(--accent-green-muted)' }}>{gaps?.difficultyGap > 0 ? `+${gaps.difficultyGap}` : gaps?.difficultyGap || 0} rating pts</span> },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }} className="text-mono text-sm">
                    <span className="text-secondary">{r.label}</span>
                    {r.custom || <span><span style={{ color: r.you < r.them ? 'var(--accent-orange-muted)' : 'var(--accent-cyan)' }}>{r.you}</span> <span className="text-micro text-secondary">vs {r.them}</span></span>}
                  </div>
                ))}
              </div>
            </div>

            {/* B: Rising Stars Feed */}
            <div className="glass-panel-outer" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 className="text-micro text-muted">RECENTLY PROMOTED {rankMeta.short}s</h3>
                <span className="text-mono text-micro text-cyan">LIVE FEED</span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                {rising.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', alignItems: 'center' }} className="text-mono text-sm">
                    <span style={{ color: rankMeta.color, fontWeight: 600 }}>{r.handle}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="text-secondary">{r.oldRating}â†’</span>
                      <span style={{ color: rankMeta.color }}>{r.newRating}</span>
                      <span style={{ color: 'var(--accent-green-muted)', fontSize: '10px' }}>+{r.delta}</span>
                    </div>
                  </div>
                ))}
                {rising.length === 0 && <p className="text-mono text-micro text-muted" style={{ padding: '20px', textAlign: 'center' }}>No recent promotions found</p>}
              </div>
            </div>

            {/* C: Difficulty Band Gap (DNA Matrix) */}
            <div className="glass-panel-outer" style={{ padding: '16px' }}>
              <h3 className="text-micro text-muted" style={{ marginBottom: '10px' }}>DIFFICULTY DNA â€” VOLUME QUOTA</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(gaps?.bucketGaps || []).map((g, i) => (
                  <div key={g.bucket}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }} className="text-mono text-sm">
                      <span className="text-secondary">{g.bucket}</span>
                      <span>
                        <span style={{ color: g.pct >= 80 ? 'var(--accent-green-muted)' : g.pct >= 50 ? 'var(--accent-orange-muted)' : 'var(--accent-red-muted)' }}>{g.mine}</span>
                        <span className="text-micro text-secondary"> / {g.target}</span>
                        {g.gap > 0 && <span style={{ color: rankMeta.color, fontSize: '10px' }}> ({g.gap} needed)</span>}
                      </span>
                    </div>
                    <div style={{ height: '7px', background: 'var(--bg-glass-inner)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${g.pct}%`, height: '100%', background: g.pct >= 80 ? 'var(--accent-green-muted)' : g.pct >= 50 ? 'var(--accent-orange-muted)' : 'var(--accent-red-muted)', borderRadius: '4px', transition: 'width 0.4s' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* D: Tag Saturation â€” Strengths & Weaknesses */}
            <div className="glass-panel-outer" style={{ padding: '16px' }}>
              <h3 className="text-micro text-muted" style={{ marginBottom: '10px' }}>TAG GAP â€” STRENGTHS & WEAKNESSES</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto', maxHeight: '280px' }}>
                {(gaps?.tagGaps || []).slice(0, 12).map((g, i) => {
                  const isWeak = g.pct < 60;
                  const isStrong = g.pct >= 100;
                  return (
                    <div key={g.tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }} className="text-mono text-sm">
                        <span style={{ color: isWeak ? 'var(--accent-red-muted)' : isStrong ? 'var(--accent-green-muted)' : 'var(--text-secondary)' }}>{isWeak ? 'âš  ' : isStrong ? 'âœ“ ' : ''}{g.tag}</span>
                        <span><span style={{ color: isWeak ? 'var(--accent-red-muted)' : 'var(--accent-cyan)' }}>{g.mine}</span><span className="text-micro text-secondary"> / {g.target}</span></span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--bg-glass-inner)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(g.pct, 100)}%`, height: '100%', background: isWeak ? 'var(--accent-red-muted)' : isStrong ? 'var(--accent-green-muted)' : 'var(--accent-cyan)', borderRadius: '3px', opacity: 0.8 }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(gaps?.weaknesses?.length || 0) > 0 && (
                <div style={{ padding: '8px', background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)', borderRadius: '6px', marginTop: '10px' }}>
                  <div className="text-mono text-micro" style={{ color: 'var(--accent-red-muted)' }}>PRIORITY GAPS: {gaps.weaknesses.slice(0, 4).map(w => w.tag).join(', ')}</div>
                </div>
              )}
            </div>

            {/* E: Daily Problem Plan */}
            <div className="glass-panel-outer" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 className="text-micro text-muted">TODAY'S PROBLEM PLAN</h3>
                <span className="text-mono text-micro" style={{ color: 'var(--accent-cyan)' }}>DAY {sprintDay}</span>
              </div>
              {daily.length > 0 ? daily.map((p, i) => (
                <a key={i} href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-glass-inner)', borderRadius: '8px', border: `1px solid ${p.matchesWeak ? 'rgba(255,69,58,0.3)' : 'rgba(255,255,255,0.05)'}`, marginBottom: '6px' }}>
                  <div style={{ minWidth: '50px', textAlign: 'center', padding: '3px 6px', background: `${rankMeta.color}22`, borderRadius: '5px' }}>
                    <span className="text-mono text-sm" style={{ color: rankMeta.color, fontWeight: 'bold' }}>{p.rating}</span>
                  </div>
                  <div style={{ flexGrow: 1 }}>
                    <div className="text-mono text-sm text-primary">{p.contestId}{p.index} â€” {p.name}</div>
                    <div className="text-mono text-micro text-secondary">{p.tags.slice(0, 3).join(', ')}</div>
                  </div>
                  {p.matchesWeak && <span className="text-micro" style={{ color: 'var(--accent-red-muted)' }}>WEAK TAG</span>}
                  <span className="text-mono text-micro text-secondary">{p.count}/{co?.size} cohort</span>
                </a>
              )) : <p className="text-mono text-micro text-muted" style={{ padding: '20px', textAlign: 'center' }}>Sync data to generate your daily plan</p>}
            </div>

            {/* F: Full Recommendation Queue */}
            <div className="glass-panel-outer" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 className="text-micro text-muted">PROBLEM QUEUE â€” COHORT CATALYSTS</h3>
                <span className="text-mono text-micro text-secondary">{recs.length} problems</span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: '280px' }}>
                {recs.slice(0, 15).map((p, i) => (
                  <a key={i} href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'grid', gridTemplateColumns: '70px 1fr 60px', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.02)', alignItems: 'center' }} className="text-mono text-sm">
                    <span style={{ color: getCfColor(p.rating) }}>{p.rating}</span>
                    <span className="text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.contestId}{p.index} {p.name}</span>
                    <span className="text-micro text-secondary" style={{ textAlign: 'right' }}>{p.count}/{co?.size}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Topic Explorer Logic ──
  const teHandleTagInput = (val) => {
    setTeTagInput(val);
    if (val.length >= 1) {
      const filtered = teAllTags.filter(t => t.toLowerCase().includes(val.toLowerCase()) && !teSelectedTags.includes(t));
      setTeTagSuggestions(filtered.slice(0, 10));
      setTeShowSuggestions(true);
    } else {
      setTeShowSuggestions(false);
    }
  };

  const teAddTag = (tag) => {
    if (!teSelectedTags.includes(tag)) {
      setTeSelectedTags(prev => [...prev, tag]);
    }
    setTeTagInput('');
    setTeShowSuggestions(false);
  };

  const teRemoveTag = (tag) => {
    setTeSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const teSearch = async () => {
    if (teSelectedTags.length === 0) return;
    setTeLoading(true);
    setTeStatus('Fetching problems...');
    setTePage(0);
    try {
      const problems = await fetchProblemsByTags(teSelectedTags, teMinRating, teMaxRating);
      setTeProblems(problems);
      setTeStatus(`Found ${problems.length} problems. Analyzing solver ranks...`);
      const breakdowns = await fetchSolverRankBreakdown(problems.slice(0, 200), msg => setTeStatus(msg));
      setTeBreakdowns(breakdowns);
      setTeStatus(`Done — ${problems.length} problems loaded`);
    } catch (e) {
      setTeStatus('Error: ' + e.message);
    }
    setTeLoading(false);
  };

  const teSortedProblems = () => {
    let list = [...teProblems];
    const bd = teBreakdowns;
    const getRankCount = (pid, rank) => bd[pid]?.[rank] || 0;
    const getGmPlus = (pid) => (bd[pid]?.['legendary grandmaster'] || 0) + (bd[pid]?.['international grandmaster'] || 0) + (bd[pid]?.['grandmaster'] || 0);

    switch (teSortBy) {
      case 'gm_desc': list.sort((a, b) => getGmPlus(b.pid) - getGmPlus(a.pid)); break;
      case 'gm_asc': list.sort((a, b) => getGmPlus(a.pid) - getGmPlus(b.pid)); break;
      case 'master_desc': list.sort((a, b) => getRankCount(b.pid, 'master') - getRankCount(a.pid, 'master')); break;
      case 'cm_desc': list.sort((a, b) => getRankCount(b.pid, 'candidate master') - getRankCount(a.pid, 'candidate master')); break;
      case 'rating_desc': list.sort((a, b) => b.rating - a.rating); break;
      case 'rating_asc': list.sort((a, b) => a.rating - b.rating); break;
      case 'solved_desc': list.sort((a, b) => b.solvedCount - a.solvedCount); break;
      case 'solved_asc': list.sort((a, b) => a.solvedCount - b.solvedCount); break;
      default: break;
    }
    return list;
  };

  const renderTopicExplorer = () => {
    const sorted = teSortedProblems();
    const startIdx = tePage * tePageSize;
    const pageProblems = sorted.slice(startIdx, startIdx + tePageSize);
    const totalPages = Math.ceil(sorted.length / tePageSize);
    const rankKeys = ['grandmaster', 'international master', 'master', 'candidate master', 'expert'];
    const rankColors = { 'grandmaster': '#ff0000', 'international master': '#ff8c00', 'master': '#ff8c00', 'candidate master': '#aa00aa', 'expert': '#4444ff' };
    const rankLabels = { 'grandmaster': 'GM+', 'international master': 'IM', 'master': 'Master', 'candidate master': 'CM', 'expert': 'Expert' };

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'auto', padding: '4px' }}>
        {/* Header */}
        <div className="glass-panel-outer" style={{ padding: '16px 24px', flexShrink: 0 }}>
          <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', marginBottom: '12px' }}>
            🔍 Topic Explorer — <span className="text-muted">Discover Problems by Tag & Rank Distribution</span>
          </h2>
          <p className="text-mono text-micro text-secondary">All data fetched live from the Codeforces API. Select tags to find problems and see how many GMs, Masters, CMs solved each one.</p>
        </div>

        {/* Tag Input & Controls */}
        <div className="glass-panel-outer" style={{ padding: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Tag Autocomplete */}
            <div style={{ position: 'relative', flexGrow: 1, minWidth: '280px' }}>
              <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>TOPIC TAGS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {teSelectedTags.map(tag => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: '6px' }}>
                    <span className="text-mono text-sm text-cyan">{tag}</span>
                    <span onClick={() => teRemoveTag(tag)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>×</span>
                  </div>
                ))}
              </div>
              <input
                value={teTagInput}
                onChange={e => teHandleTagInput(e.target.value)}
                onFocus={() => { if (teTagInput.length >= 1) setTeShowSuggestions(true); }}
                onKeyDown={e => { if (e.key === 'Enter' && teTagSuggestions.length > 0) teAddTag(teTagSuggestions[0]); }}
                placeholder="Type tag (e.g. dp, sliding window, probabilities)"
                style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', outline: 'none' }}
                className="text-mono text-sm"
              />
              {teShowSuggestions && teTagSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(15,15,20,0.98)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', zIndex: 50, maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                  {teTagSuggestions.map(tag => (
                    <div key={tag} onClick={() => teAddTag(tag)} className="text-mono text-sm" style={{ padding: '8px 14px', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.15s' }} onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.target.style.background = 'transparent'}>
                      {tag}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rating Range */}
            <div>
              <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>RATING RANGE</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="number" value={teMinRating} onChange={e => setTeMinRating(Number(e.target.value))} style={{ width: '70px', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', textAlign: 'center' }} className="text-mono text-sm" />
                <span className="text-muted">—</span>
                <input type="number" value={teMaxRating} onChange={e => setTeMaxRating(Number(e.target.value))} style={{ width: '70px', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', textAlign: 'center' }} className="text-mono text-sm" />
              </div>
            </div>

            {/* Sort & Search */}
            <div>
              <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>SORT BY</div>
              <select value={teSortBy} onChange={e => setTeSortBy(e.target.value)} style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }} className="text-mono text-sm">
                <option value="gm_desc">GM Solvers ↓</option>
                <option value="gm_asc">GM Solvers ↑</option>
                <option value="master_desc">Master Solvers ↓</option>
                <option value="cm_desc">CM Solvers ↓</option>
                <option value="rating_desc">Rating ↓</option>
                <option value="rating_asc">Rating ↑</option>
                <option value="solved_desc">Total Solved ↓</option>
                <option value="solved_asc">Total Solved ↑</option>
              </select>
            </div>

            <div style={{ alignSelf: 'flex-end' }}>
              <button onClick={teSearch} disabled={teLoading || teSelectedTags.length === 0} style={{ background: teLoading ? 'var(--bg-glass-inner)' : 'var(--accent-cyan)', color: teLoading ? 'var(--text-muted)' : '#000', border: '1px solid var(--accent-cyan)', borderRadius: '8px', padding: '10px 24px', cursor: teLoading ? 'default' : 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }} className="text-mono text-sm">
                {teLoading ? '⏳ ANALYZING...' : '⟳ EXPLORE'}
              </button>
            </div>
          </div>

          {/* Quick Tag Chips */}
          <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span className="text-micro text-muted" style={{ alignSelf: 'center', marginRight: '4px' }}>QUICK:</span>
            {['dp', 'greedy', 'math', 'graphs', 'binary search', 'data structures', 'trees', 'constructive algorithms', 'two pointers', 'number theory', 'combinatorics', 'strings', 'dfs and similar', 'bitmasks', 'divide and conquer', 'probabilities'].map(tag => (
              <div key={tag} onClick={() => teAddTag(tag)} style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${teSelectedTags.includes(tag) ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)'}`, background: teSelectedTags.includes(tag) ? 'rgba(100,210,255,0.1)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }} className="text-mono text-micro text-secondary">
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        {teStatus && (
          <div className="text-mono text-sm text-cyan" style={{ padding: '0 8px', flexShrink: 0 }}>
            {teLoading && '⏳ '}{teStatus}
          </div>
        )}

        {/* Results Table */}
        {teProblems.length > 0 && (
          <div className="glass-panel-outer" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
            {/* Summary Stats Bar */}
            <div style={{ padding: '12px 20px', display: 'flex', gap: '24px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div className="text-mono text-sm">
                <span className="text-muted">PROBLEMS:</span> <span className="text-primary">{sorted.length}</span>
              </div>
              <div className="text-mono text-sm">
                <span className="text-muted">TAGS:</span> <span className="text-cyan">{teSelectedTags.join(', ')}</span>
              </div>
              <div className="text-mono text-sm">
                <span className="text-muted">RANGE:</span> <span className="text-primary">{teMinRating}–{teMaxRating}</span>
              </div>
              <div style={{ marginLeft: 'auto' }} className="text-mono text-micro text-muted">
                PAGE {tePage + 1}/{totalPages || 1}
              </div>
            </div>

            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 70px 70px repeat(5, 1fr) 90px', padding: '8px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }} className="text-micro text-secondary">
              <span>PROBLEM</span>
              <span style={{ textAlign: 'center' }}>RATING</span>
              <span style={{ textAlign: 'center' }}>SOLVED</span>
              {rankKeys.map(rk => (
                <span key={rk} style={{ textAlign: 'center', color: rankColors[rk], fontWeight: teRankHighlight === rk ? 'bold' : 'normal', cursor: 'pointer' }} onClick={() => setTeRankHighlight(rk)}>
                  {rankLabels[rk]}
                </span>
              ))}
              <span style={{ textAlign: 'center' }}>LINK</span>
            </div>

            {/* Table Body */}
            <div style={{ overflowY: 'auto', flexGrow: 1 }}>
              {pageProblems.map((prob, idx) => {
                const bd = teBreakdowns[prob.pid] || {};
                const gmPlus = (bd['legendary grandmaster'] || 0) + (bd['international grandmaster'] || 0) + (bd['grandmaster'] || 0);
                const isEstimate = bd.fetched === false;

                return (
                  <div key={prob.pid} style={{ display: 'grid', gridTemplateColumns: '2.5fr 70px 70px repeat(5, 1fr) 90px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }} className="text-mono text-sm hover-bg">
                    <span className="text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                      {prob.contestId}{prob.index} — {prob.name}
                    </span>
                    <span style={{ textAlign: 'center', color: getCfColor(prob.rating), fontWeight: 'bold' }}>{prob.rating || '—'}</span>
                    <span style={{ textAlign: 'center' }} className="text-muted">{prob.solvedCount > 0 ? prob.solvedCount.toLocaleString() : '—'}</span>
                    {rankKeys.map(rk => {
                      const val = rk === 'grandmaster' ? gmPlus : (bd[rk] || 0);
                      const isHighlight = rk === teRankHighlight;
                      return (
                        <span key={rk} style={{ textAlign: 'center', color: val > 0 ? rankColors[rk] : 'var(--text-tertiary)', fontWeight: isHighlight ? 'bold' : 'normal', opacity: val > 0 ? 1 : 0.4, fontSize: isHighlight ? '13px' : '12px' }}>
                          {val > 0 ? val : '·'}{isEstimate && val > 0 ? '~' : ''}
                        </span>
                      );
                    })}
                    <a href={`https://codeforces.com/problemset/problem/${prob.contestId}/${prob.index}`} target="_blank" rel="noreferrer" style={{ textAlign: 'center', color: 'var(--accent-cyan)', textDecoration: 'none', fontSize: '11px' }}>
                      SOLVE →
                    </a>
                  </div>
                );
              })}
              {pageProblems.length === 0 && !teLoading && (
                <div className="text-mono text-sm text-muted" style={{ padding: '40px', textAlign: 'center' }}>No problems found for selected filters</div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '10px 16px', display: 'flex', gap: '8px', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <button onClick={() => setTePage(Math.max(0, tePage - 1))} disabled={tePage === 0} style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '6px 14px', color: tePage === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)', cursor: tePage === 0 ? 'default' : 'pointer' }} className="text-mono text-sm">← PREV</button>
                <span className="text-mono text-sm text-secondary" style={{ alignSelf: 'center' }}>{tePage + 1} / {totalPages}</span>
                <button onClick={() => setTePage(Math.min(totalPages - 1, tePage + 1))} disabled={tePage >= totalPages - 1} style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '6px 14px', color: tePage >= totalPages - 1 ? 'var(--text-tertiary)' : 'var(--text-primary)', cursor: tePage >= totalPages - 1 ? 'default' : 'pointer' }} className="text-mono text-sm">NEXT →</button>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {teProblems.length > 0 && (
          <div className="text-mono text-micro text-muted" style={{ padding: '4px 8px', flexShrink: 0 }}>
            Values with ~ are estimated from total solve counts. Exact counts come from live contest standings data. GM+ column includes LGM + IGM + GM.
          </div>
        )}

        {/* Empty State */}
        {teProblems.length === 0 && !teLoading && (
          <div className="glass-panel-outer" style={{ padding: '60px', textAlign: 'center' }}>
            <p className="text-mono text-muted" style={{ marginBottom: '12px' }}>Select one or more topic tags above and click <span style={{ color: 'var(--accent-cyan)' }}>EXPLORE</span> to discover problems.</p>
            <p className="text-mono text-micro text-secondary">For example: select <span className="text-cyan">dp</span> + <span className="text-cyan">probabilities</span> to find DP problems involving probability.</p>
            <p className="text-mono text-micro text-secondary" style={{ marginTop: '8px' }}>Or try <span className="text-cyan">two pointers</span> for sliding window style problems.</p>
          </div>
        )}
      </div>
    );
  };
  // ── Training Hub Logic ──
  const thSaveSetup = async () => {
    if (!thSetupHandle.trim()) return;
    setThLoading(true);
    setThStatus('Verifying handle...');
    try {
      const res = await fetch(`https://codeforces.com/api/user.info?handles=${thSetupHandle}`);
      const json = await res.json();
      if (json.status !== 'OK') throw new Error('Handle not found');
      const user = json.result[0];
      const profile = {
        handle: user.handle,
        rating: user.rating || 0,
        maxRating: user.maxRating || 0,
        rank: user.rank || 'unrated',
        avatar: user.avatar || '',
        goalRank: thSetupGoalRank,
        goalDays: thSetupDays,
        dailyQuota: thSetupDailyQ,
        startDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now(),
      };
      saveUserProfile(profile);
      setThProfile(profile);
      setThSetupMode(false);
      setThStatus('Profile saved!');
    } catch (e) {
      setThStatus('Error: ' + e.message);
    }
    setThLoading(false);
  };

  const thSyncProgress = async () => {
    if (!thProfile?.handle) return;
    setThLoading(true);
    setThStatus('Syncing today\'s solves...');
    try {
      const progress = await syncDailyProgress(thProfile.handle);
      setThProgress(progress);
      setThStatus('Synced!');
    } catch (e) { setThStatus('Sync error: ' + e.message); }
    setThLoading(false);
  };

  const thLoadRivals = async () => {
    if (!thProfile?.handle) return;
    setThLoading(true);
    try {
      const rivalData = await findDynamicRivals(thProfile.handle, msg => setThStatus(msg));
      setThRivals(rivalData);
      setThStatus('Loading rival rating graphs...');
      const handles = [thProfile.handle, ...rivalData.rivals.map(r => r.handle)];
      const histories = await fetchRatingHistories(handles);
      setThRivalHistories(histories);
      setThStatus('Rivals loaded!');
    } catch (e) { setThStatus('Error: ' + e.message); }
    setThLoading(false);
  };

  const renderTrainingHub = () => {
    const rankGoals = { 'specialist': 1400, 'expert': 1600, 'candidate master': 1900, 'master': 2100, 'international master': 2300, 'grandmaster': 2400 };

    // ── Onboarding Setup ──
    if (thSetupMode || !thProfile) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel-outer" style={{ padding: '40px', maxWidth: '520px', width: '100%' }}>
            <h2 className="text-lg text-primary" style={{ marginBottom: '8px', textAlign: 'center' }}>🔥 Training Hub Setup</h2>
            <p className="text-mono text-micro text-muted" style={{ textAlign: 'center', marginBottom: '28px' }}>Set your profile & goals to begin tracking</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>CODEFORCES HANDLE</div>
                <input value={thSetupHandle} onChange={e => setThSetupHandle(e.target.value)} placeholder="your_handle" style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} className="text-mono text-sm" />
              </div>

              <div>
                <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>TARGET RANK</div>
                <select value={thSetupGoalRank} onChange={e => setThSetupGoalRank(e.target.value)} style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }} className="text-mono text-sm">
                  {Object.keys(rankGoals).map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)} ({rankGoals[r]}+)</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>DAYS TO REACH</div>
                  <input type="number" value={thSetupDays} onChange={e => setThSetupDays(Number(e.target.value))} style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} className="text-mono text-sm" />
                </div>
                <div>
                  <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>DAILY PROBLEM QUOTA</div>
                  <input type="number" value={thSetupDailyQ} onChange={e => setThSetupDailyQ(Number(e.target.value))} style={{ width: '100%', background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-primary)', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} className="text-mono text-sm" />
                </div>
              </div>

              <button onClick={thSaveSetup} disabled={thLoading || !thSetupHandle.trim()} style={{ background: 'var(--accent-cyan)', color: '#000', border: 'none', borderRadius: '8px', padding: '14px', cursor: 'pointer', fontWeight: 'bold', marginTop: '8px', transition: 'all 0.2s' }} className="text-mono text-sm">
                {thLoading ? '⏳ VERIFYING...' : '🚀 START TRAINING'}
              </button>
              {thStatus && <div className="text-mono text-micro text-cyan" style={{ textAlign: 'center' }}>{thStatus}</div>}
            </div>
          </div>
        </div>
      );
    }

    // ── Main Dashboard ──
    const p = thProfile;
    const goalRating = rankGoals[p.goalRank] || 2400;
    const ratingGap = Math.max(0, goalRating - (p.rating || 0));
    const startDate = new Date(p.startDate);
    const today = new Date();
    const dayNumber = Math.floor((today - startDate) / 86400000) + 1;
    const daysLeft = Math.max(0, p.goalDays - dayNumber);
    const progressPct = Math.min(100, Math.round((dayNumber / p.goalDays) * 100));

    // Calendar data
    const calYear = thCalYear;
    const calMonth = thCalMonth;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Streak calc
    let streak = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().split('T')[0];
      const entry = thProgress[key];
      if (entry && entry.solved >= p.dailyQuota) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }

    // Total solved across all tracked days
    const totalTracked = Object.values(thProgress).reduce((sum, e) => sum + (e.solved || 0), 0);

    // Rival comparison graph
    const renderRivalGraph = () => {
      try {
        if (!thRivalHistories) return null;
        const gW = 800, gH = 360;
        const paddingX = 40, paddingY = 30, rightPadding = 120;
        const plotW = gW - paddingX - rightPadding;
        const plotH = gH - paddingY * 2;
        
        const allHandles = Object.keys(thRivalHistories);
        let allRatings = [];
        for (const h of allHandles) { for (const pt of thRivalHistories[h]) allRatings.push(pt.rating); }
        if (allRatings.length === 0) return <div className="text-mono text-muted">No rating data to display.</div>;
        const rMin = Math.floor(Math.min(...allRatings) / 100) * 100 - 100;
        const rMax = Math.ceil(Math.max(...allRatings) / 100) * 100 + 100;

      // Last 365 days
      const cutoff = Date.now() / 1000 - 365 * 86400;
      const tMin = cutoff;
      const tMax = Date.now() / 1000;
      const toX = t => paddingX + ((t - tMin) / (tMax - tMin)) * plotW;
      const toY = r => gH - paddingY - ((r - rMin) / (rMax - rMin)) * plotH;

      const rivalColors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8e4a', '#c084fc', '#f472b6', '#34d399'];

      return (
        <div className="glass-panel-outer" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="text-micro text-muted">RATING COMPARISON — YOU vs RIVALS (LAST 12 MONTHS)</h3>
            <button onClick={thLoadRivals} disabled={thLoading} className="text-mono text-micro" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '5px 12px', color: 'var(--accent-cyan)', cursor: 'pointer' }}>⟳ REFRESH</button>
          </div>
          <svg viewBox={`0 0 ${gW} ${gH}`} style={{ width: '100%', height: '360px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} preserveAspectRatio="none">
            {/* Rating bands */}
            {[1200,1400,1600,1900,2100,2400,2600,2800,3000].filter(r => r >= rMin && r <= rMax).map(r => (
              <g key={r}>
                <line x1={paddingX} y1={toY(r)} x2={gW - rightPadding} y2={toY(r)} stroke="rgba(255,255,255,0.06)" />
                <text x="4" y={toY(r) + 3} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">{r}</text>
              </g>
            ))}
            {/* X-axis months */}
            {[...Array(12)].map((_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const mName = d.toLocaleString('default', { month: 'short' });
              const ts = d.getTime() / 1000;
              if (ts < tMin || ts > tMax) return null;
              return (
                <text key={i} x={toX(ts)} y={gH - 5} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace" textAnchor="middle">{mName}</text>
              );
            })}
            {/* Rival lines */}
            {allHandles.map((h, idx) => {
              const pts = (thRivalHistories[h] || []).filter(p => p.ts >= cutoff);
              if (pts.length < 2) return null;
              const isMe = h === p.handle;
              const color = isMe ? 'var(--accent-cyan)' : rivalColors[idx % rivalColors.length];
              const points = pts.map(pt => `${toX(pt.ts)},${toY(pt.rating)}`).join(' ');
              return (
                <g key={h}>
                  <polyline points={points} fill="none" stroke={color} strokeWidth={isMe ? 2.5 : 1.2} opacity={isMe ? 1 : 0.7} />
                  <text x={toX(pts[pts.length - 1].ts) + 6} y={toY(pts[pts.length - 1].rating)} fill={color} fontSize="10" fontFamily="monospace" dominantBaseline="middle">
                    {h.slice(0, 10)} ({pts[pts.length - 1].rating})
                  </text>
                  <circle cx={toX(pts[pts.length - 1].ts)} cy={toY(pts[pts.length - 1].rating)} r={isMe ? 4 : 2} fill={color} />
                </g>
              );
            })}
          </svg>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
            {allHandles.map((h, idx) => {
              const isMe = h === p.handle;
              const color = isMe ? 'var(--accent-cyan)' : rivalColors[idx % rivalColors.length];
              return (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '3px', background: color, borderRadius: '2px' }} />
                  <span className="text-mono text-micro" style={{ color }}>{h}{isMe ? ' (YOU)' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    } catch (err) {
      return <div className="glass-panel-outer" style={{ padding: '16px', color: 'red' }}>Error rendering graph: {err.message}</div>;
    }
  };

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'auto', padding: '4px' }}>
        {/* Profile Header */}
        <div className="glass-panel-outer" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {p.avatar && <img src={p.avatar.startsWith('//') ? 'https:' + p.avatar : p.avatar} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid var(--accent-cyan)' }} />}
            <div>
              <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em' }}>
                🔥 {p.handle}'s Training Hub
              </h2>
              <p className="text-mono text-micro text-secondary">
                Current: <span style={{ color: getCfColor(p.rating) }}>{p.rating} ({p.rank})</span> → Target: <span style={{ color: getCfColor(goalRating) }}>{goalRating} ({p.goalRank})</span> — Rating Gap: <span className="text-cyan">{ratingGap}</span>
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={thSyncProgress} disabled={thLoading} className="text-mono text-micro" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--accent-cyan)', borderRadius: '6px', padding: '8px 16px', color: 'var(--accent-cyan)', cursor: 'pointer' }}>⟳ SYNC</button>
            <button onClick={() => setThSetupMode(true)} className="text-mono text-micro" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer' }}>⚙ EDIT</button>
          </div>
        </div>

        {thStatus && <div className="text-mono text-sm text-cyan" style={{ padding: '0 8px', flexShrink: 0 }}>{thLoading && '⏳ '}{thStatus}</div>}

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', flexShrink: 0 }}>
          {[
            { label: 'DAY', value: `${dayNumber} / ${p.goalDays}`, color: 'var(--accent-cyan)' },
            { label: 'DAYS LEFT', value: daysLeft, color: daysLeft < 10 ? '#ff4444' : 'var(--text-primary)' },
            { label: 'STREAK', value: `${streak}🔥`, color: streak >= 3 ? '#ff8c00' : 'var(--text-primary)' },
            { label: 'TODAY', value: `${thProgress[today.toISOString().split('T')[0]]?.solved || 0} / ${p.dailyQuota}`, color: (thProgress[today.toISOString().split('T')[0]]?.solved || 0) >= p.dailyQuota ? '#00ff88' : 'var(--text-primary)' },
            { label: 'TOTAL SOLVED', value: totalTracked, color: 'var(--accent-cyan)' },
          ].map((s, i) => (
            <div key={i} className="glass-panel-outer" style={{ padding: '12px 16px', textAlign: 'center' }}>
              <div className="text-micro text-muted">{s.label}</div>
              <div className="text-mono text-lg" style={{ color: s.color, marginTop: '4px' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="glass-panel-outer" style={{ padding: '12px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span className="text-micro text-muted">SPRINT PROGRESS</span>
            <span className="text-mono text-micro text-cyan">{progressPct}%</span>
          </div>
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-cyan), #00ff88)', borderRadius: '4px', transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Calendar Checklist */}
        <div className="glass-panel-outer" style={{ padding: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button onClick={() => { if (calMonth === 0) { setThCalMonth(11); setThCalYear(calYear - 1); } else setThCalMonth(calMonth - 1); }} className="text-mono text-sm" style={{ background: 'none', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text-primary)', cursor: 'pointer' }}>◀</button>
            <h3 className="text-mono text-sm text-primary">{monthNames[calMonth]} {calYear}</h3>
            <button onClick={() => { if (calMonth === 11) { setThCalMonth(0); setThCalYear(calYear + 1); } else setThCalMonth(calMonth + 1); }} className="text-mono text-sm" style={{ background: 'none', border: '1px solid var(--border-quant-harsh)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text-primary)', cursor: 'pointer' }}>▶</button>
          </div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
            {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => <div key={d} className="text-micro text-muted" style={{ textAlign: 'center', padding: '4px 0' }}>{d}</div>)}
          </div>
          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const entry = thProgress[dateStr];
              const solved = entry?.solved || 0;
              const metQuota = solved >= p.dailyQuota;
              const isToday = dateStr === today.toISOString().split('T')[0];
              const isFuture = new Date(dateStr) > today;
              const isBeforeStart = new Date(dateStr) < startDate;
              const hasData = entry && solved > 0;

              let bg = 'rgba(255,255,255,0.02)';
              let icon = '';
              if (isFuture || isBeforeStart) { bg = 'rgba(255,255,255,0.01)'; }
              else if (metQuota) { bg = 'rgba(255,140,0,0.15)'; icon = '🔥'; }
              else if (hasData) { bg = 'rgba(10,132,255,0.1)'; icon = '✓'; }
              else if (!isFuture && !isBeforeStart) { bg = 'rgba(255,0,0,0.05)'; icon = '·'; }

              return (
                <div key={day} style={{ padding: '6px 2px', textAlign: 'center', borderRadius: '6px', background: bg, border: isToday ? '1.5px solid var(--accent-cyan)' : '1px solid transparent', cursor: 'default', minHeight: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '2px' }}>
                  <span className="text-mono text-micro" style={{ color: isToday ? 'var(--accent-cyan)' : isFuture ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontWeight: isToday ? 'bold' : 'normal' }}>{day}</span>
                  {!isFuture && !isBeforeStart && (
                    <span style={{ fontSize: metQuota ? '14px' : '10px', lineHeight: 1 }}>{icon}</span>
                  )}
                  {hasData && <span className="text-mono" style={{ fontSize: '8px', color: metQuota ? '#ff8c00' : 'var(--text-tertiary)' }}>{solved}/{p.dailyQuota}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rivals Section */}
        <div className="glass-panel-outer" style={{ padding: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="text-micro text-muted">🎯 DYNAMIC RIVALS — Users {400}-{700} rating above you, actively improving</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {thStatus && <span className="text-mono text-micro text-cyan">{thStatus}</span>}
              <button onClick={thLoadRivals} disabled={thLoading} className="text-mono text-micro" style={{ background: 'var(--accent-cyan)', color: '#000', border: 'none', borderRadius: '6px', padding: '6px 16px', cursor: thLoading ? 'wait' : 'pointer', fontWeight: 'bold', opacity: thLoading ? 0.7 : 1 }}>
                {thLoading ? '⏳ LOADING...' : (thRivals ? '⟳ REFRESH' : '⚡ FIND RIVALS')}
              </button>
            </div>
          </div>

          {thRivals && thRivals.rivals.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {thRivals.rivals.map((r, i) => (
                <div key={r.handle} className="glass-panel-outer" style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <a href={`https://codeforces.com/profile/${r.handle}`} target="_blank" rel="noreferrer" className="text-mono text-sm" style={{ color: getCfColor(r.rating), textDecoration: 'none', fontWeight: 'bold' }}>{r.handle}</a>
                  <div className="text-mono text-micro" style={{ color: getCfColor(r.rating), marginTop: '2px' }}>{r.rating}</div>
                  <div className="text-mono text-micro" style={{ color: r.avgDelta > 0 ? '#00ff88' : '#ff4444', marginTop: '2px' }}>
                    {r.avgDelta > 0 ? '▲' : '▼'} {r.avgDelta}/contest
                  </div>
                  <div className="text-mono" style={{ fontSize: '8px', color: 'var(--text-muted)', marginTop: '2px' }}>+{r.gapFromYou} above you</div>
                </div>
              ))}
            </div>
          )}
          {thRivals && thRivals.rivals.length === 0 && <div className="text-mono text-sm text-muted" style={{ textAlign: 'center', padding: '20px' }}>No suitable rivals found in recent contests.</div>}
          {!thRivals && <div className="text-mono text-sm text-muted" style={{ textAlign: 'center', padding: '20px' }}>Click FIND RIVALS to discover competitors 500-600+ above your rating who are actively improving.</div>}
        </div>

        {/* Rival Comparison Graph */}
        {thRivalHistories && renderRivalGraph()}
      </div>
    );
  };

  const applyUserData = (u) => {
    if (u.cf_handle) setCfHandle(u.cf_handle);
    if (u.lc_handle) setLcHandle(u.lc_handle);
    if (u.nvidia_key) { setCoachNvidiaKey(u.nvidia_key); localStorage.setItem('ag_nvidia_key', u.nvidia_key); }
    if (u.goal_rank) setThSetupGoalRank(u.goal_rank);
  };

  const handleAuth = async () => {
    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(`${BACKEND}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      const u = data.user || { id: data.userId, username: authUsername };
      setUser(u);
      if (data.user) {
        applyUserData(data.user);
        // Auto-sync CF profile after login
        if (data.user.cf_handle) setTimeout(fetchUserProfile, 400);
      }
    } catch(e) { alert("Backend error — is the server running?"); }
  };

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        const userInfo = await userInfoRes.json();
        const res = await fetch(`${BACKEND}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credential: null,
            googleId: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
          })
        });
        const data = await res.json();
        if (data.error) { alert('Google Sign-In failed: ' + data.error); return; }
        const u = data.user;
        setUser({ ...u, avatar: u.avatar || userInfo.picture, displayName: userInfo.name });
        applyUserData(u);
        // Auto-sync CF profile after Google login
        if (u.cf_handle) setTimeout(fetchUserProfile, 400);
      } catch (e) {
        alert('Google Sign-In error: ' + e.message);
      }
    },
    onError: () => alert('Google Sign-In was cancelled or failed.'),
  });

  const renderAuth = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', backgroundImage: 'url("https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=2000")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(8,14,30,0.75) 0%,rgba(20,8,40,0.65) 100%)', backdropFilter: 'blur(2px)' }}></div>
      <div style={{ position: 'relative', zIndex: 1, background: 'rgba(22,22,38,0.72)', backdropFilter: 'blur(60px) saturate(220%)', padding: '48px 44px', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.12)', width: '400px', boxShadow: '0 40px 100px rgba(0,0,0,0.65), inset 0 1.5px 0 rgba(255,255,255,0.12)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 10, filter: 'drop-shadow(0 0 20px rgba(94,207,255,0.5))' }}>⚡</div>
          <h1 style={{ color: 'white', fontWeight: 200, fontSize: '32px', letterSpacing: '-1px', marginBottom: 6 }}>Coach <span style={{ fontWeight: 800, background: 'linear-gradient(135deg,#5ecfff,#c86eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>CP</span></h1>
          <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, letterSpacing: '0.02em' }}>{isLoginMode ? 'Sign in to your command center' : 'Create your account'}</p>
        </div>
        <input className="auth-input" placeholder="Username" value={authUsername}
          onChange={e => setAuthUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
          style={{ marginBottom: 12 }} />
        <input className="auth-input" type="password" placeholder="Password" value={authPassword}
          onChange={e => setAuthPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
          style={{ marginBottom: 20 }} />
        <button onClick={handleAuth} style={{ width: '100%', padding: '14px', borderRadius: '16px', background: 'linear-gradient(135deg,rgba(94,207,255,0.28),rgba(200,110,255,0.22))', color: 'white', border: '1px solid rgba(94,207,255,0.40)', cursor: 'pointer', fontWeight: 700, fontSize: '14px', letterSpacing: '0.06em', marginBottom: 10 }}>{isLoginMode ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>

        <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0', width: '100%' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div>
          <span style={{ margin: '0 12px', color: 'rgba(255,255,255,0.38)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }}></div>
        </div>

        <button onClick={() => googleLogin()} style={{ width: '100%', padding: '12px', borderRadius: '16px', background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, marginBottom: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p style={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center', cursor: 'pointer', fontSize: '13px', margin: 0 }} onClick={() => setIsLoginMode(!isLoginMode)}>
          {isLoginMode ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </p>
      </div>
    </div>
  );

  const renderSpatialHome = () => {
    const apps = [
      { id: 'command_center', name: 'Command Center', icon: <BarChart3 size={36} color="white" />, color: 'rgba(100, 210, 255, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(100, 210, 255, 0.4) 0%, rgba(100, 210, 255, 0.1) 100%)' },
      { id: 'crucible', name: 'The Crucible', icon: <BrainCircuit size={36} color="white" />, color: 'rgba(255, 159, 10, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(255, 159, 10, 0.4) 0%, rgba(255, 159, 10, 0.1) 100%)' },
      { id: 'golden_path', name: 'Golden Path', icon: <Sparkles size={36} color="white" />, color: 'rgba(255, 214, 10, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(255, 214, 10, 0.4) 0%, rgba(255, 214, 10, 0.1) 100%)' },
      { id: 'graveyard', name: 'Graveyard', icon: <Ghost size={36} color="white" />, color: 'rgba(255, 69, 58, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(255, 69, 58, 0.4) 0%, rgba(255, 69, 58, 0.1) 100%)' },
      { id: 'palantir_hub', name: 'Palantir Hub', icon: <Eye size={36} color="white" />, color: 'rgba(191, 90, 242, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(191, 90, 242, 0.4) 0%, rgba(191, 90, 242, 0.1) 100%)' },
      { id: 'training_hub', name: 'Training Hub', icon: <Flame size={36} color="white" />, color: 'rgba(48, 209, 88, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(48, 209, 88, 0.4) 0%, rgba(48, 209, 88, 0.1) 100%)' },
      { id: 'skill_tree', name: 'Skill Tree', icon: <Dna size={36} color="white" />, color: 'rgba(0, 255, 204, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(0, 255, 204, 0.4) 0%, rgba(0, 255, 204, 0.1) 100%)' },
      { id: 'settings', name: 'Settings', icon: <Settings size={36} color="white" />, color: 'rgba(142, 142, 147, 0.8)', bgGradient: 'linear-gradient(135deg, rgba(142, 142, 147, 0.4) 0%, rgba(142, 142, 147, 0.1) 100%)' },
    ];
    return (
      <div className="spatial-home-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundImage: 'url("https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=2000")', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '100vh', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 0 }}></div>
        
        {/* Top Bar Navigation */}
        <div style={{ position: 'absolute', top: '40px', right: '40px', color: 'white', display: 'flex', gap: '20px', alignItems: 'center', zIndex: 10 }}>
          <span className="text-mono" style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '30px', backdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{user.username}</span>
          <button style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '10px 20px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(30px)', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }} onClick={() => setUser(null)} onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.25)'} onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}>Logout</button>
        </div>

        {/* Floating Clock / Header */}
        <div style={{ marginBottom: '60px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h1 style={{ color: 'white', fontSize: '72px', fontWeight: '200', letterSpacing: '-2px', textShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '20px', fontWeight: '400', marginTop: '10px', textShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Beautiful Apple visionOS App Grid */}
        <div className="spatial-app-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '50px 40px', padding: '20px', perspective: '1000px', position: 'relative', zIndex: 1 }}>
          {apps.map(app => (
            <div key={app.id} 
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
              onClick={() => { setActiveView(app.id); setIsSpatialHome(false); }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15) translateZ(30px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateZ(0)'}
            >
              <div style={{ 
                width: '100px', height: '100px', 
                background: app.bgGradient,
                borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 15px 35px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.4), inset 0 -2px 5px rgba(0,0,0,0.3)`,
                border: `1px solid rgba(255,255,255,0.2)`,
                backdropFilter: 'blur(30px) saturate(200%)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: app.color, opacity: 0.15 }}></div>
                <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }}></div>
                <div style={{ zIndex: 2, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                  {app.icon}
                </div>
              </div>
              <span style={{ color: 'white', fontSize: '14px', fontWeight: '500', textShadow: '0 2px 4px rgba(0,0,0,0.8)', letterSpacing: '0.3px', background: 'rgba(0,0,0,0.2)', padding: '4px 12px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>{app.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSkillTree = () => (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border-quant-harsh)', marginBottom: '16px', flexShrink: 0 }}>
        <h2 className="text-xl text-primary" style={{ letterSpacing: '-0.02em', marginBottom: '4px' }}>Neural Skill Tree</h2>
        <p className="text-base text-muted">A dynamic 3D mapping of your competitive programming topic proficiency. Hover for insights, click to queue drills.</p>
      </div>
      <div style={{ flexGrow: 1, minHeight: 0 }}>
        <SkillTree3D userHandle={cfHandle} onNodeClick={(node) => {
          alert(`Queuing 3 targeted problems for ${node.name} (Elo: ${node.elo}). Check your Training Hub!`);
        }} />
      </div>
    </div>
  );

  const renderSettings = () => (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border-quant-harsh)' }}>
        <h2 className="text-xl text-primary" style={{ letterSpacing: '-0.02em', marginBottom: '4px' }}>Profile & Global Settings</h2>
        <p className="text-base text-muted">Configure your handles, API keys, and training goals. These settings apply globally across all modules.</p>
      </div>
      
      <div className="glass-panel-outer" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="text-lg text-primary" style={{ marginBottom: '8px' }}>Identity Synchronization</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>CODEFORCES HANDLE</label>
            <input value={cfHandle} onChange={e => setCfHandle(e.target.value)} className="text-mono text-base" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>LEETCODE HANDLE</label>
            <input value={lcHandle} onChange={e => setLcHandle(e.target.value)} className="text-mono text-base" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
        </div>
        <button onClick={fetchUserProfile} style={{ background: 'var(--accent-cyan)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px', cursor: 'pointer', fontWeight: 'bold', width: '100%', transition: 'opacity 0.2s', marginTop: '8px' }}>
          {profile.loading ? 'SYNCING FROM CODEFORCES...' : 'TEST CODEFORCES SYNC'}
        </button>
      </div>

      <div className="glass-panel-outer" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="text-lg text-primary" style={{ marginBottom: '8px' }}>Training Directives (Goals)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>TARGET RANK</label>
            <select value={thSetupGoalRank} onChange={e => setThSetupGoalRank(e.target.value)} className="text-mono text-base" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', outline: 'none' }}>
              <option value="expert">Expert (1600+)</option>
              <option value="candidate master">Candidate Master (1900+)</option>
              <option value="master">Master (2100+)</option>
              <option value="grandmaster">Grandmaster (2400+)</option>
            </select>
          </div>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>SPRINT DURATION (DAYS)</label>
            <input type="number" value={thSetupDays} onChange={e => setThSetupDays(Number(e.target.value))} className="text-mono text-base" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>DAILY DRILL QUOTA</label>
            <input type="number" value={thSetupDailyQ} onChange={e => setThSetupDailyQ(Number(e.target.value))} className="text-mono text-base" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
        </div>
      </div>

      <div className="glass-panel-outer" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="text-lg text-primary" style={{ marginBottom: '8px' }}>API Configurations</h3>
        <div>
          <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>NVIDIA NIM API KEY (SOCRATIC COACH)</label>
          <input type="password" value={coachNvidiaKey} onChange={e => { setCoachNvidiaKey(e.target.value); localStorage.setItem('ag_nvidia_key', e.target.value); }} placeholder="nvapi-..." className="text-mono text-base" style={{ background: 'var(--bg-glass-inner)', border: '1px solid var(--border-quant-harsh)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
        </div>
      </div>


      <button onClick={async () => {
        try {
          if (user?.id) {
            await fetch(`${BACKEND}/api/users/${user.id}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cf_handle: cfHandle, lc_handle: lcHandle, nvidia_key: coachNvidiaKey, goal_rank: thSetupGoalRank })
            });
          }
          saveGoals({ targetRank: thSetupGoalRank, days: thSetupDays, dailyQuota: thSetupDailyQ, sprintStart: Math.floor(Date.now() / 1000) });
          setThSetupMode(false);
          await fetchUserProfile();
          alert('✅ Profile synced! CF data refreshed.');
        } catch(e) { alert('Failed to sync — check backend connection.'); }
      }} className="text-base" style={{ background: 'linear-gradient(135deg,rgba(94,207,255,0.85),rgba(200,110,255,0.80))', color: '#05050f', border: 'none', borderRadius: '14px', padding: '16px', cursor: 'pointer', fontWeight: 800, width: '100%', transition: 'transform 0.2s, opacity 0.2s, box-shadow 0.2s', marginTop: '8px', letterSpacing: '0.04em', boxShadow: '0 8px 24px rgba(94,207,255,0.22)' }}>
        ⚡ SAVE & SYNC GLOBAL PROFILE
      </button>
    </div>
  );

  if (!user) return renderAuth();
  if (isSpatialHome) return renderSpatialHome();

  return (
    <div className="dashboard-layout">
      {renderSidebar()}
      <main className="main-content" data-view={activeView}>
        {activeView === 'command_center' && renderCommandCenter()}
        {activeView === 'crucible' && renderCrucible()}
        {activeView === 'golden_path' && renderGoldenPath()}
        {activeView === 'graveyard' && renderGraveyard()}
        {activeView === 'code_explorer' && renderCodeExplorer()}
        {activeView === 'palantir_hub' && renderPalantirHub()}
        {activeView === 'topic_explorer' && renderTopicExplorer()}
        {activeView === 'training_hub' && renderTrainingHub()}
        {activeView === 'skill_tree' && renderSkillTree()}
        {activeView === 'settings' && renderSettings()}
      </main>

      {/* Code Modal Overlay */}
      {codeModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel-outer" style={{ width: '800px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
             <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-quant-harsh)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-mono text-primary">{codeModal.handle}'s Solution</span>
                <button onClick={() => setCodeModal({ isOpen: false, code: '', handle: '' })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px' }}>×</button>
             </div>
             <div style={{ padding: '24px', overflowY: 'auto', background: 'rgba(5,5,5,0.8)' }}>
               <pre className="text-mono text-sm" style={{ color: 'var(--accent-green-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
                 <code>{codeModal.code}</code>
               </pre>
               {codeModal.url && (
                 <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                   <a href={codeModal.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }} className="text-mono text-sm">
                     â–¶ OPEN SUBMISSION DIRECTLY ON CODEFORCES
                   </a>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
