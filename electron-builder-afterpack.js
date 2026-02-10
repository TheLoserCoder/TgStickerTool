const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName;
  
  if (platform === 'linux') {
    const sharpSource = path.join(context.packager.info._appDir, 'node_modules', 'sharp');
    const imgSource = path.join(context.packager.info._appDir, 'node_modules', '@img');
    const resourcesDir = path.join(appOutDir, 'resources');
    const appAsarUnpacked = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
    
    // Копируем sharp
    if (fs.existsSync(sharpSource)) {
      const sharpDest = path.join(appAsarUnpacked, 'sharp');
      fs.cpSync(sharpSource, sharpDest, { recursive: true });
      console.log('Copied sharp to app.asar.unpacked');
    }
    
    // Копируем @img
    if (fs.existsSync(imgSource)) {
      const imgDest = path.join(appAsarUnpacked, '@img');
      fs.cpSync(imgSource, imgDest, { recursive: true });
      console.log('Copied @img to app.asar.unpacked');
    }
  }
};
