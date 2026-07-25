import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3002';

const CoachPortal = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`${BACKEND}/api/coach/students`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setStudents(data.students || []);
                } else {
                    setStudents([]);
                }
                setLoading(false);
            })
            .catch(() => {
                setStudents([]);
                setLoading(false);
            });
    }, []);

    const getArchetypeColor = (arch) => {
        if (!arch) return 'var(--text-muted)';
        switch(arch) {
            case 'Trial-and-Error': return 'var(--cf-tle-orange)';
            case 'Planner': return '#30d158';
            case 'Sprinter': return 'var(--icpc-blue)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="cf-card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(94,207,255,0.1) 0%, rgba(142,68,255,0.1) 100%)' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield color="#8E44FF" /> Coach Portal
                </h2>
                <p className="text-secondary" style={{ marginTop: '8px', maxWidth: '600px', lineHeight: 1.5 }}>
                    Educator dashboard. View your students' learning archetypes diagnosed from their real IDE telemetry.
                </p>
            </div>

            {loading ? (
                <div className="cf-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading students...</div>
            ) : students.length === 0 ? (
                <div className="cf-card" style={{ padding: '32px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>No students assigned yet.</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>Students will appear here once they register and link their Codeforces handle.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {students.map((student, idx) => (
                        <div key={idx} className="cf-card" style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <h3 style={{ margin: 0, color: 'white', fontSize: '18px' }}>{student.cf_handle}</h3>
                                    <div style={{ 
                                        display: 'inline-block', 
                                        background: 'rgba(255,255,255,0.1)', 
                                        padding: '4px 8px', 
                                        borderRadius: '4px', 
                                        fontSize: '12px', 
                                        marginTop: '8px',
                                        color: getArchetypeColor(student.archetype)
                                    }}>
                                        {student.archetype ? `Archetype: ${student.archetype}` : 'Archetype: Pending analysis'}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: '#30d158', fontWeight: 800, fontSize: '20px' }}>{student.elo}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>AVG ELO</div>
                                </div>
                            </div>

                            <div style={{ background: 'rgba(255,107,107,0.1)', padding: '12px', borderRadius: '6px', borderLeft: '2px solid var(--accent-red-muted)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertTriangle size={12} /> WEAKEST TOPIC
                                </div>
                                <div style={{ color: 'white', fontWeight: 500 }}>{student.weakness || 'Not enough data yet'}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CoachPortal;
