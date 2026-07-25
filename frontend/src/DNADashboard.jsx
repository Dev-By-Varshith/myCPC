import { useState, useEffect, useRef } from 'react';
import { Dna, Zap, TrendingUp, AlertCircle, CheckCircle, Clock, RefreshCw, Key, ExternalLink } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

// ── Radar Chart (pure SVG, no libraries) ─────────────────────────────────────
function RadarChart({ axes }) {
  const cx = 120, cy = 120, r = 90;
  const labels = [
    { key: 'speed', label: 'Speed', angle: -90 },
    { key: 'accuracy', label: 'Accuracy', angle: -18 },
    { key: 'resilience', label: 'Resilience', angle: 54 },
    { key: 'cleanliness', label: 'Cleanliness', angle: 126 },
  ];

  const toXY = (angle, radius) => ({
    x: cx + radius * Math.cos((angle * Math.PI) / 180),
    y: cy + radius * Math.sin((angle * Math.PI) / 180),
  });

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const axisColors = ['#5ecfff', '#4ade80', '#fbbf24', '#a78bfa'];

  const dataPoints = labels.map(({ key, angle }) => {
    const val = (axes?.[key] || 0) / 100;
    const { x, y } = toXY(angle, val * r);
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: 220, display: 'block', margin: '0 auto' }}>
      {/* Grid */}
      {gridLevels.map((level, li) => {
        const pts = labels.map(({ angle }) => {
          const { x, y } = toXY(angle, level * r);
          return `${x},${y}`;
        });
        return (
          <polygon
            key={li}
            points={pts.join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
        );
      })}
      {/* Axis lines */}
      {labels.map(({ angle }, i) => {
        const end = toXY(angle, r);
        return (
          <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y}
            stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        );
      })}
      {/* Data polygon */}
      <polygon points={dataPoints.join(' ')}
        fill="rgba(94,207,255,0.12)" stroke="#5ecfff" strokeWidth="2" />
      {/* Data dots */}
      {labels.map(({ key, angle }, i) => {
        const val = (axes?.[key] || 0) / 100;
        const { x, y } = toXY(angle, val * r);
        return <circle key={i} cx={x} cy={y} r={4} fill={axisColors[i]} />;
      })}
      {/* Labels */}
      {labels.map(({ label, angle }, i) => {
        const { x, y } = toXY(angle, r + 18);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill={axisColors[i]} fontSize="9" fontFamily="monospace" fontWeight="700">
            {label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

// ── Growth Sparkline ─────────────────────────────────────────────────────────
function GrowthSparkline({ trajectory }) {
  if (!trajectory || trajectory.length < 2) return null;
  const vals = trajectory.map(t => t.accuracy || 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const W = 300, H = 60;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * H;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 60, display: 'block' }}>
      <polyline points={points} fill="none" stroke="#5ecfff" strokeWidth="2" />
      <circle cx={vals.length > 1 ? W : 0} cy={H - ((vals[vals.length - 1] - min) / (max - min || 1)) * H}
        r="4" fill="#5ecfff" />
    </svg>
  );
}

// ── Axis Bar ─────────────────────────────────────────────────────────────────
function AxisBar({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
        <div style={{
          height: '100%', width: `${value}%`, background: color,
          borderRadius: 4, transition: 'width 0.8s ease'
        }} />
      </div>
    </div>
  );
}

// ── Report Card (history item) ────────────────────────────────────────────────
function ReportCard({ report, onClick, isSelected }) {
  const axes = report.dna_axes || {};
  const signals = report.style_signals || [];
  const totalMins = report.total_time_sec ? Math.round(report.total_time_sec / 60) : '?';
  const date = report.generated_at ? new Date(report.generated_at).toLocaleDateString() : '';

  return (
    <div
      onClick={onClick}
      className="cf-card"
      style={{
        cursor: 'pointer',
        padding: '16px',
        border: isSelected ? '1px solid var(--icpc-blue)' : '1px solid var(--border)',
        background: isSelected ? 'rgba(94,207,255,0.06)' : 'var(--bg-card)',
        transition: 'all 0.2s',
        gap: 0
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--icpc-blue)', fontWeight: 700 }}>
          {report.problem_name || 'Unknown Problem'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{date}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
        {report.style_summary?.slice(0, 100)}...
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {signals.slice(0, 3).map((s, i) => (
          <span key={i} style={{
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
            color: '#a78bfa', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontFamily: 'monospace'
          }}>{s}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⏱ {totalMins}m</span>
        {report.wa_count > 0 && <span style={{ fontSize: 11, color: '#f87171' }}>✗ {report.wa_count} WA</span>}
        {axes.accuracy && <span style={{ fontSize: 11, color: '#4ade80' }}>⚡ Acc {Math.round(axes.accuracy)}</span>}
      </div>
    </div>
  );
}

// ── Full Report View ──────────────────────────────────────────────────────────
function FullReportView({ sessionId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`${BACKEND}/api/dna/report/${sessionId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div className="text-mono text-sm text-muted">Loading report...</div>
    </div>
  );

  if (!data) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div className="text-mono text-sm text-muted">Report not found.</div>
    </div>
  );

  const { report, session } = data;
  const axes = report.dna_axes || {};
  const growth = report.growth_plan || [];
  const struggles = report.struggle_points || [];
  const signals = session?.style_signals || [];
  const totalMins = session?.total_time_sec ? Math.round(session.total_time_sec / 60) : '?';

  const axisColor = v => v >= 75 ? '#4ade80' : v >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Solve Time', value: `${totalMins}m`, color: 'var(--icpc-blue)' },
          { label: 'Compilations', value: session?.compilation_attempts ?? '?', color: 'var(--text-primary)' },
          { label: 'Wrong Answers', value: session?.wa_count ?? '?', color: '#f87171' },
          { label: 'Rewrites', value: session?.rewrite_count ?? '?', color: '#fbbf24' },
        ].map((s, i) => (
          <div key={i} className="cf-table-container" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
            <div className="text-micro text-muted" style={{ marginTop: 4 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        {/* Radar + Axes */}
        <div className="cf-card" style={{ gap: 16 }}>
          <div className="text-micro text-muted">DNA RADAR</div>
          <RadarChart axes={axes} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(axes).map(([key, val]) => (
              <AxisBar key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}
                value={val} color={axisColor(val)} />
            ))}
          </div>
        </div>

        {/* Style + Merit/Demerit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cf-card" style={{ gap: 12 }}>
            <div className="text-micro text-muted">🧠 THOUGHT PROCESS STYLE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {signals.map((s, i) => (
                <span key={i} style={{
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                  color: '#a78bfa', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontFamily: 'monospace'
                }}>{s}</span>
              ))}
            </div>
            <div style={{
              borderLeft: '3px solid var(--icpc-blue)', paddingLeft: 14,
              color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7
            }}>
              {report.style_summary}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
              <div style={{
                background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
                borderRadius: 8, padding: '12px 14px'
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#4ade80', marginBottom: 6 }}>
                  ✅ KEY STRENGTH
                </div>
                <div style={{ color: '#4ade80', fontSize: 12, lineHeight: 1.6 }}>{report.raw_llm_response?.merit || '—'}</div>
              </div>
              <div style={{
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                borderRadius: 8, padding: '12px 14px'
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#f87171', marginBottom: 6 }}>
                  🔴 GROWTH AREA
                </div>
                <div style={{ color: '#f87171', fontSize: 12, lineHeight: 1.6 }}>{report.raw_llm_response?.demerit || '—'}</div>
              </div>
            </div>
          </div>

          {/* Pivot Analysis */}
          <div className="cf-card" style={{ gap: 12 }}>
            <div className="text-micro text-muted">↗️ PIVOT ANALYSIS</div>
            <div style={{ borderLeft: '3px solid #fbbf24', paddingLeft: 14, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
              {report.pivot_analysis || 'No significant pivot detected.'}
            </div>
          </div>
        </div>
      </div>

      {/* Struggle Points */}
      {struggles.length > 0 && (
        <div className="cf-card" style={{ gap: 14 }}>
          <div className="text-micro text-muted">🔴 STRUGGLE POINTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {struggles.map((sp, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.12)',
                borderRadius: 8, padding: '12px 14px'
              }}>
                <div style={{
                  fontFamily: 'monospace', fontSize: 11, color: '#f87171',
                  background: 'rgba(248,113,113,0.1)', padding: '2px 8px', borderRadius: 4,
                  whiteSpace: 'nowrap', marginTop: 2
                }}>{sp.timestamp || `~${i * 5}m`}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fca5a5', marginBottom: 3 }}>{sp.issue}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{sp.explanation}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Growth Plan */}
      <div className="cf-card" style={{ gap: 14 }}>
        <div className="text-micro text-muted">🚀 PERSONALIZED GROWTH PLAN</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {growth.map((g, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              background: 'rgba(94,207,255,0.04)', border: '1px solid rgba(94,207,255,0.1)',
              borderRadius: 10, padding: '14px 16px'
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #5ecfff, #818cf8)',
                color: '#0a0e1a', fontWeight: 800, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--icpc-blue)', marginBottom: 4 }}>{g.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{g.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DNADashboard({ cfHandle }) {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [geminiKey, setGeminiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'history' | 'settings'

  const load = async () => {
    setLoading(true);
    try {
      const [profileRes, historyRes, quotaRes] = await Promise.all([
        fetch(`${BACKEND}/api/dna/profile/${cfHandle}`).then(r => r.json()),
        fetch(`${BACKEND}/api/dna/history/${cfHandle}?limit=20`).then(r => r.json()),
        fetch(`${BACKEND}/api/dna/user-quota/${cfHandle}`).then(r => r.json()),
      ]);
      if (profileRes.success) setProfile(profileRes.profile);
      if (historyRes.success) {
        setHistory(historyRes.history);
        if (historyRes.history.length > 0 && !selectedReport) {
          setSelectedReport(historyRes.history[0].session_id);
        }
      }
      if (quotaRes.success) setQuota(quotaRes);
    } catch (e) {
      console.error('[DNA Dashboard] Load error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (cfHandle) load();
  }, [cfHandle]);

  const saveKey = async () => {
    if (!geminiKey.trim()) return;
    setSavingKey(true);
    try {
      await fetch(`${BACKEND}/api/dna/user-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfHandle, geminiKey: geminiKey.trim() })
      });
      setKeySaved(true);
      setGeminiKey('');
      setTimeout(() => setKeySaved(false), 3000);
      load();
    } catch (e) { console.error(e); }
    setSavingKey(false);
  };

  const axisColor = v => v >= 75 ? '#4ade80' : v >= 50 ? '#fbbf24' : '#f87171';

  if (!cfHandle) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Dna size={32} style={{ color: 'var(--icpc-blue)', marginBottom: 16 }} />
        <div className="text-mono text-muted">Set your Codeforces handle in Settings to view your DNA profile.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        {[
          { id: 'profile', label: '🧬 DNA Profile', icon: Dna },
          { id: 'history', label: '📋 Session History', icon: Clock },
          { id: 'settings', label: '⚙️ API Settings', icon: Key },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: activeTab === tab.id ? 'rgba(94,207,255,0.08)' : 'transparent',
            color: activeTab === tab.id ? 'var(--icpc-blue)' : 'var(--text-muted)',
            borderBottom: activeTab === tab.id ? '2px solid var(--icpc-blue)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}>{tab.label}</button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', padding: '10px 14px'
        }} title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>

        {/* ── Profile Tab ── */}
        {activeTab === 'profile' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="text-mono text-muted">Loading DNA profile...</div>
            </div>
          ) : !profile ? (
            <div style={{ textAlign: 'center', padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Dna size={40} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <div className="text-mono text-muted">No DNA profile yet. Solve a problem in VS Code to start building your profile!</div>
              <div style={{
                background: 'rgba(94,207,255,0.06)', border: '1px solid rgba(94,207,255,0.15)',
                borderRadius: 10, padding: '16px 24px', fontSize: 12, color: 'var(--text-secondary)',
                maxWidth: 480, lineHeight: 1.7
              }}>
                💡 Install the myCPC VS Code extension → fetch a problem via Competitive Companion → solve it → your DNA report auto-generates on AC!
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
              {/* Left: Radar + stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="cf-card" style={{ gap: 14 }}>
                  <div className="text-micro text-muted">CUMULATIVE DNA RADAR</div>
                  <RadarChart axes={{
                    speed: profile.avg_speed_score,
                    accuracy: profile.avg_accuracy_score,
                    cleanliness: profile.avg_cleanliness_score,
                    resilience: profile.avg_resilience_score
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      ['Speed', profile.avg_speed_score],
                      ['Accuracy', profile.avg_accuracy_score],
                      ['Cleanliness', profile.avg_cleanliness_score],
                      ['Resilience', profile.avg_resilience_score],
                    ].map(([label, val]) => (
                      <AxisBar key={label} label={label} value={val} color={axisColor(val)} />
                    ))}
                  </div>
                </div>
                <div className="cf-card" style={{ gap: 10 }}>
                  <div className="text-micro text-muted">SESSIONS ANALYZED</div>
                  <div style={{ fontSize: 32, fontFamily: 'monospace', fontWeight: 800, color: 'var(--icpc-blue)' }}>
                    {profile.total_sessions}
                  </div>
                  {quota && (
                    <div style={{
                      fontSize: 11, color: quota.remaining <= 2 ? '#fbbf24' : '#4ade80',
                      background: quota.remaining <= 2 ? 'rgba(251,191,36,0.08)' : 'rgba(0,255,136,0.06)',
                      border: `1px solid ${quota.remaining <= 2 ? 'rgba(251,191,36,0.2)' : 'rgba(0,255,136,0.15)'}`,
                      borderRadius: 8, padding: '6px 10px'
                    }}>
                      {quota.hasByok ? '🔑 Using your own Gemini key — unlimited' : `${quota.remaining}/${quota.limit} free analyses this month`}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Merits + Demerits + Growth */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="cf-card" style={{ gap: 14 }}>
                  <div className="text-micro text-muted">🏆 ALL-TIME STRENGTHS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(profile.top_merits || []).slice(0, 5).map((m, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)',
                        borderRadius: 8, padding: '10px 12px'
                      }}>
                        <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 12, color: '#4ade80', lineHeight: 1.5 }}>{m}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cf-card" style={{ gap: 14 }}>
                  <div className="text-micro text-muted">🔴 RECURRING GROWTH AREAS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(profile.top_demerits || []).slice(0, 5).map((d, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.12)',
                        borderRadius: 8, padding: '10px 12px'
                      }}>
                        <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 12, color: '#f87171', lineHeight: 1.5 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cf-card" style={{ gap: 14 }}>
                  <div className="text-micro text-muted">📈 ACCURACY GROWTH TRAJECTORY</div>
                  <GrowthSparkline trajectory={profile.growth_trajectory} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Last {(profile.growth_trajectory || []).length} sessions
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, height: '100%' }}>
            {/* Report list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: '75vh' }}>
              {loading && <div className="text-mono text-muted text-sm">Loading...</div>}
              {!loading && history.length === 0 && (
                <div className="text-mono text-muted text-sm">No sessions analyzed yet.</div>
              )}
              {history.map(r => (
                <ReportCard
                  key={r.session_id}
                  report={r}
                  onClick={() => setSelectedReport(r.session_id)}
                  isSelected={selectedReport === r.session_id}
                />
              ))}
            </div>
            {/* Full report */}
            <div style={{ overflowY: 'auto', maxHeight: '75vh' }}>
              {selectedReport
                ? <FullReportView sessionId={selectedReport} />
                : <div className="text-mono text-muted text-sm" style={{ padding: 40, textAlign: 'center' }}>Select a report to view details.</div>
              }
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="cf-card" style={{ gap: 16 }}>
              <div className="text-micro text-muted">🔑 BRING YOUR OWN GEMINI KEY (BYOK)</div>
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7,
                background: 'rgba(94,207,255,0.04)', borderRadius: 8, padding: '12px 16px',
                border: '1px solid rgba(94,207,255,0.1)'
              }}>
                The free tier gives you <strong>10 DNA analyses/month</strong> using the platform's shared Gemini key pool.
                Add your own free key from{' '}
                <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--icpc-blue)' }}>aistudio.google.com</a>{' '}
                for <strong>unlimited analyses</strong>. Your key is stored securely on the backend.
              </div>
              {quota && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current status</span>
                  <span style={{ fontSize: 12, color: quota.hasByok ? '#4ade80' : 'var(--icpc-blue)', fontWeight: 600 }}>
                    {quota.hasByok ? '✅ BYOK Active — Unlimited' : `${quota.remaining}/${quota.limit} free left this month`}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza... (your Gemini API key)"
                  style={{
                    flex: 1, padding: '10px 14px', background: 'var(--bg-code)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={saveKey}
                  disabled={savingKey || !geminiKey.trim()}
                  style={{
                    padding: '10px 20px', background: 'var(--icpc-blue)', color: '#0a0e1a',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12
                  }}
                >
                  {savingKey ? 'Saving...' : keySaved ? '✓ Saved!' : 'Save Key'}
                </button>
              </div>
            </div>

            <div className="cf-card" style={{ gap: 14 }}>
              <div className="text-micro text-muted">📊 HOW THE KEY POOL WORKS (SaaS Scale)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <p>• The platform maintains a <strong style={{ color: 'var(--text-primary)' }}>pool of Gemini keys</strong> that rotate automatically (round-robin, lowest-load-first).</p>
                <p>• Gemini Flash free tier = <strong style={{ color: 'var(--text-primary)' }}>1,500 requests/day per key</strong>. With 10 keys = 15,000 free analyses/day.</p>
                <p>• Each user's monthly quota is tracked independently in the database.</p>
                <p>• Users with their own key bypass the quota entirely — <strong style={{ color: '#4ade80)' }}>zero platform cost</strong>.</p>
                <p>• At 100k users: ~3% likely to actively analyze (3k/day) — comfortably within a 10-key pool.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
