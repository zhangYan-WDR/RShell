const fs = require('fs');
const path = require('path');

const modbusPath = path.resolve(__dirname, '../src/components/modbus/ModbusDashboard.jsx');
const iec104Path = path.resolve(__dirname, '../src/components/iec104/IEC104Dashboard.jsx');
const iec61850Path = path.resolve(__dirname, '../src/components/iec61850/IEC61850Dashboard.jsx');

console.log('Starting dashboard code adaptations...');

// 1. Modbus
if (fs.existsSync(modbusPath)) {
  let content = fs.readFileSync(modbusPath, 'utf8');
  content = content.replace(/\.\/components\//g, './');
  content = content.replace(/window\.api\./g, 'window.api.modbus.');
  content = content.replace(/export default function App\(\)/g, 'export default function ModbusDashboard()');
  fs.writeFileSync(modbusPath, content, 'utf8');
  console.log('ModbusDashboard.jsx adapted successfully.');
} else {
  console.error('ModbusDashboard.jsx not found at ' + modbusPath);
}

// 2. IEC104
if (fs.existsSync(iec104Path)) {
  let content = fs.readFileSync(iec104Path, 'utf8');
  content = content.replace(/\.\/components\//g, './');
  content = content.replace(/window\.api\./g, 'window.api.iec104.');
  content = content.replace(/export default function App\(\)/g, 'export default function IEC104Dashboard()');
  fs.writeFileSync(iec104Path, content, 'utf8');
  console.log('IEC104Dashboard.jsx adapted successfully.');
} else {
  console.error('IEC104Dashboard.jsx not found at ' + iec104Path);
}

// 3. IEC61850
if (fs.existsSync(iec61850Path)) {
  let content = fs.readFileSync(iec61850Path, 'utf8');
  content = content.replace(/\.\/components\//g, './');
  content = content.replace(/window\.api\./g, 'window.api.iec61850.');
  content = content.replace(/export default function App\(\)/g, 'export default function IEC61850Dashboard()');
  fs.writeFileSync(iec61850Path, content, 'utf8');
  console.log('IEC61850Dashboard.jsx adapted successfully.');
} else {
  console.error('IEC61850Dashboard.jsx not found at ' + iec61850Path);
}
