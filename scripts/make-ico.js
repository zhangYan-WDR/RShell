const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const buildDir = path.join(__dirname, '../build');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('Error: build/icon.png does not exist!');
  process.exit(1);
}

console.log('Converting build/icon.png to build/icon.ico...');
const convertFn = typeof pngToIco === 'function' ? pngToIco : pngToIco.default;
convertFn(pngPath)
  .then(buf => {
    fs.writeFileSync(icoPath, buf);
    console.log('Successfully generated build/icon.ico!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to convert PNG to ICO:', err);
    process.exit(1);
  });
