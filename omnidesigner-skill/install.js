// OmniDesigner Skill Installer v1.1.0
// Run: node install.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const AGENTS = [
    { id: 'trae', name: 'Trae AI', skillDir: path.join(os.homedir(), '.trae-cn', 'skills', 'omnidesigner-skill'), configFile: path.join(os.homedir(), '.trae-cn', 'config', 'skills.json') },
    { id: 'codebuddy', name: 'CodeBuddy', skillDir: path.join(os.homedir(), '.codebuddy', 'skills', 'omnidesigner-skill'), configFile: path.join(os.homedir(), '.codebuddy', 'config', 'skills.json') },
    { id: 'cursor', name: 'Cursor', skillDir: path.join(os.homedir(), '.cursor', 'skills', 'omnidesigner-skill'), configFile: null },
    { id: 'tabnine', name: 'Tabnine', skillDir: path.join(os.homedir(), '.tabnine', 'skills', 'omnidesigner-skill'), configFile: null },
    { id: 'githubcopilot', name: 'GitHub Copilot', skillDir: path.join(os.homedir(), '.github-copilot', 'skills', 'omnidesigner-skill'), configFile: null },
    { id: 'jetbrains', name: 'JetBrains AI', skillDir: path.join(os.homedir(), '.jetbrains', 'skills', 'omnidesigner-skill'), configFile: null },
    { id: 'vscode', name: 'VS Code', skillDir: path.join(os.homedir(), '.vscode', 'extensions', 'omnidesigner-skill'), configFile: null },
    { id: 'other', name: 'Custom Path', skillDir: null, configFile: null }
];

async function install() {
    console.log('==========================================');
    console.log('OmniDesigner Skill Installer v1.1.0');
    console.log('==========================================\n');
    console.log('Select AI Agent:');
    AGENTS.forEach((a, i) => console.log((i + 1) + '. ' + a.name));
    return new Promise((resolve) => {
        const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
        rl.question('Enter number (1-8): ', (answer) => {
            const choice = parseInt(answer) - 1;
            const agent = (choice >= 0 && choice < AGENTS.length) ? AGENTS[choice] : AGENTS[0];
            if (agent.id === 'other') {
                rl.question('Custom path: ', (p) => { agent.skillDir = path.resolve(p); rl.close(); resolve(agent); });
            } else { rl.close(); resolve(agent); }
        });
    });
}

function copyFileOrDir(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const f of fs.readdirSync(src)) copyFileOrDir(path.join(src, f), path.join(dest, f));
    } else { fs.copyFileSync(src, dest); }
}

async function copySkillFiles(agent) {
    console.log('\nInstalling to: ' + agent.skillDir);
    if (!fs.existsSync(agent.skillDir)) fs.mkdirSync(agent.skillDir, { recursive: true });
    const sourceDir = __dirname;
    const files = ['index.js', 'SKILL.md', 'skill.json', 'package.json', 'README.md', 'designer', 'mcp-server'];
    for (const f of files) {
        const src = path.join(sourceDir, f);
        if (fs.existsSync(src)) copyFileOrDir(src, path.join(agent.skillDir, f));
    }
}

function updateAgentConfig(agent) {
    if (!agent.configFile) return;
    try {
        let config = fs.existsSync(agent.configFile) ? JSON.parse(fs.readFileSync(agent.configFile, 'utf-8')) : {};
        if (!config.skills) config.skills = {};
        config.skills['omnidesigner-skill'] = { enabled: true, path: agent.skillDir };
        const d = path.dirname(agent.configFile);
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(agent.configFile, JSON.stringify(config, null, 2));
    } catch (e) {}
}

function addFirewallRule(agent) {
    const exePath = path.join(agent.skillDir, 'designer', 'designer.exe');
    const cmd = 'netsh advfirewall firewall add rule name="OmniDesigner" dir=out action=allow program="' + exePath + '" enable=yes';
    console.log('\nAdding firewall rule for OmniDesigner...');
    exec(cmd, (err) => {
        if (err) {
            console.log('  Warning: Firewall rule failed (may need admin). Run manually:');
            console.log('  ' + cmd);
        } else {
            console.log('  OK: Firewall rule added');
        }
    });
}

function showComplete(agent) {
    console.log('\n==========================================');
    console.log('Installation Complete! / 安装完成！');
    console.log('==========================================');
    console.log('Agent: ' + agent.name);
    console.log('Location: ' + agent.skillDir + '\n');
    console.log('=== MCP Configuration ===');
    console.log(JSON.stringify({
        mcpServers: { omnidesigner: { command: 'node', args: ['mcp-server/index.js'], cwd: agent.skillDir, env: {} } }
    }, null, 2));
    console.log('==========================================\n');
}

async function main() {
    try {
        const agent = await install();
        await copySkillFiles(agent);
        updateAgentConfig(agent);
        addFirewallRule(agent);
        showComplete(agent);
    } catch (e) {
        console.error('Failed: ' + e.message);
        process.exit(1);
    }
}

if (require.main === module) main();
