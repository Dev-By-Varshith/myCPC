import React, { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

const CommunityLeaderboard = () => {
    const [tag, setTag] = useState('dp');
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    const tags = ['dp', 'graphs', 'math', 'greedy', 'data structures', 'geometry', 'strings', 'binary search', 'two pointers'];

    useEffect(() => {
        setLoading(true);
        fetch(`${BACKEND}/api/community/leaderboard/${encodeURIComponent(tag)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setLeaderboard(data.leaderboard || []);
                } else {
                    setLeaderboard([]);
                }
                setLoading(false);
            })
            .catch(() => {
                setLeaderboard([]);
                setLoading(false);
            });
    }, [tag]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="cf-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Trophy color="#F0A800" /> Global Leaderboards
                        </h2>
                        <p className="text-secondary" style={{ marginTop: '4px' }}>Rankings based on MyCPC Per-Topic Elo Engine</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {tags.map(t => (
                            <button 
                                key={t} 
                                onClick={() => setTag(t)}
                                style={{
                                    background: tag === t ? 'rgba(94,207,255,0.1)' : 'transparent',
                                    color: tag === t ? 'var(--icpc-blue)' : 'var(--text-muted)',
                                    border: `1px solid ${tag === t ? 'var(--icpc-blue)' : 'var(--border)'}`,
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    fontSize: '12px',
                                    fontWeight: 600
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="cf-table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px' }}>RANK</th>
                            <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px' }}>HANDLE</th>
                            <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px' }}>{tag.toUpperCase()} ELO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading rankings...</td></tr>
                        ) : leaderboard.length === 0 ? (
                            <tr><td colSpan="3" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No rankings yet for <strong style={{ color: 'white' }}>{tag}</strong>. Be the first to solve problems with this tag!
                            </td></tr>
                        ) : (
                            leaderboard.map((user, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx === 0 ? 'rgba(240,168,0,0.05)' : 'transparent' }}>
                                    <td style={{ padding: '16px', color: idx < 3 ? '#F0A800' : 'white', fontWeight: 800 }}>#{idx + 1}</td>
                                    <td style={{ padding: '16px', color: 'white', fontWeight: 600, fontSize: '16px' }}>{user.cf_handle}</td>
                                    <td style={{ padding: '16px', textAlign: 'right', color: '#30d158', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>
                                        {Math.round(user.elo_rating)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CommunityLeaderboard;
