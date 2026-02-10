const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName;
  
  const modulesToCopy = ['sharp', '@img', 'detect-libc', 'semver', 'fluent-ffmpeg', '@ffmpeg-installer'];
  
  if (platform === 'linux' || platform === 'win32') {
    const resourcesDir = path.join(appOutDir, 'resources');
    const appAsarUnpacked = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
    
    for (const moduleName of modulesToCopy) {
      const moduleSource = path.join(context.packager.info._appDir, 'node_modules', moduleName);
      
      if (fs.existsSync(moduleSource)) {
        const moduleDest = path.join(appAsarUnpacked, moduleName);
        fs.cpSync(moduleSource, moduleDest, { recursive: true });
        console.log(`Copied ${moduleName} to app.asar.unpacked`);
      }
    }
  }
};
