const fs = require('fs');
let content = fs.readFileSync('App.jsx', 'utf8');

const targetStr = "              {activeView === 'command_center' && renderCommandCenter()}\r\n              {activeView === 'crucible' && renderCrucible()}";
const targetStrLf = "              {activeView === 'command_center' && renderCommandCenter()}\n              {activeView === 'crucible' && renderCrucible()}";

const replacementStr = `              {activeView === 'command_center' && renderCommandCenter()}
              {activeView === 'community' && <CommunityLeaderboard />}
              {activeView === 'coach_portal' && <CoachPortal />}
              {activeView === 'upsolve_queue' && <UpsolveQueue />}
              {activeView === 'crucible' && renderCrucible()}`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('App.jsx', content);
    console.log('Replaced CRLF target');
} else if (content.includes(targetStrLf)) {
    content = content.replace(targetStrLf, replacementStr);
    fs.writeFileSync('App.jsx', content);
    console.log('Replaced LF target');
} else {
    console.log('Target string not found');
}
