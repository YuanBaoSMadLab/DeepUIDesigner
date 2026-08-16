// OmniDesigner Minimal MCP Server v1.1.0
const { exec } = require('child_process');
const path = require('path');
const readline = require('readline');

const DESIGNER_PATH = path.join(__dirname, '..', 'designer', 'designer.exe');

const TOOLS = [{
  name: 'launchOmniDesigner',
  description: 'Launch OmniDesigner visual UI editor for Qt/Python GUI.',
  inputSchema: {
    type: 'object',
    properties: { file_path: { type: 'string', description: 'Absolute path to .ui file' } },
    required: []
  }
}];

function send(data) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

function log(msg) {
  process.stderr.write('[MCP] ' + msg + '\n');
}

function launchDesigner(args) {
  return new Promise((resolve) => {
    const fp = args?.file_path || args?.filePath || null;
    log('DESIGNER_PATH=' + DESIGNER_PATH + ' exists=' + require('fs').existsSync(DESIGNER_PATH));

    const cmd = fp
      ? `cmd /c start "" "${DESIGNER_PATH}" "${fp}"`
      : `cmd /c start "" "${DESIGNER_PATH}"`;

    log('Running: ' + cmd);

    exec(cmd, { windowsHide: false }, (error) => {
      if (error) {
        log('ERROR: ' + error.message);
        resolve({ success: false, error: error.message });
      } else {
        log('OK: Designer launched');
        resolve({ success: true, message: 'OmniDesigner launched successfully' });
      }
    });
  });
}

async function handleRequest(req) {
  const { id, method, params } = req;

  try {
    switch (method) {
      case 'initialize':
        return send({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'omnidesigner-mcp', version: '1.1.0' }
          }
        });

      case 'tools/list':
        return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });

      case 'tools/call':
        if (params?.name === 'launchOmniDesigner') {
          const result = await launchDesigner(params?.arguments || {});
          return send({
            jsonrpc: '2.0', id,
            result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
          });
        }
        return send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool' } });

      case 'notifications/initialized':
        return;

      default:
        return send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method' } });
    }
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  try { handleRequest(JSON.parse(line)); } catch (e) {}
});
