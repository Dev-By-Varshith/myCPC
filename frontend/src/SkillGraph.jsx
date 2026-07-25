import React, { useState, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

const SkillGraph = ({ cfHandle }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!cfHandle) return;
        setLoading(true);
        setError(null);
        
        fetch(`${BACKEND}/api/user/skills/${encodeURIComponent(cfHandle)}`)
            .then(res => res.json())
            .then(result => {
                if (result.success && result.skills.length > 0) {
                    setData(result.skills.map(s => ({
                        topic: s.topic_tag,
                        elo: Math.round(s.elo_rating),
                        fullMark: 3000
                    })));
                } else {
                    setData([]);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch skills:', err);
                setError('Could not load skill data');
                setLoading(false);
            });
    }, [cfHandle]);

    if (loading) return <div className="cf-card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading Skill Graph...</div>;
    
    if (error) return <div className="cf-card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-red-muted)' }}>{error}</div>;

    if (data.length === 0) return (
        <div className="cf-card" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <h3 className="text-micro text-muted">PER-TOPIC MASTERY</h3>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '14px' }}>
                No skill data yet. Solve some problems to see your topic mastery radar chart.
            </p>
        </div>
    );

    return (
        <div className="cf-card" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-micro text-muted" style={{ marginBottom: '16px' }}>PER-TOPIC MASTERY</h3>
            <div style={{ flex: 1, minHeight: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="topic" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 3000]} tick={false} axisLine={false} />
                        <Radar name="Elo" dataKey="elo" stroke="#30d158" fill="#30d158" fillOpacity={0.4} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default SkillGraph;
