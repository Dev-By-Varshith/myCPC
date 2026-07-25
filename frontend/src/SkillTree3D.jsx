import React, { useRef, useState, useEffect, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { getTopicMasteryGaps } from './cfAnalytics';

// ── COLOR ENGINE — MASTERY BASED ─────────────────────────────────────────────
const getMasteryColor = (pct) => {
  if (pct < 30) return '#ff3b30'; // Red (Big Gap)
  if (pct < 60) return '#ff9500'; // Orange (Medium Gap)
  if (pct < 85) return '#34c759'; // Green (Stable)
  return '#00e5cc'; // Cyan (Mastery)
};

// ── DYNAMIC DATA GENERATOR ─────────────────────────────────────────────
const buildGraphDataFromMastery = (masteryInfo) => {
  if (!masteryInfo || !masteryInfo.masteryData) return { nodes: [], links: [] };

  const nodes = [];
  const links = [];

  // Root: The User
  nodes.push({ 
    id: 'ROOT', 
    name: masteryInfo.handle, 
    isRoot: true, 
    totalSolved: masteryInfo.totalSolved 
  });

  // Take top 30 tags to keep the graph readable
  const sortedTags = masteryInfo.masteryData;
  const mainCount = 8;
  const mainTags = sortedTags.slice(-mainCount); // Strongest tags as main hubs
  const subTags = sortedTags.slice(0, sortedTags.length - mainCount); // Rest as sub nodes

  mainTags.forEach((m, i) => {
    const mainId = `MAIN_${i}`;
    nodes.push({
      id: mainId,
      name: m.tag,
      mastery: m.mastery,
      userCount: m.userCount,
      targetCount: m.targetCount,
      userAvg: m.userAvgRating,
      targetAvg: m.targetAvgRating,
      isMain: true
    });
    links.push({ source: 'ROOT', target: mainId });
  });

  subTags.forEach((s, j) => {
    const subId = `SUB_${j}`;
    nodes.push({
      id: subId,
      name: s.tag,
      mastery: s.mastery,
      userCount: s.userCount,
      targetCount: s.targetCount,
      userAvg: s.userAvgRating,
      targetAvg: s.targetAvgRating,
    });
    
    // Logic link: connect to the most similar main tag or just distribute
    const parentIdx = j % mainCount;
    links.push({ source: `MAIN_${parentIdx}`, target: subId });
  });

  return { nodes, links };
};

// ── COMPONENT ──────────────────────────────────────────────────────────
export default function SkillTree3D({ onNodeClick, userHandle }) {
  const fgRef = useRef();
  const [data, setData] = useState({ nodes: [], links: [] });
  const [hoverNode, setHoverNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userInteracted, setUserInteracted] = useState(false);
  
  useEffect(() => {
    let mounted = true;
    if (!userHandle) return;

    setLoading(true);
    getTopicMasteryGaps(userHandle).then(info => {
      if (mounted) {
        setData(buildGraphDataFromMastery(info));
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [userHandle]);

  useEffect(() => {
    // Configure OrbitControls for smooth damping
    if (fgRef.current) {
      const controls = fgRef.current.controls();
      if (controls) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.rotateSpeed = 1.2;
        controls.zoomSpeed = 1.5;
        
        // Listen for user interaction to stop auto-orbit
        const onInteraction = () => setUserInteracted(true);
        controls.addEventListener('start', onInteraction);
        return () => controls.removeEventListener('start', onInteraction);
      }
    }
  }, [loading]);

  useEffect(() => {
    // Make the camera orbit automatically if no interaction
    let animationFrameId;
    let angle = 0;
    const updateCamera = () => {
      if (fgRef.current && !hoverNode && !loading && !userInteracted) {
        const distance = 350;
        angle += Math.PI / 2500;
        fgRef.current.cameraPosition({
          x: distance * Math.sin(angle),
          z: distance * Math.cos(angle)
        });
      }
      animationFrameId = requestAnimationFrame(updateCamera);
    };
    
    updateCamera();
    return () => cancelAnimationFrame(animationFrameId);
  }, [hoverNode, loading, userInteracted]);

  const handleNodeClick = useCallback(node => {
    // Aim at node from outside it
    const distance = 100;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);

    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
        node, // lookAt ({ x, y, z })
        1500  // ms transition duration
      );
    }
    
    // Trigger external callback to queue targeted problems
    if (onNodeClick && !node.isRoot) {
      onNodeClick(node);
    }
  }, [onNodeClick]);

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', borderRadius: '12px' }}>
        <div className="text-mono text-cyan text-lg">🧬 MAPPING GM MASTERY GAPS...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'transparent', borderRadius: '12px', overflow: 'hidden' }}>
      
      {/* 3D Graph Canvas */}
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeLabel={() => ''} 
        nodeThreeObject={node => {
          const group = new THREE.Group();
          
          // The Ball (Sphere) - Much smaller base size
          const size = node.isRoot ? 8 : Math.max(2.5, Math.sqrt(node.userCount) * 0.7);
          const color = node.isRoot ? '#ffffff' : getMasteryColor(node.mastery);
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(size, 16, 16),
            new THREE.MeshPhongMaterial({ 
              color: color, 
              transparent: true, 
              opacity: 0.9,
              shininess: 100,
              emissive: color,
              emissiveIntensity: 0.4
            })
          );
          group.add(sphere);

          // High-Res Readable Sprite
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const text = node.name.toUpperCase();
          
          // Ultra High-Res for distance legibility
          ctx.font = 'bold 80px Inter, system-ui, sans-serif';
          const metrics = ctx.measureText(text);
          canvas.width = metrics.width + 40;
          canvas.height = 100;
          
          ctx.font = 'bold 80px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'white';
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 15;
          ctx.fillText(text, canvas.width / 2, canvas.height / 2);

          const texture = new THREE.CanvasTexture(canvas);
          const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture, 
            transparent: true,
            sizeAttenuation: true 
          });
          const sprite = new THREE.Sprite(spriteMaterial);
          
          // Optimized scale for legibility
          sprite.position.set(0, size + 5, 0);
          sprite.scale.set(canvas.width / 22, canvas.height / 22, 1);
          group.add(sprite);

          return group;
        }}
        linkWidth={0.5}
        linkColor={() => 'rgba(255, 255, 255, 0.08)'}
        linkDirectionalParticles={node => node.mastery < 50 ? 3 : 1}
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleColor={link => getMasteryColor(link.target.mastery)}
        onNodeHover={setHoverNode}
        onNodeClick={handleNodeClick}
        backgroundColor="rgba(0,0,0,0)"
        enableNodeDrag={false}
        enableNavigationControls={true}
        showNavInfo={false}
        controlType="orbit"
      />

      {/* Mastery Tooltip Overlay */}
      {hoverNode && !hoverNode.isRoot && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '340px',
          background: 'rgba(20, 20, 30, 0.7)',
          backdropFilter: 'blur(30px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          color: '#f5f5fa',
          fontFamily: 'var(--font-main)',
          pointerEvents: 'none',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          zIndex: 100,
          borderLeft: `4px solid ${getMasteryColor(hoverNode.mastery)}`
        }}>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', marginBottom: '8px', fontWeight: 700 }}>SYNAPSE ANALYSIS</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: 'white', marginBottom: '4px' }}>
            {hoverNode.name.toUpperCase()}
          </div>
          <div style={{ fontSize: '12px', color: getMasteryColor(hoverNode.mastery), fontWeight: 700, marginBottom: '20px' }}>
            {hoverNode.mastery}% MASTERY OF GM BASELINE
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
             {/* Volume Gap */}
             <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                 <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>SOLVE VOLUME</span>
                 <span style={{ fontSize: '10px', color: 'white' }}>{hoverNode.userCount} / {hoverNode.targetCount}</span>
               </div>
               <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                 <div style={{ width: `${(hoverNode.userCount/hoverNode.targetCount)*100}%`, height: '100%', background: 'var(--accent-cyan)' }} />
               </div>
               <div style={{ fontSize: '9px', color: 'var(--accent-cyan)', marginTop: '6px', opacity: 0.8 }}>
                 NEED {Math.max(0, hoverNode.targetCount - hoverNode.userCount)} MORE SOLVES FOR GM BREADTH
               </div>
             </div>

             {/* Rating Gap */}
             <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                 <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>AVG DIFFICULTY</span>
                 <span style={{ fontSize: '10px', color: 'white' }}>{hoverNode.userAvg} / {hoverNode.targetAvg}</span>
               </div>
               <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                 <div style={{ width: `${(hoverNode.userAvg/hoverNode.targetAvg)*100}%`, height: '100%', background: 'var(--accent-purple)' }} />
               </div>
               <div style={{ fontSize: '9px', color: 'var(--accent-purple)', marginTop: '6px', opacity: 0.8 }}>
                 GAP: {Math.max(0, hoverNode.targetAvg - hoverNode.userAvg)} ELO POINTS TO GM DEPTH
               </div>
             </div>
          </div>

          <div style={{ marginTop: '20px', fontSize: '10px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontStyle: 'italic' }}>
            CLICK NODE TO INITIATE TARGETED DRILL
          </div>
        </div>
      )}
    </div>
  );
}
