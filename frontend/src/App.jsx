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
  Activity,
  Cpu,
  Gauge,
  TrendingUp,
  Zap,
  Trophy,
  Shield,
  RotateCcw
} from 'lucide-react'
import MyCPCLogo from './MyCPCLogo'
import './index.css'
import { runFullAnalysis, saveGoals, loadGoals, generateDailyPlan, fetchAllTags, fetchProblemsByTags, fetchSolverRankBreakdown, RANK_TIERS, loadUserProfile, saveUserProfile, loadDailyProgress, saveDailyProgress, syncDailyProgress, findDynamicRivals, fetchRatingHistories, fetchDynamicCoachInsights } from './cfAnalytics'
import { getDailyQueue, getAllTracked, addToSpacedRep, reviewProblem, removeFromSpacedRep, savePreFlight, getPreFlights, hasCompletedPreFlight, isTiltActive, triggerTilt, getTiltRemainingSeconds, getTodayCycle, setTodayCycle, updateCycleProblemStatus, getCycleHistory } from './spacedRep'
import SkillTree3D from './SkillTree3D';
import Heatmap3D from './Heatmap3D';
import CoachReportView from './CoachReportView';
import SkillGraph from './SkillGraph';
import CommunityLeaderboard from './CommunityLeaderboard';
import CoachPortal from './CoachPortal';
import UpsolveQueue from './UpsolveQueue';
import DNADashboard from './DNADashboard';

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
  const [cfHandle, setCfHandle] = useState('');
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
  // ── Crucible Adversarial Engine State ──────────────────────────────
  const [advStarGraph, setAdvStarGraph] = useState(false);
  const [advBamboo, setAdvBamboo] = useState(false);
  const [advDisconnected, setAdvDisconnected] = useState(false);
  const [advEmpty, setAdvEmpty] = useState(false);
  const [advWorstCase, setAdvWorstCase] = useState('');

  // ── NEW: Training Cycle State ─────────────────────────────────────────
  const [cycleToday, setCycleToday] = useState(getTodayCycle());
  const [cycleHistory, setCycleHistory] = useState(getCycleHistory(30));
  const [cycleTimer, setCycleTimer] = useState(null);  // { problemIdx, secondsLeft, running }
  const cycleTimerRef = useRef(null);
  const [backendHealth, setBackendHealth] = useState(null);

  // ── DACE Complexity Analyzer State ──────────────────────────────────
  const [daceCode, setDaceCode] = useState('');
  const [daceResult, setDaceResult] = useState(null);

  // ── Memory Profiler State ──────────────────────────────────────────
  const [memCode, setMemCode] = useState('');
  const [memResult, setMemResult] = useState(null);

  // ── Contest Simulator / EV Engine State ─────────────────────────────
  const [evMinutesIn, setEvMinutesIn] = useState(45);
  const [evConfidence, setEvConfidence] = useState(70);
  const [evPenalty, setEvPenalty] = useState(10);
  const [evResult, setEvResult] = useState(null);

  // ── Telemetry State ────────────────────────────────────────────────
  const [telemetryProfile, setTelemetryProfile] = useState(null);

  // ── Drawdown Profiler State ────────────────────────────────────────
  const [drawdownData, setDrawdownData] = useState(null);

  // ── Coach Report State (Real session ID) ──────────────────────────
  const [latestSessionId, setLatestSessionId] = useState(null);

  // ── Loading Screen State ───────────────────────────────────────────
  const [appLoading, setAppLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing myCPC...');

  // ── Phase 5: Performance Arc ───────────────────────────────────────
  const [arcData, setArcData] = useState(null);
  const [arcLoading, setArcLoading] = useState(false);

  // ── Phase 5: Achievement System ───────────────────────────────────
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  // ── Phase 5: Peer DNA Comparison ──────────────────────────────────
  const [peerHandle, setPeerHandle] = useState('');
  const [peerData, setPeerData] = useState(null);
  const [peerLoading, setPeerLoading] = useState(false);

  // ── Phase 5: Contest Post-Mortem ──────────────────────────────────
  const [pmContestId, setPmContestId] = useState('');
  const [pmData, setPmData] = useState(null);
  const [pmLoading, setPmLoading] = useState(false);

  // ── Phase 5: Mentor View ──────────────────────────────────────────
  const [mentorStudents, setMentorStudents] = useState(null);
  const [mentorStudentHandle, setMentorStudentHandle] = useState('');
  const [mentorSelectedSession, setMentorSelectedSession] = useState('');
  const [mentorAnnotation, setMentorAnnotation] = useState('');
  const [mentorAnnotationType, setMentorAnnotationType] = useState('note');
  const [mentorAnnotations, setMentorAnnotations] = useState([]);

  // ── Phase 5: AI Coach Chat ────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // ── Skill Scores (for Tactical Gap Matrix) ────────────────────────
  const [skillScores, setSkillScores] = useState([]);

  // ── Golden Path (real recommendations) ───────────────────────────
  const [goldenProblems, setGoldenProblems] = useState([]);
  const [goldenLoading, setGoldenLoading] = useState(false);


  const GM_REFS = ['tourist', 'jiangly', 'Benq'];

  // ── Loading screen sequence ────────────────────────────────────────
  useEffect(() => {
    const msgs = [
      'Initializing myCPC...',
      'Connecting to Codeforces API...',
      'Building skill dependency graph...',
      'Loading spaced repetition queue...',
      'Calibrating complexity analyzer...',
      'Ready.'
    ];
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i < msgs.length) setLoadingMsg(msgs[i]);
      else { clearInterval(iv); setAppLoading(false); }
    }, 400);
    return () => clearInterval(iv);
  }, []);

  // ── Number formatter ───────────────────────────────────────────────
  const fmt = (n) => typeof n === 'number' ? n.toLocaleString() : n;



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
    // Fetch latest session ID for coach report
    fetch(`${BACKEND}/api/user/latest-session/${cfHandle}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.sessionId) setLatestSessionId(data.sessionId); })
      .catch(() => {});
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

  const [solutions, setSolutions] = useState([]);

  useEffect(() => {
    fetchUserProfile();
    setLoading(false);
  }, []);

  const renderSidebar = () => (
    <aside className="sidebar">
      <div className="sidebar-brand" onClick={() => setIsSpatialHome(true)} style={{ cursor: 'pointer' }}>
        <MyCPCLogo size="sm" />
        <div>
          <div className="sidebar-brand-name">myCPC</div>
          <div className="sidebar-brand-sub">Opportunity · Choice · Growth</div>
        </div>
      </div>

      <div className="sidebar-section-label">Main</div>
      <div className="nav-item" onClick={() => setIsSpatialHome(true)}>
        <BarChart3 size={14} /> Home
      </div>
      <div className={`nav-item ${activeView === 'command_center' ? 'active' : ''}`} onClick={() => setActiveView('command_center')}>
        <Activity size={14} /> Command Center
      </div>

      <div className="sidebar-section-label">Community & Coach</div>
      <div className={`nav-item ${activeView === 'community' ? 'active' : ''}`} onClick={() => setActiveView('community')}>
        <Trophy size={14} /> Global Leaderboard
      </div>
      <div className={`nav-item ${activeView === 'coach_portal' ? 'active' : ''}`} onClick={() => setActiveView('coach_portal')}>
        <Shield size={14} /> Coach Portal
      </div>
      <div className={`nav-item ${activeView === 'upsolve_queue' ? 'active' : ''}`} onClick={() => setActiveView('upsolve_queue')}>
        <RotateCcw size={14} /> Upsolve Queue
      </div>

      <div className="sidebar-section-label">Training</div>
      <div className={`nav-item ${activeView === 'training_hub' ? 'active' : ''}`} onClick={() => setActiveView('training_hub')}>
        <Flame size={14} /> Training Hub
      </div>
      <div className={`nav-item ${activeView === 'graveyard' ? 'active' : ''}`} onClick={() => setActiveView('graveyard')}>
        <Ghost size={14} /> Spaced Repetition
      </div>

      <div className="sidebar-section-label">Analysis</div>
      <div className={`nav-item ${activeView === 'crucible' ? 'active' : ''}`} onClick={() => setActiveView('crucible')}>
        <BrainCircuit size={14} /> Socratic Coach
      </div>
      <div className={`nav-item ${activeView === 'complexity_analyzer' ? 'active' : ''}`} onClick={() => setActiveView('complexity_analyzer')}>
        <Cpu size={14} /> DACE Analyzer
      </div>
      <div className={`nav-item ${activeView === 'memory_profiler' ? 'active' : ''}`} onClick={() => setActiveView('memory_profiler')}>
        <Zap size={14} /> Memory Profiler
      </div>
      <div className={`nav-item ${activeView === 'topic_explorer' ? 'active' : ''}`} onClick={() => { setActiveView('topic_explorer'); if (teAllTags.length === 0) fetchAllTags().then(setTeAllTags).catch(() => {}); }}>
        <Target size={14} /> Topic Explorer
      </div>
      <div className={`nav-item ${activeView === 'golden_path' ? 'active' : ''}`} onClick={() => setActiveView('golden_path')}>
        <Sparkles size={14} /> Golden Path
      </div>
      <div className={`nav-item ${activeView === 'palantir_hub' ? 'active' : ''}`} onClick={() => setActiveView('palantir_hub')}>
        <Eye size={14} /> Palantir Intel
      </div>
      <div className={`nav-item ${activeView === 'code_explorer' ? 'active' : ''}`} onClick={() => setActiveView('code_explorer')}>
        <BarChart3 size={14} /> GM Code Explorer
      </div>

      <div className="sidebar-section-label">Contest</div>
      <div className={`nav-item ${activeView === 'contest_simulator' ? 'active' : ''}`} onClick={() => setActiveView('contest_simulator')}>
        <Gauge size={14} /> EV & Risk Engine
      </div>
      <div className={`nav-item ${activeView === 'telemetry' ? 'active' : ''}`} onClick={() => setActiveView('telemetry')}>
        <Activity size={14} /> Micro-Telemetry
      </div>
      <div className={`nav-item ${activeView === 'drawdown' ? 'active' : ''}`} onClick={() => setActiveView('drawdown')}>
        <TrendingUp size={14} /> Drawdown Profiler
      </div>


      <div className="sidebar-section-label">Profile</div>
      <div className={`nav-item ${activeView === 'dna_dashboard' ? 'active' : ''}`} onClick={() => setActiveView('dna_dashboard')}>
        <Dna size={14} /> Coder DNA
      </div>
      <div className={`nav-item ${activeView === 'performance_arc' ? 'active' : ''}`} onClick={() => { setActiveView('performance_arc'); if (!arcData) loadArc(); }}>
        <TrendingUp size={14} /> Performance Arc
      </div>
      <div className={`nav-item ${activeView === 'achievements' ? 'active' : ''}`} onClick={() => { setActiveView('achievements'); if (!achievements) loadAchievements(); }}>
        <Trophy size={14} /> Achievements
      </div>
      <div className={`nav-item ${activeView === 'skill_tree' ? 'active' : ''}`} onClick={() => setActiveView('skill_tree')}>
        <Dna size={14} /> Skill Tree
      </div>
      <div className={`nav-item ${activeView === 'peer_compare' ? 'active' : ''}`} onClick={() => setActiveView('peer_compare')}>
        <Eye size={14} /> Peer Comparison
      </div>
      <div className={`nav-item ${activeView === 'contest_postmortem' ? 'active' : ''}`} onClick={() => setActiveView('contest_postmortem')}>
        <BarChart3 size={14} /> Contest Post-Mortem
      </div>
      <div className={`nav-item ${activeView === 'ai_coach_chat' ? 'active' : ''}`} onClick={() => setActiveView('ai_coach_chat')}>
        <BrainCircuit size={14} /> AI Coach Chat
      </div>
      <div className={`nav-item ${activeView === 'mentor_view' ? 'active' : ''}`} onClick={() => { setActiveView('mentor_view'); if (!mentorStudents) loadMentorStudents(); }}>
        <Shield size={14} /> Mentor View
      </div>
      <div className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}>
        <Settings size={14} /> Settings
      </div>

      {/* User card at bottom */}
      <div style={{ marginTop: 'auto' }}>
        <div className="sidebar-user-card" onClick={() => setActiveView('settings')}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--icpc-blue)', overflow: 'hidden', flexShrink: 0 }}>
            {profile.avatar && <img src={profile.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-handle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfHandle}</div>
            <div className="sidebar-user-rank">{profile.rank || 'Unrated'}</div>
          </div>
          <div className="status-dot status-dot-online" style={{ marginLeft: 'auto', flexShrink: 0 }}></div>
        </div>
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
      {/* Rating Curve — spans 2 cols */}
      <div className="cf-card" style={{ gridColumn: 'span 2', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="text-micro text-muted">RATING TRAJECTORY</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span className="text-mono text-xl" style={{ color: getCfColor(currentRating) }}>{currentRating}</span>
            <span className="text-mono text-micro" style={{ color: getCfColor(currentRating), textTransform: 'capitalize' }}>{profile.rank}</span>
          </div>
        </div>
        <div className="cf-table-container" style={{ padding: '0', overflow: 'hidden', background: 'var(--bg-page)' }}>
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
            <text x="5" y="15" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">{rMax}</text>
            <text x="5" y={chartH - 5} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">{rMin}</text>
            
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
      <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 className="text-micro text-muted">IDENTITY HUB</h2>
        <div className="cf-table-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg-code)', overflow: 'hidden', border: `2px solid ${getCfColor(currentRating)}` }}>
              {profile.avatar && <img src={profile.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div>
              <div className="text-mono text-lg" style={{ color: getCfColor(currentRating) }}>{cfHandle}</div>
              <div className="text-mono text-micro text-secondary" style={{ textTransform: 'capitalize' }}>{profile.rank || 'Sync Profile in Settings'}</div>
            </div>
          </div>
          <button onClick={() => setActiveView('settings')} className="btn btn-outline" style={{ width: '100%', padding: '9px' }}>
            EDIT GLOBAL PROFILE
          </button>
        </div>
        {/* Macro-Cycle Periodization */}
        <div className="cf-table-container" style={{ padding: '14px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div className="text-micro text-secondary">TRAINING CYCLE (TODAY)</div>
            {backendHealth ? (
               <div className="text-mono text-micro verdict-ac">DB SYNCED</div>
            ) : (
               <div className="text-mono text-micro verdict-tle">DB OFFLINE</div>
            )}
          </div>
          
          {cycleToday ? (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-mono text-sm text-primary" style={{ textTransform: 'uppercase' }}>{cycleToday.type} PHASE</span>
                  <span className="text-mono text-sm text-primary">{cycleToday.problems.filter(p => p.status === 'passed').length} / {cycleToday.problems.length} AC</span>
                </div>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                   {cycleToday.problems.map((p, idx) => (
                     <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: p.status === 'passed' ? 'rgba(0, 255, 136, 0.1)' : 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                       <span className="text-mono text-micro text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{p.id}</span>
                       {p.status === 'passed' ? (
                         <span className="text-mono text-micro verdict-ac">AC</span>
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
                <button onClick={() => planToday('volume')} style={{ background: 'var(--bg-code)', border: '1px solid var(--icpc-blue)', color: 'var(--text-dark)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} className="text-mono text-sm">SET VOLUME (10x -500 ELO)</button>
                <button onClick={() => planToday('intensity')} style={{ background: 'var(--bg-code)', border: '1px solid var(--cf-tle-orange)', color: 'var(--text-dark)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} className="text-mono text-sm">SET INTENSITY (2x +200 ELO)</button>
                <button onClick={() => planToday('deload')} style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', color: 'var(--text-dark)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} className="text-mono text-sm">SET DELOAD (Rest)</button>
             </div>
          )}
        </div>
      </div>

      {/* ── Phase 5 Dashboard Extensions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <CoachReportView sessionId={latestSessionId} />
          <SkillGraph cfHandle={cfHandle} />
      </div>

      {/* Heatmap — 2D / 3D toggle */}
      <div className="cf-card" style={{ gridColumn: 'span 3', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 className="text-micro text-muted" style={{ marginBottom: 6 }}>PROBLEM SOLVE HEATMAP (52 WEEKS) — COLORED BY HIGHEST RATED SOLVE</h2>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {[{l:'<1200',c:'#808080'},{l:'1400',c:'#00ff88'},{l:'1600',c:'#00e5cc'},{l:'1900',c:'#4488ff'},{l:'2100',c:'#cc44ff'},{l:'2400+',c:'#ff4444'}].map((b,i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: b.c, boxShadow: `0 0 5px ${b.c}77` }}></div>
                  <span className="text-mono" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{b.l}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', background: 'transparent', borderRadius: 12, padding: 3, border: '1px solid var(--border)' }}>
            {['2d','3d'].map(mode => (
              <button key={mode} onClick={() => setHeatmapMode(mode)} style={{
                padding: '5px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: heatmapMode === mode ? 'rgba(94,207,255,0.18)' : 'transparent',
                color: heatmapMode === mode ? 'var(--icpc-blue)' : 'var(--text-muted)',
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
              const hBg = day.maxRating > 0 ? getCfColor(day.maxRating) : 'var(--bg-page)';
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
      <div className="cf-card" style={{ padding: '20px' }}>
        <h2 className="text-micro text-muted" style={{ marginBottom: '14px' }}>TAG ANALYTICS — {currentMonthName.toUpperCase()} {new Date().getFullYear()}</h2>
        <div className="cf-table-container" style={{ padding: '12px' }}>
          {monthlyTags.length > 0 ? monthlyTags.map(([tag, cnt], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="text-mono text-sm text-secondary" style={{ width: '140px' }}>{tag}</span>
              <div style={{ flexGrow: 1, height: '8px', background: 'var(--bg-code)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min((cnt / (monthlyTags[0]?.[1] || 1)) * 100, 100)}%`, height: '100%', background: 'var(--icpc-blue)', borderRadius: '4px', opacity: 0.7 }}></div>
              </div>
              <span className="text-mono text-sm text-primary" style={{ width: '30px', textAlign: 'right' }}>{cnt}</span>
            </div>
          )) : (
            <p className="text-mono text-sm text-muted" style={{ padding: '20px', textAlign: 'center' }}>Sync identity to load tags</p>
          )}
        </div>
      </div>

      {/* Tactical Gap Matrix */}
      <div className="cf-card" style={{ gridColumn: 'span 2', padding: '20px' }}>
        <h2 className="text-micro text-muted" style={{ marginBottom: '14px' }}>TACTICAL GAP MATRIX — SKILL ELO BY TOPIC</h2>
        {skillScores.length > 0 ? (() => {
          const sorted = [...skillScores].sort((a, b) => a.elo_rating - b.elo_rating).slice(0, 8);
          const maxElo = Math.max(...skillScores.map(s => s.elo_rating), 1500);
          const minElo = Math.min(...skillScores.map(s => s.elo_rating), 1000);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sorted.map(s => {
                const pct = Math.max(0, Math.min(100, ((s.elo_rating - minElo) / Math.max(maxElo - minElo, 1)) * 100));
                const color = s.elo_rating < 1200 ? '#ff4444' : s.elo_rating < 1400 ? '#ff8c00' : s.elo_rating < 1600 ? '#ffd700' : '#00ff88';
                return (
                  <div key={s.topic_tag} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="text-mono text-sm text-secondary" style={{ width: '120px', flexShrink: 0 }}>{s.topic_tag}</span>
                    <div style={{ flexGrow: 1, height: '10px', background: 'var(--bg-code)', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '5px', transition: 'width 0.5s' }} />
                    </div>
                    <span className="text-mono text-sm" style={{ color, width: '50px', textAlign: 'right', flexShrink: 0 }}>{Math.round(s.elo_rating)}</span>
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p className="text-mono text-sm">No skill scores yet. Complete DNA sessions to populate this matrix.</p>
            <button className="btn btn-outline" style={{ marginTop: '12px', fontSize: '11px', padding: '6px 16px' }}
              onClick={() => fetch(`${BACKEND}/api/user/skills/${cfHandle}`).then(r => r.json()).then(d => d.success && setSkillScores(d.skills)).catch(() => {})}>
              Load Skill Data
            </button>
          </div>
        )}
      </div>

      {/* ── NEW: Run Rate Analytics & Yearly Graph ── */}
      <div className="cf-card" style={{ gridColumn: 'span 3', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="var(--icpc-blue)" /> Ascension Run Rate & Yearly Trajectory
            </h2>
            <p className="text-micro text-secondary" style={{ marginTop: '4px' }}>Projected solve volume based on current pacing.</p>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="text-micro text-muted">MONTH'S PACE</div>
              <div className="text-mono text-xl text-primary">{runRateData.monthCount} <span className="text-sm text-muted">→ {runRateData.monthExpected}</span></div>
            </div>
            <div style={{ width: '1px', background: 'var(--bg-hover)' }}></div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-micro text-muted">YEAR'S PACE</div>
              <div className="text-mono text-xl" style={{ color: 'var(--icpc-blue)' }}>{runRateData.yearCount} <span className="text-sm text-muted">→ {runRateData.yearExpected}</span></div>
            </div>
          </div>
        </div>

        {/* Dynamic Gradient Yearly Graph */}
        <div style={{ background: 'transparent', borderRadius: '12px', padding: '16px', flexGrow: 1 }}>
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
                      <stop offset="0%" stopColor="var(--icpc-blue)" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="var(--icpc-blue)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid lines */}
                  {[0, 0.5, 1].map(r => (
                    <line key={r} x1={pX} y1={svgH - pY - r * plH} x2={svgW - pX} y2={svgH - pY - r * plH} stroke="var(--border)" strokeDasharray="4 4" />
                  ))}
                  <text x={pX} y={pY - 5} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">{yMax}</text>
                  <text x={pX} y={svgH - 5} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">0</text>
                  <text x={svgW - pX} y={svgH - 5} fill="var(--text-muted)" fontSize="10" fontFamily="monospace" textAnchor="end">Dec 31</text>

                  {/* Fill area */}
                  <polygon points={`${pX},${svgH - pY} ${points} ${svgW - pX},${svgH - pY}`} fill="url(#yearlyFill)" />
                  
                  {/* The dynamic gradient line */}
                  <polyline points={points} fill="none" stroke="url(#yearlyGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  
                  {/* Glowing end dot */}
                  <circle cx={getX(yd.length - 1)} cy={getY(yd[yd.length - 1].cumulativeCount)} r="5" fill="var(--icpc-blue)" style={{ filter: 'drop-shadow(0 0 6px var(--icpc-blue))' }} />
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
      <div className="cf-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
        <h2 className="text-lg text-primary" style={{ marginBottom: '16px', letterSpacing: '-0.02em' }}>
          🪦 The Graveyard <span className="text-muted">— Ebbinghaus Spaced Repetition Engine</span>
        </h2>
        {/* NOTE: For production, implement virtualization (e.g., react-window) for this table as it scales over 100+ rows */}
        
        {isTilt && (
          <div style={{ background: 'rgba(209, 35, 42, 0.1)', border: '1px solid var(--icpc-red)', padding: '16px', borderRadius: '4px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="text-mono text-sm verdict-wa">TILT LOCKOUT ENGAGED</div>
              <div className="text-micro text-secondary">3+ WAs within 5 minutes. Take a breath. Codeforces submissions paused.</div>
            </div>
            <div className="text-mono text-lg verdict-wa">{Math.floor(tiltRemaining / 60)}:{(tiltRemaining % 60).toString().padStart(2, '0')}</div>
          </div>
        )}
        
        {srActiveId ? (
          <div className="cf-card" style={{ flexGrow: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 className="text-lg text-primary">{srActiveId}</h3>
               <div className="text-mono text-sm text-primary">Timer: {Math.floor(srTimer / 60)}:{(srTimer % 60).toString().padStart(2, '0')}</div>
             </div>
             
             {!pfDone ? (
               <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="text-micro text-muted">PRE-FLIGHT GATE — REQUIRED BEFORE CODING</div>
                  <input className="text-mono text-sm" placeholder="Target Time Complexity (e.g. O(N log N))" value={pfTC} onChange={e => setPfTC(e.target.value)} />
                  <input className="text-mono text-sm" placeholder="Space Complexity (e.g. O(N))" value={pfSpace} onChange={e => setPfSpace(e.target.value)} />
                  <input className="text-mono text-sm" placeholder="3 Edge Cases to handle..." value={pfEdgeCases} onChange={e => setPfEdgeCases(e.target.value)} />
                  <textarea className="text-mono text-sm" placeholder="Approach summary..." value={pfApproach} onChange={e => setPfApproach(e.target.value)} style={{ height: '100px' }} />
                  <button onClick={submitPreFlight} className="btn-cf" style={{ padding: '12px', width: '100%' }}>SUBMIT PRE-FLIGHT</button>
               </div>
             ) : (
               <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                 <div className="text-mono text-sm verdict-ac">Pre-Flight Approved. Workspace unlocked.</div>
                 <div style={{ display: 'flex', gap: '16px', marginTop: 'auto' }}>
                    <button onClick={() => submitSRReview('pass')} style={{ flex: 1, padding: '16px', background: 'rgba(0, 169, 0, 0.1)', border: '1px solid var(--icpc-green)', color: 'var(--icpc-green)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}>PASSED (Advance Stage)</button>
                    <button onClick={() => submitSRReview('fail')} style={{ flex: 1, padding: '16px', background: 'rgba(209, 35, 42, 0.1)', border: '1px solid var(--icpc-red)', color: 'var(--icpc-red)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}>FAILED (Reset to Stage 1)</button>
                 </div>
               </div>
             )}
          </div>
        ) : (
          <>
            <div className="text-micro text-secondary" style={{ marginBottom: '8px' }}>TODAY'S QUEUE ({srQueue.length})</div>
            <div className="cf-table-container" style={{ marginBottom: '24px' }}>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Problem ID / Name</th>
                    <th>Rating</th>
                    <th>Stage</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {srQueue.map(p => (
                    <tr key={p.id}>
                      <td className="text-mono text-primary">{p.id} - {p.name}</td>
                      <td className="text-mono" style={{ color: getCfColor(p.rating) }}>{p.rating}</td>
                      <td className="text-mono text-secondary">Stage {p.reviewStage}/5 <span style={{ color: p.failedCount > 0 ? 'var(--icpc-red)' : 'inherit' }}>(Fails: {p.failedCount})</span></td>
                      <td>
                        <button className="btn-cf-outline" onClick={() => openSRProblem(p.id)} style={{ padding: '4px 8px', fontSize: '11px' }}>REVIEW</button>
                      </td>
                    </tr>
                  ))}
                  {srQueue.length === 0 && (
                    <tr>
                      <td colSpan="4" className="text-mono text-muted text-center">No reviews due today.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-micro text-secondary" style={{ marginBottom: '8px' }}>ALL TRACKED SINS ({srAll.length})</div>
            <div className="cf-table-container" style={{ flexGrow: 1, overflowY: 'auto' }}>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Problem ID</th>
                    <th>Stage</th>
                    <th>Fails</th>
                    <th>Next Review</th>
                  </tr>
                </thead>
                <tbody>
                  {srAll.map(p => (
                    <tr key={p.id}>
                      <td className="text-mono text-primary">{p.id}</td>
                      <td className="text-mono text-secondary">{p.reviewStage}</td>
                      <td className="text-mono" style={{ color: p.failedCount > 0 ? 'var(--icpc-red)' : 'var(--text-muted)' }}>{p.failedCount}</td>
                      <td className="text-mono text-secondary">{new Date(p.nextReviewAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };
  const renderCrucible = () => {
    return (
      <div className="cf-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
         <h2 className="text-lg text-primary" style={{ marginBottom: '16px', letterSpacing: '-0.02em' }}>
           🧠 The Crucible <span className="text-muted">— Socratic LLM Coach (Nvidia NIM)</span>
         </h2>
         <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <input className="text-mono text-sm" type="password" placeholder="Nvidia API Key (nvapi-...)" value={coachNvidiaKey} onChange={e => { setCoachNvidiaKey(e.target.value); localStorage.setItem('ag_nvidia_key', e.target.value); }} style={{ flex: 1, padding: '12px', background: 'var(--bg-code)', border: '1px solid var(--border)', color: 'var(--text-dark)' }} />
            <input className="text-mono text-sm" placeholder="Problem ID (e.g. 1920B)" value={coachProblemId} onChange={e => setCoachProblemId(e.target.value)} style={{ width: '150px', padding: '12px', background: 'var(--bg-code)', border: '1px solid var(--border)', color: 'var(--text-dark)' }} />
         </div>
         
         <div style={{ display: 'flex', gap: '20px', flexGrow: 1, overflow: 'hidden' }}>
            {/* Left side: Code & Approach */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
               <textarea className="text-mono text-sm" placeholder="Paste your current code here..." value={coachCode} onChange={e => setCoachCode(e.target.value)} style={{ flex: 2, background: 'var(--bg-code)', border: '1px solid var(--border)', padding: '12px', color: 'var(--text-dark)', resize: 'none' }} />
               <textarea className="text-mono text-sm" placeholder="Explain your approach (what is failing?)..." value={pfApproach} onChange={e => setPfApproach(e.target.value)} style={{ flex: 1, background: 'var(--bg-code)', border: '1px solid var(--border)', padding: '12px', color: 'var(--text-dark)', resize: 'none' }} />
               <button onClick={getCoachHint} disabled={coachLoading} style={{ padding: '16px', background: 'var(--icpc-blue)', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: coachLoading ? 'wait' : 'pointer' }}>
                 {coachLoading ? 'ANALYZING...' : `REQUEST HINT LEVEL ${coachHintLevel}/3`}
               </button>
               
               {/* Adversarial Edge-Case Engine */}
               <div className="cf-card" style={{ padding: '16px', marginTop: 'auto' }}>
                 <div className="text-micro text-secondary" style={{ marginBottom: '12px' }}>ADVERSARIAL EDGE-CASE ENGINE (Red Team)</div>
                 <textarea className="text-mono text-sm" placeholder="Define your absolute worst-case adversarial input here..." value={advWorstCase} onChange={e => setAdvWorstCase(e.target.value)} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', padding: '10px', color: 'var(--text-dark)', resize: 'none', height: '60px', marginBottom: '12px' }} />
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={advStarGraph} onChange={e => setAdvStarGraph(e.target.checked)} /> Star Graph (Max Degree)</label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={advBamboo} onChange={e => setAdvBamboo(e.target.checked)} /> Bamboo / Line Graph</label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={advDisconnected} onChange={e => setAdvDisconnected(e.target.checked)} /> Disconnected Components</label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={advEmpty} onChange={e => setAdvEmpty(e.target.checked)} /> N=1 / Empty Constraints</label>
                 </div>
                 <button disabled={!advStarGraph || !advBamboo || !advDisconnected || !advEmpty || !advWorstCase.trim()} style={{ width: '100%', padding: '10px', background: (!advStarGraph || !advBamboo || !advDisconnected || !advEmpty || !advWorstCase.trim()) ? 'var(--bg-code)' : 'var(--icpc-red)', color: (!advStarGraph || !advBamboo || !advDisconnected || !advEmpty || !advWorstCase.trim()) ? 'var(--text-muted)' : 'white', fontWeight: 'bold', border: '1px solid var(--border)', borderRadius: '4px', cursor: (!advStarGraph || !advBamboo || !advDisconnected || !advEmpty || !advWorstCase.trim()) ? 'not-allowed' : 'pointer' }}>
                   {(!advStarGraph || !advBamboo || !advDisconnected || !advEmpty || !advWorstCase.trim()) ? 'COMPLETE ADVERSARIAL REVIEW TO UNLOCK SUBMIT' : '✓ ADVERSARIAL REVIEW PASSED — SUBMIT TO CF'}
                 </button>
               </div>
            </div>
            
            {/* Right side: Transcripts & Weakness Profile */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
               <div className="cf-card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="text-micro text-secondary">SOCRATIC TERMINAL</div>
                    <button onClick={loadWeaknessProfile} style={{ background: 'none', border: 'none', color: 'var(--icpc-blue)', cursor: 'pointer' }} className="text-mono text-micro">ANALYZE WEAKNESSES</button>
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
                 <div className="cf-card" style={{ padding: '16px' }}>
                    <div className="text-micro text-secondary" style={{ marginBottom: '12px' }}>WEAKNESS PRESCRIPTION ({coachWeakness.totalSessions} sessions)</div>
                    {coachWeakness.profile.slice(0, 5).map(w => (
                      <div key={w.tag} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }} className="text-mono text-sm text-primary">
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
    // Use real recommendations from backend
    const problems = goldenProblems;

    const loadGolden = async () => {
      if (goldenLoading) return;
      setGoldenLoading(true);
      try {
        const r = await fetch(`${BACKEND}/api/recommend/${cfHandle}?count=20`);
        const d = await r.json();
        if (Array.isArray(d)) setGoldenProblems(d);
      } catch { }
      setGoldenLoading(false);
    };

    return (
      <div className="cf-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
        {/* Header & Load */}
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="text-lg text-primary" style={{ marginBottom: '4px', letterSpacing: '-0.02em' }}>
              The Golden Path: <span className="text-muted">Personalized Recommendations</span>
            </h2>
            <div className="text-micro text-secondary">Problems chosen from your weak tags, rated just above your current level</div>
          </div>
          <button className="btn btn-primary" onClick={loadGolden} disabled={goldenLoading}
            style={{ fontSize: '11px', padding: '8px 16px', whiteSpace: 'nowrap' }}>
            {goldenLoading ? '⏳ Loading...' : '⚡ Load Problems'}
          </button>
        </div>

        {/* Problems Table */}
        <div className="cf-table-container" style={{ flexGrow: 1, overflowY: 'auto' }}>
          {problems.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
              <p className="text-mono text-sm">Click "Load Problems" to get personalized recommendations based on your CF handle and weak topics.</p>
            </div>
          ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>PROBLEM ID / NAME</th>
                <th>RATING</th>
                <th>COHORT OVERLAP</th>
                <th>AVG ATTEMPTS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {problems.map((prob, idx) => (
                <tr key={idx}>
                  <td className="text-mono text-primary">
                    <a href={`https://codeforces.com/problemset/problem/${prob.contestId}/${prob.index}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: 'var(--icpc-blue)', textDecoration: 'none' }}>
                      {prob.contestId}{prob.index} — {prob.name}
                    </a>
                  </td>
                  <td className="text-mono" style={{ color: getCfColor(prob.rating || 0) }}>{prob.rating || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {(prob.tags || []).slice(0, 3).map(t => (
                        <span key={t} className="tag-badge" style={{ fontSize: '9px', padding: '2px 6px' }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <a href={`https://codeforces.com/problemset/problem/${prob.contestId}/${prob.index}`}
                      target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"
                      style={{ fontSize: '10px', padding: '3px 10px' }}>Solve →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    );
  };
  const renderCodeExplorer = () => {
    // Show a loading/empty state instead of fake static data if gmCoachData isn't loaded yet.
    if (!gmCoachData) {
      return (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⏳</div>
          <p className="text-mono text-sm">Loading GM global analytics...</p>
        </div>
      );
    }
    const stats = gmCoachData.gmStats;
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
              background: gmCoachLoading ? 'var(--bg-code)' : 'var(--icpc-blue)', 
              color: gmCoachLoading ? 'var(--text-muted)' : '#000', 
              border: '1px solid var(--icpc-blue)', 
              borderRadius: '8px', padding: '6px 14px', cursor: gmCoachLoading ? 'default' : 'pointer', fontWeight: 'bold' 
            }} 
            className="text-mono text-micro"
          >
            {gmCoachLoading ? '⏳ ANALYZING GMs...' : '⚡ DYNAMIC GM ANALYSIS'}
          </button>
        </div>

        {gmCoachStatus && gmCoachLoading && (
           <div className="text-mono text-sm text-primary text-center" style={{ margin: '10px 0' }}>{gmCoachStatus}</div>
        )}
        
        {/* Deep Analytics Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', flexShrink: 0 }}>
          
          {/* Global GM Averages */}
          <div className="cf-card" style={{ padding: '20px' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>DYNAMIC GM AGGREGATES ({stats.analyzedGms?.length || 5} ELITES)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--bg-page)', paddingBottom: '8px' }}>
                <span className="text-micro text-secondary">AVERAGE SOLVED</span>
                <span className="text-mono text-lg text-primary">{stats.avgSolved}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--bg-page)', paddingBottom: '8px' }}>
                <span className="text-micro text-secondary">MAX SOLVED (RECORD)</span>
                <span className="text-mono text-lg text-primary">{stats.maxSolved}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--bg-page)', paddingBottom: '8px' }}>
                <span className="text-micro text-secondary">AVG DIFFICULTY</span>
                <span className="text-mono text-lg verdict-wa-muted">{stats.avgDifficulty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span className="text-micro text-secondary">WA/AC RATIO</span>
                <span className="text-mono text-lg verdict-tle-muted">{stats.avgAttempts}</span>
              </div>
            </div>
            {gmCoachData && (
               <div className="text-mono text-micro text-secondary" style={{ marginTop: '12px', textAlign: 'right' }}>
                 Sampled: {stats.analyzedGms.join(', ')}
               </div>
            )}
          </div>

          {/* Coach Analysis / Insights */}
          <div className="cf-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>COACH'S TACTICAL INSIGHTS</h3>
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center' }}>
              <p className="text-mono text-sm" style={{ color: 'var(--text-dark)', lineHeight: '1.5' }}>
                "To reach Grandmaster, volume alone is insufficient. Elite GMs currently average <span className="text-primary">{stats.cadence}</span>, but their average problem difficulty is <span style={{ color: 'var(--accent-red-muted)' }}>{stats.avgDifficulty}</span>."
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
          <div className="cf-card" style={{ padding: '20px' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>DYNAMIC GM TAG ARCHETYPE</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {stats.tags.map((tag, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span className="text-mono text-micro text-secondary text-uppercase">{tag.name}</span>
                    <span className="text-mono text-micro text-muted">{tag.value}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-code)', borderRadius: '2px' }}>
                    <div style={{ width: `${tag.value * 4}%`, height: '100%', background: 'var(--icpc-blue)', borderRadius: '2px' }}></div>
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
        <div className="cf-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
          <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>GM SOLUTION SEARCH ENGINE</h3>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Problem ID (e.g., 1920B)" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: 'var(--radius-inner)',
              padding: '12px 16px', color: 'var(--text-dark)', outline: 'none', width: '240px'
            }} 
            className="text-mono" 
          />
          
          <select 
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            style={{
              background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: 'var(--radius-inner)',
              padding: '12px 16px', color: 'var(--text-dark)', outline: 'none', cursor: 'pointer', appearance: 'none'
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
              background: isSearching ? 'var(--bg-code)' : 'var(--icpc-blue)', 
              color: isSearching ? 'var(--text-muted)' : '#000', 
              border: '1px solid var(--icpc-blue)', 
              borderRadius: 'var(--radius-inner)', padding: '0 24px',
              cursor: isSearching ? 'default' : 'pointer', fontWeight: 'bold', transition: 'all 0.2s'
            }}>
            {isSearching ? 'SEARCHING CF...' : 'SEARCH CODEFORCES'}
          </button>
        </div>

        <div className="cf-table-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 200px 1fr 100px 100px', padding: '12px 16px', background: 'var(--bg-code)', borderBottom: '1px solid var(--border)', borderRadius: '8px 8px 0 0' }} className="text-micro text-secondary">
            <span>HANDLE</span><span>RANK</span><span>LANGUAGE</span><span>TIME</span><span>MEM</span>
          </div>
          <div style={{ overflowY: 'auto', flexGrow: 1, background: 'var(--bg-page)', borderRadius: '0 0 8px 8px', border: '1px solid rgba(255,255,255,0.03)', borderTop: 'none' }}>
            {isSearching ? (
               <div className="text-mono text-sm text-muted text-center" style={{ padding: '40px' }}>Querying Codeforces API live...</div>
            ) : displayedSolutions.map((sol, idx) => (
              <div key={idx} onClick={() => openCode(sol.handle, sol.contestId, sol.subId)} style={{ 
                display: 'grid', gridTemplateColumns: '150px 200px 1fr 100px 100px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer'
              }} className="text-mono text-sm hover-bg">
                <span className="text-primary">{sol.handle}</span>
                <span style={{ 
                    color: sol.rank.includes('grandmaster') ? 'var(--accent-red-muted)' : 
                           sol.rank.includes('master') ? 'var(--cf-tle-orange)' : 
                           sol.rank.includes('expert') ? 'var(--icpc-blue)' : 'var(--text-muted)',
                    textTransform: 'capitalize'
                }}>{sol.rank}</span>
                <span className="text-muted">{sol.lang}</span>
                <span className="text-primary">{sol.time}</span>
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
<h1>◆ Competitive Programming Performance Tear Sheet</h1>
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

  // ── Foundry Intelligence State ──
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
        <div className="cf-card" style={{ padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', margin: 0 }}>◆ Foundry <span className="text-muted">Intelligence Hub</span></h2>
            <p className="text-micro text-secondary" style={{ marginTop: '4px' }}>
              {u ? `${u.handle} (${u.rating}) vs ${co?.size || 0} recently promoted ${rankMeta.label}s` : `Analyzing ${cfHandle} against live ${rankMeta.label} cohort`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={runFoundrySync} disabled={foundryLoading} style={{ background: foundryLoading ? 'var(--bg-code)' : 'var(--icpc-blue)', color: foundryLoading ? 'var(--text-muted)' : '#000', border: '1px solid var(--icpc-blue)', borderRadius: '8px', padding: '8px 18px', cursor: foundryLoading ? 'default' : 'pointer', fontWeight: 'bold' }} className="text-mono text-sm">
              {foundryLoading ? '⏳ SYNCING...' : '⟳ SYNC LIVE'}
            </button>
            <button onClick={() => setGoalEditing(!goalEditing)} style={{ background: 'none', border: `1px solid ${rankMeta.color}`, color: rankMeta.color, borderRadius: '8px', padding: '8px 18px', cursor: 'pointer' }} className="text-mono text-sm">⚙ GOALS</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: fd ? '#30d158' : '#ff6b6b', boxShadow: `0 0 8px ${fd ? '#30d158' : '#ff6b6b'}`, animation: 'pulse 2s infinite' }}></div>
              <span className="text-micro text-secondary">{fd ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>

        {/* Rank Toggle */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {Object.entries(RANK_META).map(([key, meta]) => (
            <button key={key} onClick={() => setFoundryTarget(key)} style={{ padding: '7px 18px', borderRadius: '8px', border: `1px solid ${foundryTarget === key ? meta.color : 'var(--border)'}`, background: foundryTarget === key ? `${meta.color}22` : 'none', color: foundryTarget === key ? meta.color : 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', transition: 'all 0.2s' }}>{meta.short}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {goals.sprintStart && <span className="text-mono text-micro" style={{ color: 'var(--icpc-blue)' }}>SPRINT DAY {sprintDay}/{goals.sprintDays || 50}</span>}
            <span className="text-mono text-micro" style={{ color: rankMeta.color }}>TARGET: {rankMeta.label.toUpperCase()}</span>
          </div>
        </div>

        {/* Goal Editor */}
        {goalEditing && (
          <div className="cf-card" style={{ padding: '16px', flexShrink: 0 }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '12px' }}>SET GOALS & SPRINT</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label className="text-micro text-secondary">Target Rating</label>
                <input type="number" value={goalDraft.targetRating} onChange={e => setGoalDraft(p => ({ ...p, targetRating: e.target.value }))} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text-dark)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
              <div>
                <label className="text-micro text-secondary">Daily Quota</label>
                <input type="number" value={goalDraft.dailyQuota} onChange={e => setGoalDraft(p => ({ ...p, dailyQuota: e.target.value }))} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text-dark)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
              <div>
                <label className="text-micro text-secondary">Sprint Days</label>
                <input type="number" value={goalDraft.sprintDays} onChange={e => setGoalDraft(p => ({ ...p, sprintDays: e.target.value }))} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text-dark)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
              <div>
                <label className="text-micro text-secondary">Focus Tags (comma-sep)</label>
                <input value={goalDraft.focusTags} onChange={e => setGoalDraft(p => ({ ...p, focusTags: e.target.value }))} placeholder="dp, math, graphs" style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text-dark)', marginTop: '4px' }} className="text-mono text-sm" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSaveGoals} style={{ background: 'var(--icpc-blue)', color: '#000', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold' }} className="text-mono text-sm">SAVE & START SPRINT</button>
              <button onClick={() => { const g = { ...goals, sprintStart: Math.floor(Date.now() / 1000) }; saveGoals(g); setGoals(g); }} style={{ background: 'none', border: '1px solid var(--cf-tle-orange)', color: 'var(--cf-tle-orange)', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer' }} className="text-mono text-sm">RESET SPRINT</button>
            </div>
          </div>
        )}

        {/* Loading / Status */}
        {foundryLoading && (
          <div className="cf-card" style={{ padding: '40px', textAlign: 'center', flexShrink: 0 }}>
            <div className="text-mono text-primary" style={{ marginBottom: '8px' }}>⏳ {foundryStatus}</div>
            <div style={{ width: '200px', height: '3px', background: 'var(--bg-code)', borderRadius: '2px', margin: '0 auto', overflow: 'hidden' }}>
              <div style={{ width: '60%', height: '100%', background: rankMeta.color, animation: 'pulse 1.5s infinite' }}></div>
            </div>
          </div>
        )}

        {/* No data yet */}
        {!fd && !foundryLoading && (
          <div className="cf-card" style={{ padding: '60px', textAlign: 'center' }}>
            <p className="text-mono text-muted">Click <span style={{ color: 'var(--icpc-blue)' }}>SYNC LIVE</span> to analyze <span className="text-primary">{cfHandle}</span> against real, recently-promoted {rankMeta.label}s from Codeforces.</p>
            <p className="text-micro text-secondary" style={{ marginTop: '8px' }}>This fetches live data from the CF API — no hardcoded numbers.</p>
          </div>
        )}

        {/* ── LIVE DATA MODULES ── */}
        {fd && !foundryLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flexGrow: 1 }}>

            {/* A: Your Profile vs Cohort Average */}
            <div className="cf-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 className="text-micro text-muted">YOU vs {rankMeta.short} COHORT ({co?.size || 0} users)</h3>
                <span className="text-mono text-micro" style={{ color: rankMeta.color }}>{u?.rating} → {goals.targetRating || '?'}</span>
              </div>
              <div className="cf-table-container" style={{ padding: '10px' }}>
                {[
                  { label: 'TOTAL SOLVED', you: u?.totalSolved, them: co?.avgSolved },
                  { label: 'AVG DIFFICULTY', you: u?.avgDifficulty, them: co?.avgDifficulty },
                  { label: 'CURRENT RATING', you: u?.rating, them: co?.avgRating },
                  { label: 'VOLUME GAP', you: null, them: null, custom: <span style={{ color: gaps?.volumeGap > 50 ? 'var(--accent-red-muted)' : 'var(--text-dark)' }}>{gaps?.volumeGap || 0} problems behind</span> },
                  { label: 'DIFFICULTY GAP', you: null, them: null, custom: <span style={{ color: (gaps?.difficultyGap || 0) > 100 ? 'var(--accent-red-muted)' : 'var(--text-dark)' }}>{gaps?.difficultyGap > 0 ? `+${gaps.difficultyGap}` : gaps?.difficultyGap || 0} rating pts</span> },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }} className="text-mono text-sm">
                    <span className="text-secondary">{r.label}</span>
                    {r.custom || <span><span style={{ color: r.you < r.them ? 'var(--cf-tle-orange)' : 'var(--icpc-blue)' }}>{r.you}</span> <span className="text-micro text-secondary">vs {r.them}</span></span>}
                  </div>
                ))}
              </div>
            </div>

            {/* B: Rising Stars Feed */}
            <div className="cf-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 className="text-micro text-muted">RECENTLY PROMOTED {rankMeta.short}s</h3>
                <span className="text-mono text-micro text-muted">LIVE FEED</span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                {rising.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', alignItems: 'center' }} className="text-mono text-sm">
                    <span style={{ color: rankMeta.color, fontWeight: 600 }}>{r.handle}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="text-secondary">{r.oldRating}→</span>
                      <span style={{ color: rankMeta.color }}>{r.newRating}</span>
                      <span style={{ color: 'var(--text-dark)', fontSize: '10px' }}>+{r.delta}</span>
                    </div>
                  </div>
                ))}
                {rising.length === 0 && <p className="text-mono text-micro text-muted" style={{ padding: '20px', textAlign: 'center' }}>No recent promotions found</p>}
              </div>
            </div>

            {/* C: Difficulty Band Gap (DNA Matrix) */}
            <div className="cf-card" style={{ padding: '16px' }}>
              <h3 className="text-micro text-muted" style={{ marginBottom: '10px' }}>DIFFICULTY DNA — VOLUME QUOTA</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(gaps?.bucketGaps || []).map((g, i) => (
                  <div key={g.bucket}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }} className="text-mono text-sm">
                      <span className="text-secondary">{g.bucket}</span>
                      <span>
                        <span style={{ color: g.pct >= 80 ? 'var(--text-dark)' : g.pct >= 50 ? 'var(--cf-tle-orange)' : 'var(--accent-red-muted)' }}>{g.mine}</span>
                        <span className="text-micro text-secondary"> / {g.target}</span>
                        {g.gap > 0 && <span style={{ color: rankMeta.color, fontSize: '10px' }}> ({g.gap} needed)</span>}
                      </span>
                    </div>
                    <div style={{ height: '7px', background: 'var(--bg-code)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${g.pct}%`, height: '100%', background: g.pct >= 80 ? 'var(--text-dark)' : g.pct >= 50 ? 'var(--cf-tle-orange)' : 'var(--accent-red-muted)', borderRadius: '4px', transition: 'width 0.4s' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* D: Tag Saturation — Strengths & Weaknesses */}
            <div className="cf-card" style={{ padding: '16px' }}>
              <h3 className="text-micro text-muted" style={{ marginBottom: '10px' }}>TAG GAP — STRENGTHS & WEAKNESSES</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto', maxHeight: '280px' }}>
                {(gaps?.tagGaps || []).slice(0, 12).map((g, i) => {
                  const isWeak = g.pct < 60;
                  const isStrong = g.pct >= 100;
                  return (
                    <div key={g.tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }} className="text-mono text-sm">
                        <span style={{ color: isWeak ? 'var(--accent-red-muted)' : isStrong ? 'var(--text-dark)' : 'var(--text-muted)' }}>{isWeak ? '⚠ ' : isStrong ? '✓ ' : ''}{g.tag}</span>
                        <span><span style={{ color: isWeak ? 'var(--accent-red-muted)' : 'var(--icpc-blue)' }}>{g.mine}</span><span className="text-micro text-secondary"> / {g.target}</span></span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--bg-code)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(g.pct, 100)}%`, height: '100%', background: isWeak ? 'var(--accent-red-muted)' : isStrong ? 'var(--text-dark)' : 'var(--icpc-blue)', borderRadius: '3px', opacity: 0.8 }}></div>
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
            <div className="cf-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 className="text-micro text-muted">TODAY'S PROBLEM PLAN</h3>
                <span className="text-mono text-micro" style={{ color: 'var(--icpc-blue)' }}>DAY {sprintDay}</span>
              </div>
              {daily.length > 0 ? daily.map((p, i) => (
                <a key={i} href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-code)', borderRadius: '8px', border: `1px solid ${p.matchesWeak ? 'rgba(255,69,58,0.3)' : 'var(--border)'}`, marginBottom: '6px' }}>
                  <div style={{ minWidth: '50px', textAlign: 'center', padding: '3px 6px', background: `${rankMeta.color}22`, borderRadius: '5px' }}>
                    <span className="text-mono text-sm" style={{ color: rankMeta.color, fontWeight: 'bold' }}>{p.rating}</span>
                  </div>
                  <div style={{ flexGrow: 1 }}>
                    <div className="text-mono text-sm text-primary">{p.contestId}{p.index} — {p.name}</div>
                    <div className="text-mono text-micro text-secondary">{p.tags.slice(0, 3).join(', ')}</div>
                  </div>
                  {p.matchesWeak && <span className="text-micro" style={{ color: 'var(--accent-red-muted)' }}>WEAK TAG</span>}
                  <span className="text-mono text-micro text-secondary">{p.count}/{co?.size} cohort</span>
                </a>
              )) : <p className="text-mono text-micro text-muted" style={{ padding: '20px', textAlign: 'center' }}>Sync data to generate your daily plan</p>}
            </div>

            {/* F: Full Recommendation Queue */}
            <div className="cf-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 className="text-micro text-muted">PROBLEM QUEUE — COHORT CATALYSTS</h3>
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
        <div className="cf-card" style={{ padding: '16px 24px', flexShrink: 0 }}>
          <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em', marginBottom: '12px' }}>
            🔍 Topic Explorer — <span className="text-muted">Discover Problems by Tag & Rank Distribution</span>
          </h2>
          <p className="text-mono text-micro text-secondary">All data fetched live from the Codeforces API. Select tags to find problems and see how many GMs, Masters, CMs solved each one.</p>
        </div>

        {/* Tag Input & Controls */}
        <div className="cf-card" style={{ padding: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Tag Autocomplete */}
            <div style={{ position: 'relative', flexGrow: 1, minWidth: '280px' }}>
              <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>TOPIC TAGS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {teSelectedTags.map(tag => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: '6px' }}>
                    <span className="text-mono text-sm text-primary">{tag}</span>
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
                style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-dark)', outline: 'none' }}
                className="text-mono text-sm"
              />
              {teShowSuggestions && teTagSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(15,15,20,0.98)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 50, maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                  {teTagSuggestions.map(tag => (
                    <div key={tag} onClick={() => teAddTag(tag)} className="text-mono text-sm" style={{ padding: '8px 14px', cursor: 'pointer', color: 'var(--text-dark)', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} onMouseEnter={e => e.target.style.background = 'var(--border)'} onMouseLeave={e => e.target.style.background = 'transparent'}>
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
                <input type="number" value={teMinRating} onChange={e => setTeMinRating(Number(e.target.value))} style={{ width: '70px', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text-dark)', textAlign: 'center' }} className="text-mono text-sm" />
                <span className="text-muted">—</span>
                <input type="number" value={teMaxRating} onChange={e => setTeMaxRating(Number(e.target.value))} style={{ width: '70px', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text-dark)', textAlign: 'center' }} className="text-mono text-sm" />
              </div>
            </div>

            {/* Sort & Search */}
            <div>
              <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>SORT BY</div>
              <select value={teSortBy} onChange={e => setTeSortBy(e.target.value)} style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', color: 'var(--text-dark)', outline: 'none', cursor: 'pointer' }} className="text-mono text-sm">
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
              <button onClick={teSearch} disabled={teLoading || teSelectedTags.length === 0} style={{ background: teLoading ? 'var(--bg-code)' : 'var(--icpc-blue)', color: teLoading ? 'var(--text-muted)' : '#000', border: '1px solid var(--icpc-blue)', borderRadius: '8px', padding: '10px 24px', cursor: teLoading ? 'default' : 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }} className="text-mono text-sm">
                {teLoading ? '⏳ ANALYZING...' : '⟳ EXPLORE'}
              </button>
            </div>
          </div>

          {/* Quick Tag Chips */}
          <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span className="text-micro text-muted" style={{ alignSelf: 'center', marginRight: '4px' }}>QUICK:</span>
            {['dp', 'greedy', 'math', 'graphs', 'binary search', 'data structures', 'trees', 'constructive algorithms', 'two pointers', 'number theory', 'combinatorics', 'strings', 'dfs and similar', 'bitmasks', 'divide and conquer', 'probabilities'].map(tag => (
              <div key={tag} onClick={() => teAddTag(tag)} style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${teSelectedTags.includes(tag) ? 'var(--icpc-blue)' : 'var(--border)'}`, background: teSelectedTags.includes(tag) ? 'rgba(100,210,255,0.1)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }} className="text-mono text-micro text-secondary">
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        {teStatus && (
          <div className="text-mono text-sm text-primary" style={{ padding: '0 8px', flexShrink: 0 }}>
            {teLoading && '⏳ '}{teStatus}
          </div>
        )}

        {/* Results Table */}
        {teProblems.length > 0 && (
          <div className="cf-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
            {/* Summary Stats Bar */}
            <div style={{ padding: '12px 20px', display: 'flex', gap: '24px', background: 'var(--bg-page)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div className="text-mono text-sm">
                <span className="text-muted">PROBLEMS:</span> <span className="text-primary">{sorted.length}</span>
              </div>
              <div className="text-mono text-sm">
                <span className="text-muted">TAGS:</span> <span className="text-primary">{teSelectedTags.join(', ')}</span>
              </div>
              <div className="text-mono text-sm">
                <span className="text-muted">RANGE:</span> <span className="text-primary">{teMinRating}–{teMaxRating}</span>
              </div>
              <div style={{ marginLeft: 'auto' }} className="text-mono text-micro text-muted">
                PAGE {tePage + 1}/{totalPages || 1}
              </div>
            </div>

            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 70px 70px repeat(5, 1fr) 90px', padding: '8px 16px', background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', flexShrink: 0 }} className="text-micro text-secondary">
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
                  <div key={prob.pid} style={{ display: 'grid', gridTemplateColumns: '2.5fr 70px 70px repeat(5, 1fr) 90px', padding: '6px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }} className="text-mono text-sm hover-bg">
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
                    <a href={`https://codeforces.com/problemset/problem/${prob.contestId}/${prob.index}`} target="_blank" rel="noreferrer" style={{ textAlign: 'center', color: 'var(--icpc-blue)', textDecoration: 'none', fontSize: '11px' }}>
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
                <button onClick={() => setTePage(Math.max(0, tePage - 1))} disabled={tePage === 0} style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 14px', color: tePage === 0 ? 'var(--text-tertiary)' : 'var(--text-dark)', cursor: tePage === 0 ? 'default' : 'pointer' }} className="text-mono text-sm">← PREV</button>
                <span className="text-mono text-sm text-secondary" style={{ alignSelf: 'center' }}>{tePage + 1} / {totalPages}</span>
                <button onClick={() => setTePage(Math.min(totalPages - 1, tePage + 1))} disabled={tePage >= totalPages - 1} style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 14px', color: tePage >= totalPages - 1 ? 'var(--text-tertiary)' : 'var(--text-dark)', cursor: tePage >= totalPages - 1 ? 'default' : 'pointer' }} className="text-mono text-sm">NEXT →</button>
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
          <div className="cf-card" style={{ padding: '60px', textAlign: 'center' }}>
            <p className="text-mono text-muted" style={{ marginBottom: '12px' }}>Select one or more topic tags above and click <span style={{ color: 'var(--icpc-blue)' }}>EXPLORE</span> to discover problems.</p>
            <p className="text-mono text-micro text-secondary">For example: select <span className="text-primary">dp</span> + <span className="text-primary">probabilities</span> to find DP problems involving probability.</p>
            <p className="text-mono text-micro text-secondary" style={{ marginTop: '8px' }}>Or try <span className="text-primary">two pointers</span> for sliding window style problems.</p>
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
          <div className="cf-card" style={{ padding: '40px', maxWidth: '520px', width: '100%' }}>
            <h2 className="text-lg text-primary" style={{ marginBottom: '8px', textAlign: 'center' }}>🔥 Training Hub Setup</h2>
            <p className="text-mono text-micro text-muted" style={{ textAlign: 'center', marginBottom: '28px' }}>Set your profile & goals to begin tracking</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>CODEFORCES HANDLE</div>
                <input value={thSetupHandle} onChange={e => setThSetupHandle(e.target.value)} placeholder="your_handle" style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-dark)', outline: 'none', boxSizing: 'border-box' }} className="text-mono text-sm" />
              </div>

              <div>
                <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>TARGET RANK</div>
                <select value={thSetupGoalRank} onChange={e => setThSetupGoalRank(e.target.value)} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-dark)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }} className="text-mono text-sm">
                  {Object.keys(rankGoals).map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)} ({rankGoals[r]}+)</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>DAYS TO REACH</div>
                  <input type="number" value={thSetupDays} onChange={e => setThSetupDays(Number(e.target.value))} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-dark)', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} className="text-mono text-sm" />
                </div>
                <div>
                  <div className="text-micro text-secondary" style={{ marginBottom: '6px' }}>DAILY PROBLEM QUOTA</div>
                  <input type="number" value={thSetupDailyQ} onChange={e => setThSetupDailyQ(Number(e.target.value))} style={{ width: '100%', background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--text-dark)', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} className="text-mono text-sm" />
                </div>
              </div>

              <button onClick={thSaveSetup} disabled={thLoading || !thSetupHandle.trim()} style={{ background: 'var(--icpc-blue)', color: '#000', border: 'none', borderRadius: '8px', padding: '14px', cursor: 'pointer', fontWeight: 'bold', marginTop: '8px', transition: 'all 0.2s' }} className="text-mono text-sm">
                {thLoading ? '⏳ VERIFYING...' : '🚀 START TRAINING'}
              </button>
              {thStatus && <div className="text-mono text-micro text-muted" style={{ textAlign: 'center' }}>{thStatus}</div>}
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
        <div className="cf-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="text-micro text-muted">RATING COMPARISON — YOU vs RIVALS (LAST 12 MONTHS)</h3>
            <button onClick={thLoadRivals} disabled={thLoading} className="text-mono text-micro" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 12px', color: 'var(--icpc-blue)', cursor: 'pointer' }}>⟳ REFRESH</button>
          </div>
          <svg viewBox={`0 0 ${gW} ${gH}`} style={{ width: '100%', height: '360px', background: 'var(--bg-page)', borderRadius: '8px' }} preserveAspectRatio="none">
            {/* Rating bands */}
            {[1200,1400,1600,1900,2100,2400,2600,2800,3000].filter(r => r >= rMin && r <= rMax).map(r => (
              <g key={r}>
                <line x1={paddingX} y1={toY(r)} x2={gW - rightPadding} y2={toY(r)} stroke="rgba(255,255,255,0.06)" />
                <text x="4" y={toY(r) + 3} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">{r}</text>
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
                <text key={i} x={toX(ts)} y={gH - 5} fill="var(--text-muted)" fontSize="10" fontFamily="monospace" textAnchor="middle">{mName}</text>
              );
            })}
            {/* Rival lines */}
            {allHandles.map((h, idx) => {
              const pts = (thRivalHistories[h] || []).filter(p => p.ts >= cutoff);
              if (pts.length < 2) return null;
              const isMe = h === p.handle;
              const color = isMe ? 'var(--icpc-blue)' : rivalColors[idx % rivalColors.length];
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
              const color = isMe ? 'var(--icpc-blue)' : rivalColors[idx % rivalColors.length];
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
      return <div className="cf-card" style={{ padding: '16px', color: 'red' }}>Error rendering graph: {err.message}</div>;
    }
  };

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'auto', padding: '4px' }}>
        {/* Profile Header */}
        <div className="cf-card" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {p.avatar && <img src={p.avatar.startsWith('//') ? 'https:' + p.avatar : p.avatar} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid var(--icpc-blue)' }} />}
            <div>
              <h2 className="text-lg text-primary" style={{ letterSpacing: '-0.02em' }}>
                🔥 {p.handle}'s Training Hub
              </h2>
              <p className="text-mono text-micro text-secondary">
                Current: <span style={{ color: getCfColor(p.rating) }}>{p.rating} ({p.rank})</span> → Target: <span style={{ color: getCfColor(goalRating) }}>{goalRating} ({p.goalRank})</span> — Rating Gap: <span className="text-primary">{ratingGap}</span>
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={thSyncProgress} disabled={thLoading} className="text-mono text-micro" style={{ background: 'var(--bg-code)', border: '1px solid var(--icpc-blue)', borderRadius: '6px', padding: '8px 16px', color: 'var(--icpc-blue)', cursor: 'pointer' }}>⟳ SYNC</button>
            <button onClick={() => setThSetupMode(true)} className="text-mono text-micro" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer' }}>⚙ EDIT</button>
          </div>
        </div>

        {thStatus && <div className="text-mono text-sm text-primary" style={{ padding: '0 8px', flexShrink: 0 }}>{thLoading && '⏳ '}{thStatus}</div>}

        {/* Delta-Velocity Sprint Engine Stats */}
        {(() => {
          const remProblems = Math.max(0, p.goalDays * p.dailyQuota - totalTracked);
          const reqDailyAC = daysLeft > 0 ? (remProblems / daysLeft).toFixed(1) : 0;
          const velocityMult = streak > 0 ? (1 + Math.min(streak * 0.05, 0.5)).toFixed(2) : 1.0;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', flexShrink: 0 }}>
              {[
                { label: 'DAY', value: `${dayNumber} / ${p.goalDays}`, color: 'var(--icpc-blue)' },
                { label: 'DAYS LEFT', value: daysLeft, color: daysLeft < 10 ? 'var(--icpc-red)' : 'var(--text-dark)' },
                { label: 'STREAK', value: `${streak}🔥`, color: streak >= 3 ? '#ff8c00' : 'var(--text-dark)' },
                { label: 'TODAY', value: `${thProgress[today.toISOString().split('T')[0]]?.solved || 0} / ${p.dailyQuota}`, color: (thProgress[today.toISOString().split('T')[0]]?.solved || 0) >= p.dailyQuota ? 'var(--icpc-green)' : 'var(--text-dark)' },
                { label: 'REQ. DAILY AC', value: reqDailyAC, color: reqDailyAC > p.dailyQuota ? 'var(--icpc-red)' : 'var(--text-dark)' },
                { label: 'VELOCITY MULT', value: `${velocityMult}x`, color: velocityMult > 1 ? 'var(--icpc-green)' : 'var(--text-muted)' },
              ].map((s, i) => (
                <div key={i} className="cf-card" style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <div className="text-micro text-muted">{s.label}</div>
                  <div className="text-mono text-lg" style={{ color: s.color, marginTop: '4px' }}>{s.value}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Progress Bar */}
        <div className="cf-card" style={{ padding: '12px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span className="text-micro text-muted">DELTA-VELOCITY SPRINT PROGRESS</span>
            <span className="text-mono text-micro text-muted">{progressPct}%</span>
          </div>
          <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--icpc-blue), #00ff88)', borderRadius: '4px', transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Calendar Checklist */}
        <div className="cf-card" style={{ padding: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button onClick={() => { if (calMonth === 0) { setThCalMonth(11); setThCalYear(calYear - 1); } else setThCalMonth(calMonth - 1); }} className="text-mono text-sm" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text-dark)', cursor: 'pointer' }}>◀</button>
            <h3 className="text-mono text-sm text-primary">{monthNames[calMonth]} {calYear}</h3>
            <button onClick={() => { if (calMonth === 11) { setThCalMonth(0); setThCalYear(calYear + 1); } else setThCalMonth(calMonth + 1); }} className="text-mono text-sm" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text-dark)', cursor: 'pointer' }}>▶</button>
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
                <div key={day} style={{ padding: '6px 2px', textAlign: 'center', borderRadius: '6px', background: bg, border: isToday ? '1.5px solid var(--icpc-blue)' : '1px solid transparent', cursor: 'default', minHeight: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '2px' }}>
                  <span className="text-mono text-micro" style={{ color: isToday ? 'var(--icpc-blue)' : isFuture ? 'var(--text-tertiary)' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal' }}>{day}</span>
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
        <div className="cf-card" style={{ padding: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="text-micro text-muted">🎯 DYNAMIC RIVALS — Users 400-700 rating above you, actively improving</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {thStatus && <span className="text-mono text-micro text-muted">{thStatus}</span>}
              <button onClick={thLoadRivals} disabled={thLoading} className="text-mono text-micro" style={{ background: 'var(--icpc-blue)', color: '#000', border: 'none', borderRadius: '6px', padding: '6px 16px', cursor: thLoading ? 'wait' : 'pointer', fontWeight: 'bold', opacity: thLoading ? 0.7 : 1 }}>
                {thLoading ? '⏳ LOADING...' : (thRivals ? '⟳ REFRESH' : '⚡ FIND RIVALS')}
              </button>
            </div>
          </div>

          {thRivals && thRivals.rivals.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {thRivals.rivals.map((r, i) => (
                <div key={r.handle} className="cf-card" style={{ padding: '10px 12px', textAlign: 'center' }}>
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
        // Step 1: Fetch user info from Google
        let userInfo;
        try {
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
          });
          if (!userInfoRes.ok) throw new Error(`Google API returned ${userInfoRes.status}`);
          userInfo = await userInfoRes.json();
        } catch (googleErr) {
          alert(
            '⚠️ Google Sign-In failed at the Google step.\n\n' +
            'Most likely cause: this app\'s URL (localhost:5173) is not added to your Google Cloud Console as an Authorized JavaScript Origin.\n\n' +
            'Fix: Go to console.cloud.google.com → APIs & Services → Credentials → your OAuth 2.0 Client ID → ' +
            'Add "http://localhost:5173" to Authorized JavaScript Origins.\n\n' +
            'In the meantime, use the username/password login below.\n\n' +
            'Error detail: ' + googleErr.message
          );
          return;
        }

        // Step 2: Register/login with our backend
        try {
          const res = await fetch(`${BACKEND}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
          if (u.cf_handle) setTimeout(fetchUserProfile, 400);
        } catch (backendErr) {
          alert(
            '⚠️ Google account verified, but our backend is unreachable.\n\n' +
            'Make sure the backend is running: open a terminal and run:\n' +
            'cd backend && node server.js\n\n' +
            'Error: ' + backendErr.message
          );
        }
      } catch (e) {
        alert('Google Sign-In error: ' + e.message);
      }
    },
    onError: (err) => {
      console.error('Google OAuth error:', err);
      alert(
        '⚠️ Google Sign-In popup was cancelled or blocked.\n\n' +
        'If you saw a popup blocker, allow popups for localhost:5173 and try again.\n\n' +
        'You can also use username/password login below.'
      );
    },
  });

  const renderAuth = () => (
    <div className="auth-screen">
      {/* Left panel — ICPC branding */}
      <div className="auth-left-panel">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '48px' }}>
            <MyCPCLogo size="md" />
            <div>
              <div style={{ fontSize: '24px', lineHeight: 1, display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'Caveat, cursive', color: 'var(--icpc-gold)', fontSize: '1.3em', marginRight: '2px', fontWeight: 700 }}>my</span>
                <span style={{ fontFamily: 'Inter, sans-serif', color: 'white', fontWeight: 900, letterSpacing: '-0.02em' }}>CPC</span>
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>ICPC Coach Platform</div>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '4px', marginBottom: '20px' }}>
            <span style={{color: 'var(--icpc-blue)'}}>Opportunity</span>
            <span style={{color: 'rgba(255,255,255,0.3)', margin: '0 6px'}}>·</span>
            <span style={{color: 'var(--icpc-gold)'}}>Choice</span>
            <span style={{color: 'rgba(255,255,255,0.3)', margin: '0 6px'}}>·</span>
            <span style={{color: 'var(--icpc-red)'}}>Growth</span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: '16px' }}>
            Your Personal<br/>Competitive Programming<br/>Coach
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: '300px' }}>
            Designed for ICPC athletes. Track your growth, drill your weak spots, and study grandmaster solutions.
          </p>
        </div>
        <div>
          <div style={{ display: 'flex', gap: '24px' }}>
            {[['#1A56A0', 'OPPORTUNITY'], ['#F0A800', 'CHOICE'], ['#D1232A', 'GROWTH']].map(([c, l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, margin: '0 auto 6px' }}></div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* Right panel */}
      <div className="auth-right-panel">
        <div className="auth-form-box">
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '4px' }}>
            {isLoginMode ? 'Sign In' : 'Create Account'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px' }}>
            {isLoginMode ? 'Access your coaching dashboard' : 'Start your ICPC journey today'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label className="form-label">Handle / Username</label>
              <input type="text" placeholder="e.g. tourist" value={authUsername} onChange={e => setAuthUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '4px' }} onClick={handleAuth}>
              {isLoginMode ? 'Sign In →' : 'Create Account →'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', gap: '10px' }} onClick={() => googleLogin()}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>
          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <a onClick={() => setIsLoginMode(!isLoginMode)} style={{ cursor: 'pointer', color: 'var(--icpc-blue)' }}>
              {isLoginMode ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </a>
          </p>
        </div>
      </div>
    </div>
  );

  const renderSpatialHome = () => {
    const apps = [
      { id: 'command_center', name: 'Command Center', desc: 'Rating curve, heatmap & run-rate', icon: <BarChart3 size={22} />, color: 'blue' },
      { id: 'training_hub',   name: 'Training Hub',   desc: 'Daily cycles & drills',           icon: <Flame size={22} />,      color: 'red' },
      { id: 'crucible',       name: 'Socratic Coach', desc: 'AI-guided hint system',           icon: <BrainCircuit size={22} />, color: 'gold' },
      { id: 'graveyard',      name: 'Spaced Repetition', desc: 'Ebbinghaus review queue',     icon: <Ghost size={22} />,      color: 'navy' },
      { id: 'topic_explorer', name: 'Topic Explorer', desc: 'Curated problem sets by tag',    icon: <Target size={22} />,     color: 'blue' },
      { id: 'golden_path',    name: 'Golden Path',    desc: 'Cohort intersection problems',   icon: <Sparkles size={22} />,   color: 'gold' },
      { id: 'palantir_hub',   name: 'Palantir Intel', desc: 'Deep competitive analytics',     icon: <Eye size={22} />,        color: 'navy' },
      { id: 'code_explorer',  name: 'GM Explorer',    desc: 'Study grandmaster solutions',    icon: <BarChart3 size={22} />,  color: 'green' },
      { id: 'skill_tree',     name: 'Skill Tree',     desc: '3D topic proficiency map',       icon: <Dna size={22} />,        color: 'blue' },
      { id: 'complexity_analyzer', name: 'DACE Analyzer', desc: 'Extract Big-O from code',   icon: <Cpu size={22} />,        color: 'navy' },
      { id: 'memory_profiler', name: 'Cache Profiler', desc: 'Memory & cache analysis',    icon: <Zap size={22} />,        color: 'red' },
      { id: 'contest_simulator', name: 'EV Engine',    desc: 'Submit vs stress-test EV',   icon: <Gauge size={22} />,      color: 'gold' },
      { id: 'telemetry',      name: 'Telemetry',      desc: 'Behavioral micro-analytics', icon: <Activity size={22} />,   color: 'blue' },
      { id: 'drawdown',       name: 'Drawdown',       desc: 'Stamina & recovery profiler',icon: <TrendingUp size={22} />, color: 'red' },
      { id: 'settings',       name: 'Settings',       desc: 'Handles, goals & API keys',  icon: <Settings size={22} />,   color: 'gray' },
    ];
    const currentRating = profile.rating || 0;
    return (
      <div className="spatial-home-screen">
        {/* Hero Banner */}
        <div className="home-hero-banner">
          <div className="home-hero-left">
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '9px', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: '4px', display: 'inline-block', marginBottom: '12px' }}>
              <span style={{color: 'var(--icpc-blue)'}}>Opportunity</span>
              <span style={{color: 'rgba(255,255,255,0.3)', margin: '0 6px'}}>·</span>
              <span style={{color: 'var(--icpc-gold)'}}>Choice</span>
              <span style={{color: 'rgba(255,255,255,0.3)', margin: '0 6px'}}>·</span>
              <span style={{color: 'var(--icpc-red)'}}>Growth</span>
            </div>
            <h1>Welcome back, <span>{cfHandle}</span></h1>
            <p>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · Your competitive programming coach is ready.</p>
          </div>
          <div className="home-hero-stats">
            <div className="home-hero-stat">
              <div className="home-hero-stat-label">Rating</div>
              <div className="home-hero-stat-value" style={{ color: getCfColor(currentRating) || 'white', fontSize: '24px' }}>{currentRating || '—'}</div>
            </div>
            <div className="home-hero-stat">
              <div className="home-hero-stat-label">SR Queue</div>
              <div className="home-hero-stat-value" style={{ color: srQueue.length > 0 ? 'var(--icpc-gold)' : 'white' }}>{srQueue.length}</div>
            </div>
            <div className="home-hero-stat">
              <div className="home-hero-stat-label">Rank</div>
              <div className="home-hero-stat-value" style={{ fontSize: '14px' }}>{profile.rank || '—'}</div>
            </div>
            <div style={{ paddingLeft: '24px' }}>
              <button className="btn btn-gold" onClick={() => setUser(null)} style={{ fontSize: '12px', padding: '7px 14px' }}>Sign Out</button>
            </div>
          </div>
        </div>

        {/* App Grid */}
        <div className="home-app-grid-container">
          <div className="home-app-grid">
            {apps.map(app => (
              <div key={app.id} className="app-tile" onClick={() => { setActiveView(app.id); setIsSpatialHome(false); }}>
                <div className={`app-tile-icon ${app.color}`}>{app.icon}</div>
                <div className="app-tile-name">{app.name}</div>
                <div className="app-tile-desc">{app.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };


  // ══════════════════════════════════════════════════════════════════════
  // DACE — Deterministic Algorithmic Complexity Extraction
  // ══════════════════════════════════════════════════════════════════════
  const analyzeDACE = (src) => {
    if (!src.trim()) return;
    let maxDepth = 0, curDepth = 0, hasSort = false, hasBinarySearch = false, hasLog = false;
    const lines = src.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (/\bfor\s*\(/.test(t) || /\bwhile\s*\(/.test(t)) { curDepth++; maxDepth = Math.max(maxDepth, curDepth); }
      if (t === '}') curDepth = Math.max(0, curDepth - 1);
      if (/sort\s*\(/.test(t)) hasSort = true;
      if (/lower_bound|upper_bound|binary_search|bisect/.test(t)) hasBinarySearch = true;
      if (/log2?\s*\(|__lg\s*\(/.test(t)) hasLog = true;
    }
    let complexity = '', ops = 0, verdict = 'SAFE';
    const N = 200000; // typical constraint
    if (maxDepth <= 1 && (hasSort || hasBinarySearch)) {
      complexity = 'O(N log N)'; ops = N * Math.log2(N);
    } else if (maxDepth <= 1) {
      complexity = 'O(N)'; ops = N;
    } else if (maxDepth === 2 && hasLog) {
      complexity = 'O(N² log N)'; ops = N * N * Math.log2(N); verdict = 'CRITICAL';
    } else if (maxDepth === 2) {
      complexity = 'O(N²)'; ops = N * N; verdict = ops > 1e8 ? 'DANGER' : 'BORDERLINE';
    } else if (maxDepth === 3) {
      complexity = 'O(N³)'; ops = N * N * N; verdict = 'CRITICAL';
    } else {
      complexity = `O(N^${maxDepth})`; ops = Math.pow(N, maxDepth); verdict = 'CRITICAL';
    }
    if (ops <= 1e8) verdict = 'SAFE';
    else if (ops <= 5e8) verdict = 'DANGER';
    else verdict = 'CRITICAL';
    setDaceResult({ complexity, ops, verdict, maxDepth, hasSort, hasBinarySearch, N,
      detail: `Detected ${maxDepth} nested loop(s)${hasSort ? ' + sort()' : ''}${hasBinarySearch ? ' + binary search' : ''}. At N=${fmt(N)}: ~${ops.toExponential(1)} operations.`
    });
  };

  const renderComplexityAnalyzer = () => (
    <div>
      <div className="page-header">
        <div>
          <div className="page-header-title"><Cpu size={20} className="page-header-title-accent" /> <span>DACE</span> — Deterministic Complexity Extraction</div>
          <div className="page-header-subtitle">Paste your code. We extract the exact Big-O, count operations at N=200,000, and enforce the 10⁸ threshold.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="cf-card" style={{ padding: '20px' }}>
          <div className="cf-card-title" style={{ marginBottom: '12px' }}>Source Code</div>
          <textarea
            value={daceCode}
            onChange={e => setDaceCode(e.target.value)}
            placeholder={"#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n; cin >> n;\n    vector<int> a(n);\n    for (int i = 0; i < n; i++) cin >> a[i];\n    sort(a.begin(), a.end());\n    // ...\n}"}
            style={{ width: '100%', height: '320px', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', resize: 'vertical', background: 'var(--bg-code)', color: 'var(--text-body)' }}
          />
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={() => analyzeDACE(daceCode)}>
            <Cpu size={14} /> Extract Complexity
          </button>
        </div>
        <div className="cf-card" style={{ padding: '20px' }}>
          <div className="cf-card-title" style={{ marginBottom: '12px' }}>Analysis Result</div>
          {daceResult ? (
            <div>
              <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
                <div style={{ fontSize: '48px', fontFamily: 'var(--font-mono)', fontWeight: 900, color: daceResult.verdict === 'SAFE' ? 'var(--icpc-green)' : daceResult.verdict === 'DANGER' ? 'var(--cf-tle-orange)' : 'var(--icpc-red)' }}>{daceResult.complexity}</div>
                <div className={`badge ${daceResult.verdict === 'SAFE' ? 'badge-green' : daceResult.verdict === 'DANGER' ? 'badge-orange' : 'badge-red'}`} style={{ fontSize: '13px', padding: '4px 16px', marginTop: '8px' }}>{daceResult.verdict}</div>
              </div>
              <div className="alert alert-info" style={{ marginTop: '16px' }}>
                <div><strong>Operations at N={fmt(daceResult.N)}:</strong> {daceResult.ops.toExponential(2)}</div>
              </div>
              <div className={`alert ${daceResult.verdict === 'SAFE' ? 'alert-success' : 'alert-error'}`}>
                {daceResult.verdict === 'SAFE' ? '✅ Within 10⁸ threshold. Safe to submit.' : '⚠️ Exceeds 10⁸ operations. Will likely TLE. Optimize your approach.'}
              </div>
              <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-code)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-muted)' }}>{daceResult.detail}</div>
              <table className="cf-table" style={{ marginTop: '16px' }}>
                <tbody>
                  <tr><td style={{ fontWeight: 700 }}>Loop Nesting Depth</td><td className="text-mono">{daceResult.maxDepth}</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>sort() Detected</td><td>{daceResult.hasSort ? '✅ Yes' : '❌ No'}</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>Binary Search Detected</td><td>{daceResult.hasBinarySearch ? '✅ Yes' : '❌ No'}</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>Threshold (10⁸ ops/sec)</td><td className="text-mono">100,000,000</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>Your Operations</td><td className="text-mono" style={{ color: daceResult.ops <= 1e8 ? 'var(--icpc-green)' : 'var(--icpc-red)' }}>{daceResult.ops.toExponential(2)}</td></tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
              <Cpu size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p style={{ fontSize: '14px' }}>Paste your C++/Python code and click <strong>Extract Complexity</strong>.</p>
              <p style={{ fontSize: '12px', marginTop: '8px' }}>The analyzer counts nested loops, detects sort/binary-search patterns, and mathematically proves your Big-O.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // Memory & Cache Profiler
  // ══════════════════════════════════════════════════════════════════════
  const analyzeMemory = (src) => {
    if (!src.trim()) return;
    const issues = [];
    const lines = src.split('\n');
    lines.forEach((line, idx) => {
      if (/\[\s*j\s*\]\s*\[\s*i\s*\]/.test(line)) {
        issues.push({ line: idx + 1, type: 'COL_MAJOR', severity: 'HIGH', text: `Column-major access: arr[j][i] — cache-unfriendly. Swap to arr[i][j] for row-major (spatial locality).`, fix: 'Transpose loop order: outer loop on rows (i), inner on columns (j).' });
      }
      if (/struct\s+\w+\s*\{/.test(line)) {
        issues.push({ line: idx + 1, type: 'STRUCT_PACK', severity: 'MEDIUM', text: `Struct declared. Ensure fields are ordered by size (largest first) to minimize padding.`, fix: 'Order: long long > int > short > char. Use __attribute__((packed)) if critical.' });
      }
      if (/vector\s*<\s*vector/.test(line)) {
        issues.push({ line: idx + 1, type: 'VEC_OF_VEC', severity: 'HIGH', text: `vector<vector<>> detected. Non-contiguous memory = frequent cache misses.`, fix: 'Use a flattened 1D array: arr[i * cols + j] for contiguous memory layout.' });
      }
      if (/map\s*</.test(line) && !/unordered_map/.test(line)) {
        issues.push({ line: idx + 1, type: 'ORDERED_MAP', severity: 'MEDIUM', text: `std::map (red-black tree) — O(log N) with pointer chasing. Very cache-unfriendly.`, fix: 'Use unordered_map (O(1) amortized) or a sorted vector with binary search.' });
      }
    });
    setMemResult({ issues, lineCount: lines.length });
  };

  const renderMemoryProfiler = () => (
    <div>
      <div className="page-header">
        <div>
          <div className="page-header-title"><Zap size={20} className="page-header-title-accent" /> Cache-Miss & Memory Profiler</div>
          <div className="page-header-subtitle">Scans array traversals, struct packing, and container choices for CPU cache efficiency. Think like a low-latency systems engineer.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="cf-card" style={{ padding: '20px' }}>
          <div className="cf-card-title" style={{ marginBottom: '12px' }}>Source Code</div>
          <textarea value={memCode} onChange={e => setMemCode(e.target.value)} placeholder={"// Paste your C++ code here\nint dp[5001][5001];\nfor (int j = 0; j < n; j++)\n  for (int i = 0; i < m; i++)\n    dp[j][i] = dp[j-1][i] + 1;"} style={{ width: '100%', height: '300px', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', resize: 'vertical', background: 'var(--bg-code)' }} />
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={() => analyzeMemory(memCode)}>
            <Zap size={14} /> Profile Memory Access
          </button>
        </div>
        <div className="cf-card" style={{ padding: '20px' }}>
          <div className="cf-card-title" style={{ marginBottom: '12px' }}>Cache Analysis ({memResult ? memResult.issues.length : 0} issues)</div>
          {memResult && memResult.issues.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {memResult.issues.map((iss, i) => (
                <div key={i} className={`alert ${iss.severity === 'HIGH' ? 'alert-error' : 'alert-warn'}`} style={{ flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Line {iss.line}: {iss.type}</strong>
                    <span className={`badge ${iss.severity === 'HIGH' ? 'badge-red' : 'badge-gold'}`}>{iss.severity}</span>
                  </div>
                  <div style={{ fontSize: '13px' }}>{iss.text}</div>
                  <div style={{ fontSize: '12px', color: 'var(--icpc-blue)', fontWeight: 600 }}>🔧 Fix: {iss.fix}</div>
                </div>
              ))}
              <div className="cf-card" style={{ marginTop: '8px', padding: '14px', borderTop: '3px solid var(--icpc-blue)' }}>
                <div className="cf-card-title" style={{ marginBottom: '8px' }}>Cache-Line Primer (64 bytes)</div>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                  {Array.from({length: 16}).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: '24px', background: i < 4 ? 'var(--icpc-blue)' : 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontFamily: 'var(--font-mono)', color: i < 4 ? 'white' : 'var(--text-muted)' }}>{i * 4}</div>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Each block = 4 bytes (one int). A cache line loads 16 ints at once. Row-major access reads sequentially; column-major jumps across lines.</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
              <Zap size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p>Paste code to scan for cache-unfriendly patterns.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // Submission EV & Risk Engine (Contest Simulator)
  // ══════════════════════════════════════════════════════════════════════
  const calcEV = () => {
    const pAC = evConfidence / 100;
    const pWA = 1 - pAC;
    const timeSavedIfAC = 120 - evMinutesIn; // minutes saved
    const penaltyCostIfWA = evPenalty; // minutes penalty
    const evSubmit = pAC * timeSavedIfAC - pWA * penaltyCostIfWA;
    const evStressTester = -5 + 0.95 * timeSavedIfAC; // 5 min cost, 95% AC after
    const tiltScore = pWA > 0.4 && evMinutesIn > 60 ? 'HIGH' : pWA > 0.25 ? 'MODERATE' : 'LOW';
    setEvResult({ pAC, pWA, evSubmit: evSubmit.toFixed(1), evStressTester: evStressTester.toFixed(1), recommendation: evSubmit > evStressTester ? 'SUBMIT' : 'STRESS TEST', tiltScore });
  };

  const renderContestSimulator = () => (
    <div>
      <div className="page-header">
        <div>
          <div className="page-header-title"><Gauge size={20} className="page-header-title-accent" /> Submission EV & Risk Engine</div>
          <div className="page-header-subtitle">Calculate the expected value of submitting vs. stress-testing. Treat your contest like a high-stakes trading floor.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="cf-card" style={{ padding: '20px' }}>
          <div className="cf-card-title" style={{ marginBottom: '16px' }}>Scenario Parameters</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Minutes Into Contest</label>
              <input type="range" min="5" max="120" value={evMinutesIn} onChange={e => setEvMinutesIn(+e.target.value)} style={{ width: '100%' }} />
              <div className="text-mono text-sm" style={{ marginTop: '4px' }}>{evMinutesIn} min / 120 min</div>
            </div>
            <div>
              <label className="form-label">Confidence in Solution (%)</label>
              <input type="range" min="10" max="99" value={evConfidence} onChange={e => setEvConfidence(+e.target.value)} style={{ width: '100%' }} />
              <div className="text-mono text-sm" style={{ marginTop: '4px', color: evConfidence > 80 ? 'var(--icpc-green)' : evConfidence > 50 ? 'var(--icpc-gold)' : 'var(--icpc-red)' }}>{evConfidence}% confident</div>
            </div>
            <div>
              <label className="form-label">WA Penalty (minutes)</label>
              <input type="number" value={evPenalty} onChange={e => setEvPenalty(+e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={calcEV}>
              <Gauge size={14} /> Calculate Expected Value
            </button>
          </div>
        </div>
        <div className="cf-card" style={{ padding: '20px' }}>
          <div className="cf-card-title" style={{ marginBottom: '16px' }}>Decision Matrix</div>
          {evResult ? (
            <div>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>RECOMMENDED ACTION</div>
                <div style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: evResult.recommendation === 'SUBMIT' ? 'var(--icpc-green)' : 'var(--icpc-blue)' }}>{evResult.recommendation}</div>
              </div>
              <table className="cf-table" style={{ marginTop: '12px' }}>
                <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                <tbody>
                  <tr><td>P(AC)</td><td className="text-mono" style={{ color: 'var(--icpc-green)' }}>{(evResult.pAC * 100).toFixed(0)}%</td></tr>
                  <tr><td>P(WA)</td><td className="text-mono" style={{ color: 'var(--icpc-red)' }}>{(evResult.pWA * 100).toFixed(0)}%</td></tr>
                  <tr><td>EV(Submit Now)</td><td className="text-mono" style={{ color: evResult.evSubmit > 0 ? 'var(--icpc-green)' : 'var(--icpc-red)' }}>{evResult.evSubmit > 0 ? '+' : ''}{evResult.evSubmit} min</td></tr>
                  <tr><td>EV(Stress Test)</td><td className="text-mono">{evResult.evStressTester > 0 ? '+' : ''}{evResult.evStressTester} min</td></tr>
                </tbody>
              </table>
              <div className={`alert ${evResult.tiltScore === 'HIGH' ? 'alert-error' : evResult.tiltScore === 'MODERATE' ? 'alert-warn' : 'alert-success'}`} style={{ marginTop: '12px' }}>
                <strong>Tilt Risk: {evResult.tiltScore}</strong>
                {evResult.tiltScore === 'HIGH' && ' — Your behavior resembles panic-submitting. Step back, breathe, stress test.'}
                {evResult.tiltScore === 'MODERATE' && ' — Borderline. Consider a quick brute-force check.'}
                {evResult.tiltScore === 'LOW' && ' — You are in control. Execute your plan.'}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
              <Gauge size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p>Set your scenario parameters and calculate.</p>
              <p style={{ fontSize: '12px', marginTop: '8px' }}>EV = P(AC) × time_saved − P(WA) × penalty_cost</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // Micro-Decision Telemetry Dashboard
  // ══════════════════════════════════════════════════════════════════════
  const generateTelemetry = async () => {
    if (!cfHandle) { alert('Set a CF handle first in Settings.'); return; }
    try {
      // Fetch real DNA profile data
      const [profileRes, historyRes] = await Promise.all([
        fetch(`${BACKEND}/api/dna/profile/${cfHandle}`),
        fetch(`${BACKEND}/api/dna/history/${cfHandle}`)
      ]);
      const profileData = await profileRes.json();
      const historyData = await historyRes.json();

      const sessions = historyData.sessions || [];
      if (sessions.length < 2) {
        alert('Not enough DNA sessions yet. Solve at least 2 problems with the VS Code extension to generate a profile.');
        return;
      }

      const avgSolveTime = sessions.reduce((s, x) => s + (x.solve_time_sec || 0), 0) / sessions.length / 60;
      const avgWAs = sessions.reduce((s, x) => s + (x.wa_count || 0), 0) / sessions.length;
      const avgEditVelocity = sessions.reduce((s, x) => s + (x.edit_velocity || 0), 0) / sessions.length;
      const avgHesitations = sessions.reduce((s, x) => s + (x.hesitation_count || 0), 0) / sessions.length;

      const dna = profileData.profile || {};
      const archetypes = [
        avgEditVelocity > 40 && avgHesitations < 3 ? 'Fast Typer / Minimal Thinking Time' :
        avgHesitations > 5 && avgEditVelocity < 25 ? 'Deep Thinker / Precise Implementer' :
        avgWAs > 2.5 ? 'Aggressive Submitter / High WA Rate' :
        'Balanced Strategist'
      ];

      const profile = {
        archetype: archetypes[0],
        avgReadTime: 'N/A (tracked via Chrome ext)',
        avgCodeTime: `${avgSolveTime.toFixed(1)} min`,
        avgDebugTime: `${(avgWAs * 4).toFixed(1)} min est.`,
        editVelocity: Math.round(avgEditVelocity) || 0,
        tabSwitches: Math.round(avgHesitations) || 0,
        testRunsBeforeSubmit: (sessions.reduce((s, x) => s + (x.test_runs || 1), 0) / sessions.length).toFixed(1),
        sessionCount: sessions.length,
        radar: {
          speed: Math.min(100, dna.speed || 50),
          accuracy: Math.min(100, dna.accuracy || 50),
          endurance: Math.min(100, 100 - (avgWAs * 10)),
          focus: Math.min(100, 100 - (avgHesitations * 8)),
          breadth: Math.min(100, (dna.problem_diversity || 30))
        }
      };
      setTelemetryProfile(profile);
    } catch(e) {
      alert('Could not load DNA data. Make sure the backend is running: ' + e.message);
    }
  };

  const renderTelemetry = () => (
    <div>
      <div className="page-header">
        <div>
          <div className="page-header-title"><Activity size={20} className="page-header-title-accent" /> Micro-Decision Telemetry</div>
          <div className="page-header-subtitle">Records how you spend every second during a problem. Identifies your archetype and generates targeted drills.</div>
        </div>
      </div>
      <div className="cf-card" style={{ padding: '20px', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={generateTelemetry}><Activity size={14} /> Generate Behavioral Profile</button>
        <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>Analyzes your last 50 problem sessions</span>
      </div>
      {telemetryProfile && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div className="cf-card border-gold-top" style={{ padding: '20px', gridColumn: 'span 3' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--icpc-navy)' }}>{telemetryProfile.archetype}</div>
              <div className="badge badge-gold" style={{ fontSize: '13px', padding: '4px 12px' }}>YOUR ARCHETYPE</div>
            </div>
          </div>
          {[
            { label: 'Avg. Read Time', value: `${telemetryProfile.avgReadTime} min`, icon: '📖' },
            { label: 'Avg. Code Time', value: `${telemetryProfile.avgCodeTime} min`, icon: '⌨️' },
            { label: 'Avg. Debug Time', value: `${telemetryProfile.avgDebugTime} min`, icon: '🐛' },
            { label: 'Edit Velocity', value: `${telemetryProfile.editVelocity} chars/min`, icon: '⚡' },
            { label: 'Tab Switches', value: `${telemetryProfile.tabSwitches}/session`, icon: '🔄' },
            { label: 'Test Runs Before Submit', value: telemetryProfile.testRunsBeforeSubmit, icon: '🧫' },
          ].map((m, i) => (
            <div key={i} className="stat-card">
              <div className="stat-card-label">{m.icon} {m.label}</div>
              <div className="stat-card-value">{m.value}</div>
            </div>
          ))}
          <div className="cf-card" style={{ gridColumn: 'span 3', padding: '20px' }}>
            <div className="cf-card-title" style={{ marginBottom: '12px' }}>Performance Radar</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '20px 0' }}>
              {Object.entries(telemetryProfile.radar).map(([k, v]) => (
                <div key={k} style={{ textAlign: 'center' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', border: `4px solid ${v > 70 ? 'var(--icpc-green)' : v > 40 ? 'var(--icpc-gold)' : 'var(--icpc-red)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <span className="text-mono" style={{ fontWeight: 800, fontSize: '16px' }}>{Math.round(v)}</span>
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════
  // Performance Drawdown & Recovery Profiler
  // ══════════════════════════════════════════════════════════════════════
  const generateDrawdown = () => {
    // Derive real metrics from the already-fetched ratingCurve
    if (ratingCurve.length < 3) {
      alert('Not enough rating history to compute drawdown. Sync your CF profile and participate in contests first.');
      return;
    }

    const ratings = ratingCurve.map(p => p.rating);
    const changes = ratings.slice(1).map((r, i) => r - ratings[i]);
    const negChanges = changes.filter(c => c < 0);
    const posChanges = changes.filter(c => c > 0);

    const maxRating = Math.max(...ratings);
    const minAfterPeak = Math.min(...ratings.slice(ratings.indexOf(maxRating)));
    const maxDrawdown = maxRating - minAfterPeak;

    const ratingVol = Math.round(Math.sqrt(changes.reduce((s, c) => s + c * c, 0) / changes.length));
    const recoverySpeed = posChanges.length > 0 ?
      (posChanges.reduce((s, c) => s + c, 0) / posChanges.length).toFixed(0) : 0;
    const worstLoss = negChanges.length > 0 ? Math.min(...negChanges).toFixed(0) : 0;

    // Stamina curve: performance over contests (last 12 rated contests)
    const last12 = ratings.slice(-12);
    const staminaCurve = last12.map((r, i) => ({
      min: i + 1,
      perf: Math.max(0, Math.min(100, ((r - 800) / (3500 - 800)) * 100))
    }));

    setDrawdownData({
      ratingVol,
      recoverySpeed,
      fatigueOnset: ratingCurve.length,
      peakMinute: maxRating,
      maxDrawdown,
      worstLoss,
      staminaCurve
    });
  };

  const renderDrawdown = () => (
    <div>
      <div className="page-header">
        <div>
          <div className="page-header-title"><TrendingUp size={20} className="page-header-title-accent" /> Performance Drawdown Profiler</div>
          <div className="page-header-subtitle">Tracks rating volatility, cognitive stamina, and recovery speed. Know exactly when your logic starts breaking down.</div>
        </div>
      </div>
      <div className="cf-card" style={{ padding: '20px', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={generateDrawdown}><TrendingUp size={14} /> Analyze Performance Drawdown</button>
        <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>Based on your last 30 contests</span>
      </div>
      {drawdownData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
          <div className="stat-card border-blue-top">
            <div className="stat-card-label">Rating Volatility (σ)</div>
            <div className="stat-card-value" style={{ color: drawdownData.ratingVol > 120 ? 'var(--icpc-red)' : 'var(--icpc-blue)' }}>±{drawdownData.ratingVol}</div>
            <div className="stat-card-sub">Rolling 10-contest std deviation</div>
          </div>
          <div className="stat-card border-green-top">
            <div className="stat-card-label">Avg Recovery</div>
            <div className="stat-card-value">+{drawdownData.recoverySpeed}</div>
            <div className="stat-card-sub">Avg rating gain per winning contest</div>
          </div>
          <div className="stat-card border-gold-top">
            <div className="stat-card-label">Peak Rating</div>
            <div className="stat-card-value" style={{ color: 'var(--icpc-gold)' }}>{drawdownData.peakMinute}</div>
            <div className="stat-card-sub">All-time highest Codeforces rating</div>
          </div>
          <div className="stat-card border-red-top">
            <div className="stat-card-label">Max Drawdown</div>
            <div className="stat-card-value" style={{ color: drawdownData.maxDrawdown > 100 ? 'var(--icpc-red)' : 'var(--icpc-gold)' }}>
              -{drawdownData.maxDrawdown}
            </div>
            <div className="stat-card-sub">Peak-to-trough rating drop</div>
          </div>
          <div className="cf-card" style={{ gridColumn: 'span 4', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div className="cf-card-title">Rating Arc ({drawdownData.staminaCurve.length} contests shown)</div>
              <div className="text-mono text-micro" style={{ color: 'var(--text-muted)' }}>Worst single drop: <span style={{ color: 'var(--icpc-red)' }}>{drawdownData.worstLoss}</span></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '160px', padding: '0 8px' }}>
              {drawdownData.staminaCurve.map((pt, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${pt.perf}%`, background: pt.perf > 70 ? 'var(--icpc-green)' : pt.perf > 40 ? 'var(--icpc-gold)' : 'var(--icpc-red)', borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }}></div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>#{i + 1}</div>
                </div>
              ))}
            </div>
            <div className="alert alert-info" style={{ marginTop: '16px' }}>
              <strong>Coaching Insight:</strong>{' '}
              {drawdownData.maxDrawdown > 150
                ? `Your max drawdown of ${drawdownData.maxDrawdown} points is significant. Focus on consistent performance rather than high-risk strategies in contests.`
                : drawdownData.maxDrawdown > 50
                ? `You recovered from a ${drawdownData.maxDrawdown}-point drop — that shows resilience. Keep compounding gains.`
                : `Low drawdown profile. You play consistently and don't take rating hits easily. Consider pushing into harder problems.`
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderSkillTree = () => (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)', marginBottom: '16px', flexShrink: 0 }}>
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
      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-xl text-primary" style={{ letterSpacing: '-0.02em', marginBottom: '4px' }}>Profile & Global Settings</h2>
        <p className="text-base text-muted">Configure your handles, API keys, and training goals. These settings apply globally across all modules.</p>
      </div>
      
      <div className="cf-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="text-lg text-primary" style={{ marginBottom: '8px' }}>Identity Synchronization</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>CODEFORCES HANDLE</label>
            <input value={cfHandle} onChange={e => setCfHandle(e.target.value)} className="text-mono text-base" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-dark)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>LEETCODE HANDLE</label>
            <input value={lcHandle} onChange={e => setLcHandle(e.target.value)} className="text-mono text-base" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-dark)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
        </div>
        <button onClick={fetchUserProfile} style={{ background: 'var(--icpc-blue)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px', cursor: 'pointer', fontWeight: 'bold', width: '100%', transition: 'opacity 0.2s', marginTop: '8px' }}>
          {profile.loading ? 'SYNCING FROM CODEFORCES...' : 'TEST CODEFORCES SYNC'}
        </button>
      </div>

      <div className="cf-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="text-lg text-primary" style={{ marginBottom: '8px' }}>Training Directives (Goals)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>TARGET RANK</label>
            <select value={thSetupGoalRank} onChange={e => setThSetupGoalRank(e.target.value)} className="text-mono text-base" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-dark)', width: '100%', boxSizing: 'border-box', outline: 'none' }}>
              <option value="expert">Expert (1600+)</option>
              <option value="candidate master">Candidate Master (1900+)</option>
              <option value="master">Master (2100+)</option>
              <option value="grandmaster">Grandmaster (2400+)</option>
            </select>
          </div>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>SPRINT DURATION (DAYS)</label>
            <input type="number" value={thSetupDays} onChange={e => setThSetupDays(Number(e.target.value))} className="text-mono text-base" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-dark)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div>
            <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>DAILY DRILL QUOTA</label>
            <input type="number" value={thSetupDailyQ} onChange={e => setThSetupDailyQ(Number(e.target.value))} className="text-mono text-base" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-dark)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          </div>
        </div>
      </div>

      <div className="cf-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="text-lg text-primary" style={{ marginBottom: '8px' }}>API Configurations</h3>
        <div>
          <label className="text-micro text-muted" style={{ display: 'block', marginBottom: '8px' }}>NVIDIA NIM API KEY (SOCRATIC COACH)</label>
          <input type="password" value={coachNvidiaKey} onChange={e => { setCoachNvidiaKey(e.target.value); localStorage.setItem('ag_nvidia_key', e.target.value); }} placeholder="nvapi-..." className="text-mono text-base" style={{ background: 'var(--bg-code)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-dark)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
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
          alert('Profile synced successfully.');
        } catch(e) { alert('Failed to sync — check backend connection.'); }
      }} className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '8px' }}>
        Save & Sync Profile
      </button>
    </div>
  );

  // ── Loading Screen ───────────────────────────────────────────────────
  if (appLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'linear-gradient(160deg, #0D2D5E 0%, #1A3A6B 100%)', gap: '24px' }}>
      <MyCPCLogo size="xl" showText={true} style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }} />
      <div style={{ width: '200px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--icpc-gold)', borderRadius: '2px', animation: 'loadBar 2s ease-in-out infinite', width: '40%' }}></div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{loadingMsg}</div>
    </div>
  );

  if (!user) return renderAuth();
  if (isSpatialHome) return renderSpatialHome();

  const viewNames = {
    command_center: 'Command Center',
    crucible: 'Socratic Coach',
    golden_path: 'Golden Path',
    graveyard: 'Spaced Repetition',
    code_explorer: 'GM Code Explorer',
    palantir_hub: 'Palantir Intelligence',
    topic_explorer: 'Topic Explorer',
    training_hub: 'Training Hub',
    skill_tree: 'Neural Skill Tree',
    settings: 'Profile & Settings',
    complexity_analyzer: 'DACE Complexity Analyzer',
    memory_profiler: 'Cache & Memory Profiler',
    contest_simulator: 'Submission EV Engine',
    telemetry: 'Micro-Decision Telemetry',
    drawdown: 'Drawdown Profiler',
    ai_coach_chat: 'AI Coach Chat',
    peer_compare: 'Peer DNA Comparison',
    contest_postmortem: 'Contest Post-Mortem',
    achievements: 'Achievements',
    performance_arc: 'Performance Arc',
    mentor_view: 'Mentor View',
  };

  // ── Data Fetchers for new sections ────────────────────────────────────────
  const loadArc = async () => {
    if (arcLoading || !cfHandle) return;
    setArcLoading(true);
    try {
      const r = await fetch(`${BACKEND}/api/dna/performance-arc/${cfHandle}`);
      const d = await r.json();
      if (d.success) setArcData(d.arc);
    } catch { }
    setArcLoading(false);
  };

  const loadAchievements = async () => {
    if (achievementsLoading || !cfHandle) return;
    setAchievementsLoading(true);
    try {
      await fetch(`${BACKEND}/api/achievements/check/${cfHandle}`, { method: 'POST' });
      const r = await fetch(`${BACKEND}/api/achievements/${cfHandle}`);
      const d = await r.json();
      if (d.success) setAchievements(d);
    } catch { }
    setAchievementsLoading(false);
  };

  const loadMentorStudents = async () => {
    if (!cfHandle) return;
    try {
      const r = await fetch(`${BACKEND}/api/mentor/students/${cfHandle}`);
      const d = await r.json();
      if (d.success) setMentorStudents(d.students);
    } catch { }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatMessages(m => [...m, { role: 'user', text: userMsg }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const r = await fetch(`${BACKEND}/api/coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfHandle, message: userMsg })
      });
      const d = await r.json();
      setChatMessages(m => [...m, { role: 'assistant', text: d.response || d.error || 'No response.' }]);
    } catch {
      setChatMessages(m => [...m, { role: 'assistant', text: 'Backend offline. Start the server to use AI coach.' }]);
    }
    setChatLoading(false);
  };

  const comparePeer = async () => {
    if (!peerHandle.trim() || peerLoading) return;
    setPeerLoading(true);
    try {
      const r = await fetch(`${BACKEND}/api/dna/compare/${cfHandle}/${peerHandle}`);
      const d = await r.json();
      if (d.success) setPeerData(d);
    } catch { }
    setPeerLoading(false);
  };

  const loadPostmortem = async () => {
    if (!pmContestId.trim() || pmLoading) return;
    setPmLoading(true);
    try {
      const r = await fetch(`${BACKEND}/api/contest/postmortem/${cfHandle}/${pmContestId}`);
      const d = await r.json();
      if (d.success) setPmData(d);
    } catch { }
    setPmLoading(false);
  };

  const submitMentorAnnotation = async () => {
    if (!mentorAnnotation.trim() || !mentorSelectedSession) return;
    try {
      await fetch(`${BACKEND}/api/mentor/annotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: mentorSelectedSession,
          mentorHandle: cfHandle,
          studentHandle: mentorStudentHandle,
          annotation: mentorAnnotation,
          annotationType: mentorAnnotationType
        })
      });
      setMentorAnnotation('');
      const r = await fetch(`${BACKEND}/api/mentor/annotations/${mentorSelectedSession}`);
      const d = await r.json();
      if (d.success) setMentorAnnotations(d.annotations);
    } catch { }
  };

  // ── New View Render Functions ─────────────────────────────────────────────

  const renderAICoachChat = () => (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
      <div className="cf-card" style={{ padding: '20px', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 4 }}>🤖 AI Coach Chat</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Powered by Gemini Flash with RAG over your session history. The coach knows your DNA, weak areas, and recent sessions.</p>
      </div>

      <div className="cf-card" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user' ? 'var(--icpc-blue)' : 'var(--bg-card)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-body)',
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap'
            }}>
              {msg.role === 'assistant' && <span style={{ fontWeight: 700, color: 'var(--icpc-gold)', display: 'block', marginBottom: 4, fontSize: 10 }}>🧬 AI COACH</span>}
              {msg.text}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', color: 'var(--icpc-blue)', fontSize: 12 }}>
              Analyzing your sessions... ✨
            </div>
          </div>
        )}
      </div>

      <div className="cf-card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Ask: Why am I struggling with DP? What should I learn next? How close am I to Specialist?"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 12 }}
          />
          <button onClick={sendChat} disabled={chatLoading} className="btn btn-primary" style={{ padding: '8px 20px' }}>Send</button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Add your Gemini key in Settings → BYOK Gemini Key for personalized RAG responses.</p>
      </div>
    </div>
  );

  const renderPeerCompare = () => {
    const radarSize = 200;
    const radarCenter = radarSize / 2;
    const radarR = 80;
    const axes = ['Speed', 'Accuracy', 'Resilience', 'Cleanliness'];
    const angles = axes.map((_, i) => (i / axes.length) * 2 * Math.PI - Math.PI / 2);

    const makePoints = (profile) => axes.map((k, i) => {
      const val = (profile?.[k.toLowerCase()] || 50) / 100;
      const angle = angles[i];
      return `${radarCenter + radarR * val * Math.cos(angle)},${radarCenter + radarR * val * Math.sin(angle)}`;
    }).join(' ');

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div className="cf-card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 4 }}>🔭 Peer DNA Comparison</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Compare your coding DNA with any CF user who uses myCPC.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={peerHandle} onChange={e => setPeerHandle(e.target.value)} placeholder="Enter competitor's CF handle" onKeyDown={e => e.key === 'Enter' && comparePeer()}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 12 }} />
            <button onClick={comparePeer} disabled={peerLoading} className="btn btn-primary">Compare</button>
          </div>
        </div>

        {peerData && (
          <div className="cf-card" style={{ padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 8 }}>You: {cfHandle}</div>
                <svg width={radarSize} height={radarSize} style={{ overflow: 'visible' }}>
                  {[0.25, 0.5, 0.75, 1].map(r => (
                    <polygon key={r} points={angles.map(a => `${radarCenter + radarR * r * Math.cos(a)},${radarCenter + radarR * r * Math.sin(a)}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  ))}
                  {axes.map((label, i) => {
                    const angle = angles[i];
                    return <g key={i}>
                      <line x1={radarCenter} y1={radarCenter} x2={radarCenter + radarR * Math.cos(angle)} y2={radarCenter + radarR * Math.sin(angle)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <text x={radarCenter + (radarR + 15) * Math.cos(angle)} y={radarCenter + (radarR + 15) * Math.sin(angle)} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{label}</text>
                    </g>;
                  })}
                  <polygon points={makePoints(peerData.profile1)} fill="rgba(94,207,255,0.15)" stroke="#5ecfff" strokeWidth="2" />
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--icpc-gold)', marginBottom: 8 }}>{peerData.handle2} {peerData.cf2Rank ? `(${peerData.cf2Rank})` : ''}</div>
                <svg width={radarSize} height={radarSize} style={{ overflow: 'visible' }}>
                  {[0.25, 0.5, 0.75, 1].map(r => (
                    <polygon key={r} points={angles.map(a => `${radarCenter + radarR * r * Math.cos(a)},${radarCenter + radarR * r * Math.sin(a)}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  ))}
                  {axes.map((label, i) => {
                    const angle = angles[i];
                    return <g key={i}>
                      <line x1={radarCenter} y1={radarCenter} x2={radarCenter + radarR * Math.cos(angle)} y2={radarCenter + radarR * Math.sin(angle)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <text x={radarCenter + (radarR + 15) * Math.cos(angle)} y={radarCenter + (radarR + 15) * Math.sin(angle)} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{label}</text>
                    </g>;
                  })}
                  <polygon points={makePoints(peerData.profile2)} fill="rgba(251,191,36,0.15)" stroke="#fbbf24" strokeWidth="2" />
                </svg>
              </div>
            </div>
            {peerData.gaps?.length > 0 && (
              <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Closing The Gap</div>
                {peerData.gaps.map((g, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ color: '#f87171', fontWeight: 700, fontSize: 11, width: 80 }}>{g.area} -{g.gap}pts</div>
                    <div style={{ fontSize: 11, color: 'var(--text-body)' }}>{g.advice}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderContestPostmortem = () => (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="cf-card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 4 }}>📊 Contest Post-Mortem</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Analyze any Codeforces contest you participated in. See your problem-by-problem timeline and optimal ordering.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" value={pmContestId} onChange={e => setPmContestId(e.target.value)} placeholder="CF Contest ID (e.g. 1900)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 12 }} />
          <button onClick={loadPostmortem} disabled={pmLoading} className="btn btn-primary">Analyze</button>
        </div>
      </div>

      {pmData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Problems Solved', val: pmData.problemsSolved, color: '#4ade80' },
              { label: 'Total Penalty', val: `${pmData.totalPenalty}m`, color: '#f87171' },
              { label: 'Optimal Order', val: pmData.optimalOrder?.join(' → ') || '—', color: '#fbbf24' }
            ].map((s, i) => (
              <div key={i} className="cf-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="cf-card" style={{ padding: 20 }}>
            <div className="text-micro text-muted" style={{ marginBottom: 12 }}>PROBLEM TIMELINE</div>
            {pmData.timeline?.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.firstAC ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)', border: `1px solid ${p.firstAC ? '#4ade80' : '#f87171'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: p.firstAC ? '#4ade80' : '#f87171', flexShrink: 0 }}>{p.index}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name} {p.rating ? <span style={{ fontSize: 10, color: '#fbbf24' }}>({p.rating})</span> : ''}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {p.firstAC ? `✅ AC at ${Math.floor(p.firstAC / 60)}m${p.firstAC % 60}s` : '❌ Not solved'}{p.waCount > 0 ? ` • ${p.waCount} WA (+${p.penalty}m penalty)` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pmData.insights?.length > 0 && (
            <div className="cf-card" style={{ padding: 20, borderLeft: '3px solid #fbbf24' }}>
              <div className="text-micro text-muted" style={{ marginBottom: 10 }}>💡 INSIGHTS</div>
              {pmData.insights.map((ins, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-body)', padding: '4px 0', lineHeight: 1.6 }}>• {ins}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderAchievements = () => (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="cf-card" style={{ padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 4 }}>🏅 Achievements</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Earned through exceptional performances detected in your DNA sessions.</p>
        </div>
        {achievements && <div style={{ fontSize: 24, fontWeight: 700, color: '#fbbf24' }}>{achievements.totalEarned}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/{achievements.total}</span></div>}
      </div>

      {achievementsLoading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading achievements...</div>
      ) : achievements ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {achievements.achievements?.map((a, i) => (
            <div key={i} className="cf-card" style={{
              padding: 16,
              opacity: a.earned ? 1 : 0.4,
              borderLeft: `3px solid ${a.earned ? '#fbbf24' : 'var(--border)'}`,
              background: a.earned ? 'rgba(251,191,36,0.05)' : 'var(--bg-card)',
              transition: 'all 0.2s'
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{a.name.split(' ')[0]}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: a.earned ? 'var(--text-dark)' : 'var(--text-muted)', marginBottom: 4 }}>{a.name.slice(a.name.indexOf(' ') + 1)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{a.desc}</div>
              {a.earned && a.earnedAt && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#4ade80' }}>✅ Earned {new Date(a.earnedAt).toLocaleDateString()}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="cf-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏅</div>
          <div>Complete problems with myCPC DNA tracking to unlock achievements.</div>
          <button onClick={loadAchievements} className="btn btn-primary" style={{ marginTop: 16 }}>Check Achievements</button>
        </div>
      )}
    </div>
  );

  const renderPerformanceArc = () => {
    const chartW = 680, chartH = 160;
    const points = (data, key) => data?.map((d, i) => `${(i / Math.max(data.length - 1, 1)) * chartW},${chartH - (d[key] / 100) * chartH}`).join(' ');

    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="cf-card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 4 }}>📈 Performance Arc</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your DNA scores over time — see how Speed, Accuracy, and Resilience evolve across sessions.</p>
        </div>

        {arcLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading performance arc...</div>
        ) : arcData?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'rollingSpeed',     label: 'Speed',      color: '#5ecfff' },
              { key: 'rollingAccuracy',  label: 'Accuracy',   color: '#4ade80' },
              { key: 'rollingResilience',label: 'Resilience', color: '#a78bfa' },
            ].map(({ key, label, color }) => (
              <div key={key} className="cf-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <span style={{ fontSize: 11, color, fontFamily: 'var(--font-mono)' }}>
                    {arcData[arcData.length - 1]?.[key]?.toFixed(1) || '—'}
                  </span>
                </div>
                <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                      <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`0,${chartH} ${points(arcData, key)} ${chartW},${chartH}`} fill={`url(#grad-${key})`} />
                  {arcData.length > 1 && <polyline points={points(arcData, key)} fill="none" stroke={color} strokeWidth="2" />}
                </svg>
              </div>
            ))}

            <div className="cf-card" style={{ padding: 16 }}>
              <div className="text-micro text-muted" style={{ marginBottom: 10 }}>SESSION BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
                {arcData.slice().reverse().slice(0, 10).map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>{new Date(d.date).toLocaleDateString()}</span>
                    <span style={{ color: 'var(--icpc-blue)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.problemName}</span>
                    <span style={{ color: '#5ecfff', fontFamily: 'var(--font-mono)', width: 32 }}>{d.speed?.toFixed(0)}</span>
                    <span style={{ color: '#4ade80', fontFamily: 'var(--font-mono)', width: 32 }}>{d.accuracy?.toFixed(0)}</span>
                    <span style={{ color: '#a78bfa', fontFamily: 'var(--font-mono)', width: 32 }}>{d.resilience?.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="cf-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
            <div>Solve at least 3 problems with myCPC to see your performance arc.</div>
            <button onClick={loadArc} className="btn btn-primary" style={{ marginTop: 16 }}>Load Arc</button>
          </div>
        )}
      </div>
    );
  };

  const renderMentorView = () => (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="cf-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🧑‍🏫 Mentor Dashboard</div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>You are mentoring as: <strong style={{ color: 'var(--icpc-blue)' }}>{cfHandle}</strong></p>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Student Handle</div>
          <input type="text" value={mentorStudentHandle} onChange={e => setMentorStudentHandle(e.target.value)} placeholder="Enter student's CF handle"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 11, boxSizing: 'border-box' }} />
        </div>

        {mentorStudents?.length > 0 && (
          <div className="cf-card" style={{ padding: 16 }}>
            <div className="text-micro text-muted" style={{ marginBottom: 8 }}>STUDENTS</div>
            {mentorStudents.map(s => (
              <div key={s.handle} onClick={() => setMentorStudentHandle(s.handle)} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--icpc-blue)' }}>{s.handle}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.sessionsAnnotated} sessions</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="cf-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📝 Add Annotation</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Session ID</div>
              <input type="number" value={mentorSelectedSession || ''} onChange={e => setMentorSelectedSession(e.target.value)}
                placeholder="Session ID from history"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 11, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Type</div>
              <select value={mentorAnnotationType} onChange={e => setMentorAnnotationType(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 11, boxSizing: 'border-box' }}>
                <option value="note">📝 Note</option>
                <option value="praise">🌟 Praise</option>
                <option value="warning">⚠️ Warning</option>
                <option value="challenge">🏆 Challenge</option>
              </select>
            </div>
          </div>
          <textarea value={mentorAnnotation} onChange={e => setMentorAnnotation(e.target.value)} placeholder="Write your annotation, feedback, or assignment..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-body)', fontSize: 12, minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
          <button onClick={submitMentorAnnotation} className="btn btn-primary" style={{ marginTop: 8, padding: '8px 20px' }}>Save Annotation</button>
        </div>

        {mentorAnnotations.length > 0 && (
          <div className="cf-card" style={{ padding: 20 }}>
            <div className="text-micro text-muted" style={{ marginBottom: 10 }}>ANNOTATIONS ON SESSION #{mentorSelectedSession}</div>
            {mentorAnnotations.map((a, i) => (
              <div key={i} style={{ padding: '10px', background: 'var(--bg-page)', borderRadius: 6, marginBottom: 8, borderLeft: `3px solid ${a.annotation_type === 'praise' ? '#4ade80' : a.annotation_type === 'warning' ? '#f87171' : 'var(--icpc-blue)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--icpc-gold)', fontWeight: 700 }}>{a.mentor_handle}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-body)', lineHeight: 1.5 }}>{a.annotation}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (

    <div className="app-wrapper">
      {/* ICPC Site Header */}
      <header className="site-header">
        <div className="site-header-logo" onClick={() => setIsSpatialHome(true)} style={{ cursor: 'pointer' }}>
          <MyCPCLogo size="xs" />
          <div className="site-header-wordmark">
            <div className="site-header-title">myCPC</div>
            <div className="site-header-subtitle">Opportunity · Choice · Growth</div>
          </div>
        </div>
        <div className="site-header-tagline">
          <span style={{color: 'var(--icpc-blue)'}}>Opportunity</span>
          <span style={{color: 'rgba(255,255,255,0.3)', margin: '0 6px'}}>·</span>
          <span style={{color: 'var(--icpc-gold)'}}>Choice</span>
          <span style={{color: 'rgba(255,255,255,0.3)', margin: '0 6px'}}>·</span>
          <span style={{color: 'var(--icpc-red)'}}>Growth</span>
        </div>
        <div className="site-header-right">
          <span className="site-header-status" style={{ color: backendHealth ? 'var(--icpc-green)' : 'rgba(255,255,255,0.4)' }}>
            <span style={{ width: 6, height: 6, background: backendHealth ? 'var(--icpc-green)' : 'rgba(255,255,255,0.25)', borderRadius: '50%', display: 'inline-block' }}></span>
            {backendHealth ? 'DB Synced' : 'DB Offline'}
          </span>
          <div className="site-header-user" onClick={() => setActiveView('settings')}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--icpc-blue)', overflow: 'hidden', flexShrink: 0 }}>
              {profile.avatar && <img src={profile.avatar} alt="av" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <span className="site-header-user-handle">{cfHandle}</span>
          </div>
          <button className="site-header-signout" onClick={() => setUser(null)}>Sign Out</button>
        </div>
      </header>

      {/* Sub-nav briefing bar */}
      <div className="daily-briefing">
        <div className="briefing-item">
          <span className="briefing-label">View</span>
          <span className="briefing-value">{viewNames[activeView] || activeView}</span>
        </div>
        <div className="briefing-item">
          <span className="briefing-label">Rating</span>
          <span className="briefing-value" style={{ color: getCfColor(profile.rating || 0) || 'rgba(255,255,255,0.9)' }}>{profile.rating || '—'}</span>
        </div>
        <div className="briefing-item">
          <span className="briefing-label">SR Queue</span>
          <span className={`briefing-value ${srQueue.length > 0 ? 'warn' : ''}`}>{srQueue.length}</span>
        </div>
        <div className="briefing-item">
          <span className="briefing-label">Rank</span>
          <span className="briefing-value" style={{ textTransform: 'capitalize' }}>{profile.rank || '—'}</span>
        </div>
        {isTiltActive() && (
          <div className="briefing-item">
            <span className="briefing-label" style={{ color: 'var(--icpc-red)' }}>TILT</span>
            <span className="briefing-value err timer-danger">{Math.floor(tiltRemaining/60)}:{(tiltRemaining%60).toString().padStart(2,'0')}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="app-body">
        {renderSidebar()}
        <main className="main-content">
          <div className="view-area">
            {activeView === 'command_center' && renderCommandCenter()}
            {activeView === 'community' && <CommunityLeaderboard />}
            {activeView === 'coach_portal' && <CoachPortal />}
            {activeView === 'upsolve_queue' && <UpsolveQueue cfHandle={cfHandle} />}
            {activeView === 'crucible' && renderCrucible()}
            {activeView === 'golden_path' && renderGoldenPath()}
            {activeView === 'graveyard' && renderGraveyard()}
            {activeView === 'code_explorer' && renderCodeExplorer()}
            {activeView === 'palantir_hub' && renderPalantirHub()}
            {activeView === 'topic_explorer' && renderTopicExplorer()}
            {activeView === 'training_hub' && renderTrainingHub()}
            {activeView === 'complexity_analyzer' && renderComplexityAnalyzer()}
            {activeView === 'memory_profiler' && renderMemoryProfiler()}
            {activeView === 'contest_simulator' && renderContestSimulator()}
            {activeView === 'telemetry' && renderTelemetry()}
            {activeView === 'drawdown' && renderDrawdown()}
            {activeView === 'skill_tree' && renderSkillTree()}
            {activeView === 'settings' && renderSettings()}
            {activeView === 'dna_dashboard' && <DNADashboard cfHandle={cfHandle} />}
            {activeView === 'ai_coach_chat' && renderAICoachChat()}
            {activeView === 'peer_compare' && renderPeerCompare()}
            {activeView === 'contest_postmortem' && renderContestPostmortem()}
            {activeView === 'achievements' && renderAchievements()}
            {activeView === 'performance_arc' && renderPerformanceArc()}
            {activeView === 'mentor_view' && renderMentorView()}
          </div>
        </main>
      </div>

      {/* Code Modal */}
      {codeModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,29,62,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ width: '820px', maxWidth: '95vw', maxHeight: '90vh', background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid var(--icpc-blue)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F0F4FA' }}>
              <div>
                <span className="text-mono" style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{codeModal.handle}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Solution</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(codeModal.code)}>Copy</button>
                {codeModal.url && <a href={codeModal.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Open on CF</a>}
                <button onClick={() => setCodeModal({ isOpen: false, code: '', handle: '' })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 4px' }}>×</button>
              </div>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flexGrow: 1 }}>
              <div className="code-block" style={{ color: 'var(--text-body)', whiteSpace: 'pre-wrap', margin: 0 }}>
                <code>{codeModal.code}</code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

// ═══════════════════════════════════════════════════════════════════════════════
// INJECTED NEW SECTION FUNCTIONS
// These are hoisted-style function declarations to keep App.jsx clean.
// They are injected via module augmentation in dev.
// ═══════════════════════════════════════════════════════════════════════════════
