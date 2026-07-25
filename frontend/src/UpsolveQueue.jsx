import React, { useState, useEffect } from 'react';
import { Clock, RotateCcw } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

const UpsolveQueue = ({ cfHandle }) => {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const handle = cfHandle || localStorage.getItem('ag_cf_handle') || '';
        if (!handle) { setLoading(false); return; }
        
        setLoading(true);
        fetch(`${BACKEND}/api/upsolve/queue/${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setQueue(data.queue);
                }
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    }, [cfHandle]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="cf-card" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RotateCcw color="#30d158" /> Upsolve Queue
                </h2>
                <p className="text-secondary" style={{ marginTop: '8px', maxWidth: '600px', lineHeight: 1.5 }}>
                    Spaced-repetition engine. Problems you failed are placed here and become "Due" after 3 days to maximize retention.
                </p>
            </div>

            {loading ? (
                <div className="cf-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading your upsolve queue...</div>
            ) : queue.length === 0 ? (
                <div className="cf-card" style={{ padding: '32px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>🎉 No problems to upsolve! You're all caught up.</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>Failed problems will appear here automatically once your session data is processed.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
                    {queue.map((prob, idx) => (
                        <div key={idx} className="cf-card" style={{ 
                            padding: '20px', 
                            border: prob.status === 'due' ? '1px solid var(--cf-tle-orange)' : '1px solid var(--border)',
                            background: prob.status === 'due' ? 'rgba(255,165,0,0.05)' : 'var(--bg-code)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="text-mono" style={{ color: 'var(--icpc-blue)', fontWeight: 700, fontSize: '18px' }}>{prob.problemId}</span>
                                    {prob.status === 'due' && <span style={{ background: 'var(--cf-tle-orange)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>DUE NOW</span>}
                                </div>
                                <span className="text-mono" style={{ color: 'var(--accent-red-muted)', fontSize: '14px', fontWeight: 600 }}>{prob.verdict}</span>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={14} /> Failed {prob.daysSince} day{prob.daysSince !== 1 ? 's' : ''} ago
                                </div>
                                <a href={`https://codeforces.com/problemset/problem/${prob.problemId.replace(/([A-Z])/,'/$1')}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px', textDecoration: 'none' }}>
                                    ATTEMPT AGAIN
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default UpsolveQueue;
