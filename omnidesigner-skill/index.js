const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DESIGNER_PATH = path.join(__dirname, 'designer', 'designer.exe');

function launchOmniDesigner(params = {}) {
  return new Promise((resolve) => {
    let filePath = params.filePath || params.file_path || params.path || null;
    const projectDir = params.cwd || process.cwd();

    // Resolve relative path to absolute
    if (filePath && !path.isAbsolute(filePath)) {
      filePath = path.resolve(projectDir, filePath);
    }

    // Create temp launcher .bat
    const batPath = path.join(projectDir, '_omnidesigner_launcher.bat');
    const batContent = filePath
      ? `@echo off\r\nchcp 65001 >nul\r\nstart "" "${DESIGNER_PATH}" "${filePath}"\r\nexit\r\n`
      : `@echo off\r\nchcp 65001 >nul\r\nstart "" "${DESIGNER_PATH}"\r\nexit\r\n`;
    fs.writeFileSync(batPath, batContent);

    console.log('[OmniDesigner] Launcher created:', batPath);
    console.log('[OmniDesigner] Executing launcher...');

    // Run the .bat, it will launch designer.exe and auto-exit
    exec(`start "" "${batPath}"`, { shell: 'cmd.exe' }, (error) => {
      // Delete the temp .bat after a short delay
      setTimeout(() => {
        try { fs.unlinkSync(batPath); } catch (e) { /* ignore */ }
      }, 2000);

      if (error) {
        resolve({
          success: false,
          message: 'Failed: ' + error.message,
          error: error.message
        });
      } else {
        resolve({
          success: true,
          message: 'OmniDesigner launched successfully',
          filePath: filePath,
          designerPath: DESIGNER_PATH
        });
      }
    });
  });
}

function getTools() {
  return [
    {
      name: 'launchOmniDesigner',
      description: 'Launch OmniDesigner visual UI editor for Qt/Python GUI development.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'ABSOLUTE path to .ui file to open' }
        },
        required: []
      }
    }
  ];
}

module.exports = {
  launchOmniDesigner,
  getTools,
  tools: getTools()
};

if (require.main === module) {
  const filePath = process.argv[2];
  launchOmniDesigner({ filePath }).then(result => {
    console.log(JSON.stringify(result, null, 2));
  });
}
