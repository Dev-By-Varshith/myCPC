import React from 'react';

/**
 * MyCPC Official Logo — Uses the actual brand PNG images
 * 
 * The logo image (hexagonal badge) is at /assets/mycpc-logo.png
 * The text wordmark (myCPC text) is at /assets/mycpc-text.png
 * 
 * Usage: <MyCPCLogo size="md" showText={true} />
 * Sizes: xs(20), sm(32), md(48), lg(72), xl(96), xxl(140)
 */
const SIZES = { xs: 20, sm: 32, md: 48, lg: 72, xl: 96, xxl: 140 };

const MyCPCLogo = ({ size = 'md', showText = false, className = '', style = {} }) => {
  const s = SIZES[size] || (typeof size === 'number' ? size : 48);
  const textHeight = Math.max(10, s * 0.35);

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: Math.max(2, s * 0.08), ...style }}>
      <img 
        src="/assets/mycpc-logo.png" 
        alt="myCPC Logo" 
        width={s} 
        height={s} 
        style={{ objectFit: 'contain' }}
      />
      
      {showText && (
        <img 
          src="/assets/mycpc-text.png" 
          alt="myCPC" 
          height={textHeight}
          style={{ objectFit: 'contain' }}
        />
      )}
    </div>
  );
};

export default MyCPCLogo;
