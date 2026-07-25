import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

const CoachReportView = ({ sessionId }) => {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!sessionId) {
            setReport(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`${BACKEND}/api/coach/report/${sessionId}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setReport(data.report);
                } else {
                    setError(data.error || 'Failed to load report');
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Could not connect to backend');
                setLoading(false);
            });
    }, [sessionId]);

    if (!sessionId) return (
        <div className="cf-card" style={{ padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>No session data yet.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>Complete a coding session with the VS Code extension to generate your first AI coach report.</p>
        </div>
    );

    if (loading) return <div className="cf-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Generating Coach Report... ⏳</div>;
    
    if (error) return <div className="cf-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--accent-red-muted)' }}>{error}</div>;
    
    if (!report) return <div className="cf-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No report available for this session.</div>;

    let mistakes = [];
    let trend = {};
    try { mistakes = JSON.parse(report.diagnosed_mistakes || '[]'); } catch { mistakes = []; }
    try { trend = JSON.parse(report.topic_trend || '{}'); } catch { trend = {}; }

    return (
        <div className="cf-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div>
                <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'white', margin: 0 }}>{report.headline}</h2>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(48,209,88,0.1)', color: '#30d158', padding: '6px 12px', borderRadius: '4px', marginTop: '12px', fontSize: '14px', fontWeight: 600 }}>
                    <CheckCircle2 size={16} />
                    {report.highlight}
                </div>
            </div>

            {/* Diagnosed Mistakes */}
            {mistakes.length > 0 && (
                <div>
                    <h3 className="text-micro text-muted" style={{ marginBottom: '12px' }}>DIAGNOSED MISTAKES</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {mistakes.map((m, i) => (
                            <div key={i} style={{ background: 'rgba(255,107,107,0.05)', borderLeft: '3px solid var(--accent-red-muted)', padding: '16px', borderRadius: '0 8px 8px 0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ color: 'white', fontWeight: 700 }}>{m.issue}</span>
                                    <span className="text-mono" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>⏱ {m.timestamp}</span>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>{m.explanation}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Socratic Question */}
            {report.socratic_question && (
                <div style={{ border: '1px solid var(--icpc-gold)', borderRadius: '8px', padding: '20px', background: 'rgba(240,168,0,0.05)' }}>
                    <h3 className="text-micro" style={{ color: 'var(--icpc-gold)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} /> COACH'S QUESTION
                    </h3>
                    <p style={{ color: 'white', fontSize: '16px', fontWeight: 500, margin: 0, fontStyle: 'italic' }}>
                        "{report.socratic_question}"
                    </p>
                </div>
            )}

            {/* Topic Trend */}
            {trend.tag && (
                <div>
                    <h3 className="text-micro text-muted" style={{ marginBottom: '12px' }}>SKILL GRAPH UPDATE</h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-dark)', padding: '12px 16px', borderRadius: '6px' }}>
                        <span className="text-mono text-sm" style={{ color: 'white' }}>{trend.tag}</span>
                        <span className="text-mono text-sm" style={{ color: trend.status && trend.status.toLowerCase().includes('review') ? 'var(--accent-red-muted)' : '#30d158' }}>{trend.status}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CoachReportView;
