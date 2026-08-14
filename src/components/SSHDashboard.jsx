import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, Terminal, Plus, Folder, File, Trash2, Edit3, RefreshCw, 
  UploadCloud, DownloadCloud, FolderPlus, X, Send, Play, Layers, Copy,
  ChevronRight, ChevronDown, ChevronUp, Check, AlertCircle, Key, Lock, Eye, EyeOff,
  Activity, Search, List, ArrowLeftRight, HardDrive, Cpu, Compass,
  ArrowUp, ArrowDown, ActivitySquare, Monitor, Home
} from 'lucide-react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';

export default function SSHDashboard() {
  // Hosts management (Termius style)
  const [hosts, setHosts] = useState(() => {
    try {
      const saved = localStorage.getItem('debugtoolbox:ssh-hosts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Normalize loaded items to ensure properties exist
          return parsed.map(h => ({
            id: h.id || `host-${Date.now()}-${Math.random()}`,
            name: h.name || h.host || '未命名主机',
            host: h.host || '',
            port: parseInt(h.port) || 22,
            username: h.username || 'root',
            authType: h.authType || 'password',
            password: h.password || '',
            privateKeyPath: h.privateKeyPath || '',
            passphrase: h.passphrase || '',
            group: h.group || '开发环境',
            credentialId: h.credentialId || 'manually',
            sshKeyId: h.sshKeyId || 'manually',
            jumpHostId: h.jumpHostId || ''
          })).filter(h => h.host);
        }
      }
    } catch (e) {
      console.error('Failed to load ssh-hosts:', e);
    }
    return [
      { id: 'sample-1', name: '阿里云测试机', host: '192.168.1.100', port: 22, username: 'root', authType: 'password', password: '', group: '开发环境' },
      { id: 'sample-2', name: '腾讯云公网机', host: '8.8.8.8', port: 22, username: 'ubuntu', authType: 'password', password: '', group: '生产环境' },
      { id: 'sample-3', name: '万润项目现场', host: 'smc.lnxall.com', port: 2720, username: 'root', authType: 'password', password: '', group: '生产环境' }
    ];
  });

  const [groups, setGroups] = useState(['开发环境', '生产环境', '测试环境']);
  const [activeGroup, setActiveGroup] = useState('All');
  const [hostSearchQuery, setHostSearchQuery] = useState('');
  
  // Host Editor State
  const [showHostEditor, setShowHostEditor] = useState(false);
  const [editingHost, setEditingHost] = useState(null);
  
  // Host Form State
  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('22');
  const [formUsername, setFormUsername] = useState('root');
  const [formAuthType, setFormAuthType] = useState('password');
  const [formPassword, setFormPassword] = useState('');
  const [formPrivateKeyPath, setFormPrivateKeyPath] = useState('');
  const [formPassphrase, setFormPassphrase] = useState('');
  const [formGroup, setFormGroup] = useState('开发环境');
  const [formJumpHostId, setFormJumpHostId] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Tabs & Sessions (Xshell style)
  const [tabs, setTabs] = useState([]); // { id, name, host, username, status, connected }
  const [activeTabId, setActiveTabId] = useState('hosts-dashboard'); // Defaults to persistent Start tab
  
  // Collapsible Sidebars Control (For active sessions)
  const [showLeftSidebar, setShowLeftSidebar] = useState(true); 
  const [showRightDrawer, setShowRightDrawer] = useState(false); // Default hidden as requested
  const [sftpDrawerWidth, setSftpDrawerWidth] = useState(680); // Default wide dual-explorer layout 

  // Quick Command Broadcaster State (Xshell style)
  const [broadcastCmd, setBroadcastCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('debugtoolbox:broadcaster-history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(c => typeof c === 'string');
        }
      }
    } catch (e) {
      console.error('Failed to load broadcaster-history:', e);
    }
    return ['tail -f /var/log/syslog', 'docker ps', 'df -h', 'free -m', 'systemctl restart nginx'];
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const cmdHistoryRef = useRef(cmdHistory);
  useEffect(() => {
    cmdHistoryRef.current = cmdHistory;
  }, [cmdHistory]);

  // Terminal Search States
  const [showSearch, setShowSearch] = useState({}); // tabId -> boolean
  const [searchQuery, setSearchQuery] = useState('');
  const searchAddonRefs = useRef({}); // tabId -> SearchAddon
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Terminal Autocomplete & History Capture States
  const [terminalSuggestions, setTerminalSuggestions] = useState([]); // Array of strings (up to 6 matches)
  const [selectedTerminalSuggestionIndex, setSelectedTerminalSuggestionIndex] = useState(-1);
  const [terminalSuggestionCoords, setTerminalSuggestionCoords] = useState({ x: 0, y: 0, sessionId: '' });
  const suggestionsRef = useRef([]); // for thread-safe keypress handler access
  const selectedIndexRef = useRef(-1);
  const sessionBuffers = useRef({}); // tabId -> current typing line
  const isComposingRef = useRef(false); // tracks active CJK input composition
  const lastCommittedTimeRef = useRef(0); // timestamp of last CJK IME committed text
  const pendingInputRef = useRef(null); // holds pending PTY input { timer, data, tabId }

  // SFTP States
  const [sftpPath, setSftpPath] = useState('/');
  const [sftpPathInput, setSftpPathInput] = useState('/');
  const [sftpFiles, setSftpFiles] = useState([]);
  const [sftpLoading, setSftpLoading] = useState(false);
  const [sftpError, setSftpError] = useState(null);
  const [sftpTransfers, setSftpTransfers] = useState([]);
  const [sftpPaths, setSftpPaths] = useState({}); // sessionId -> currentPath

  // Remote Telemetry Stats
  const [sessionStats, setSessionStats] = useState({}); // sessionId -> stats object
  const [statsHistory, setStatsHistory] = useState({}); // sessionId -> { cpu: [], mem: [] }

  // Directory space analyzer states
  const tabCwdsRef = useRef({});
  const [tabCwdSizes, setTabCwdSizes] = useState({}); // sessionId -> size (string)
  const [tabCwdSizesLoading, setTabCwdSizesLoading] = useState({}); // sessionId -> boolean
  
  // Details Modal States
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsModalCwd, setDetailsModalCwd] = useState('');
  const [detailsModalItems, setDetailsModalItems] = useState([]);
  const [detailsModalLoading, setDetailsModalLoading] = useState(false);
  const [detailsModalTotalSize, setDetailsModalTotalSize] = useState('Unknown');

  // Key & Reusable Credentials Escrow / Management States
  const [dashboardMode, setDashboardMode] = useState('hosts'); // 'hosts' | 'credentials' | 'keys'
  
  const [sshKeys, setSshKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('debugtoolbox:ssh-keys');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [sshCredentials, setSshCredentials] = useState(() => {
    try {
      const saved = localStorage.getItem('debugtoolbox:ssh-credentials');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('debugtoolbox:ssh-keys', JSON.stringify(sshKeys));
  }, [sshKeys]);

  useEffect(() => {
    localStorage.setItem('debugtoolbox:ssh-credentials', JSON.stringify(sshCredentials));
  }, [sshCredentials]);

  // Key Editor Modal States
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [formKeyName, setFormKeyName] = useState('');
  const [formKeyContent, setFormKeyContent] = useState('');
  const [formKeyPassphrase, setFormKeyPassphrase] = useState('');

  // Reusable Credentials Editor Modal States
  const [showCredEditor, setShowCredEditor] = useState(false);
  const [editingCred, setEditingCred] = useState(null);
  const [formCredName, setFormCredName] = useState('');
  const [formCredUsername, setFormCredUsername] = useState('root');
  const [formCredPassword, setFormCredPassword] = useState('');

  // Host Editor extensions for Key & Credentials selection
  const [formSshKeyId, setFormSshKeyId] = useState('manually');
  const [formCredentialId, setFormCredentialId] = useState('manually');

  // SFTP resizer & local filesystem states
  const [sftpQueueHeight, setSftpQueueHeight] = useState(160);
  const cancelledTransfersRef = useRef(new Set());
  const [localPath, setLocalPath] = useState('/Users/zhangyan/Downloads');
  const [localPathInput, setLocalPathInput] = useState('/Users/zhangyan/Downloads');
  const [localFiles, setLocalFiles] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedLocalPath, setSelectedLocalPath] = useState('');
  const [selectedRemotePath, setSelectedRemotePath] = useState('');

  // Right-click custom context menu state
  const [contextMenu, setContextMenu] = useState(null); // { x, y, sessionId, hasSelection }

  // Snippets states
  const [showSnippetsPanel, setShowSnippetsPanel] = useState(false);
  const [newSnippetName, setNewSnippetName] = useState('');
  const [newSnippetCmd, setNewSnippetCmd] = useState('');
  const [newSnippetAutoSend, setNewSnippetAutoSend] = useState(true);
  const [snippets, setSnippets] = useState(() => {
    try {
      const saved = localStorage.getItem('rshell:quick-snippets');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: '1', name: '系统更新 (Debian/Ubuntu)', cmd: 'sudo apt update && sudo apt upgrade -y', autoSend: true },
      { id: '2', name: '查看Docker容器', cmd: 'docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"', autoSend: true },
      { id: '3', name: '系统负载监控', cmd: 'top -b -n 1 | head -n 20', autoSend: true },
      { id: '4', name: '磁盘空间清理', cmd: 'sudo apt clean && docker system prune -af', autoSend: true }
    ];
  });

  // Terminal instances refs
  const terminalRefs = useRef({}); 
  const fitAddonRefs = useRef({}); 
  const containerRefs = useRef({}); 
  const resizeObserverRefs = useRef({}); 
  const resizeTimeoutRefs = useRef({}); 
  const activeTabIdRef = useRef(activeTabId);
  
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);
  
  // Quick Connect State
  const [quickConnectInput, setQuickConnectInput] = useState('');

  // Persist hosts list
  useEffect(() => {
    localStorage.setItem('debugtoolbox:ssh-hosts', JSON.stringify(hosts));
  }, [hosts]);

  // Global SSH data stream receiver
  useEffect(() => {
    const removeDataListener = window.api.ssh.onData(({ sessionId, data }) => {
      const term = terminalRefs.current[sessionId];
      if (term) {
        term.write(data);
      }
    });

    const removeStatusListener = window.api.ssh.onStatus(({ sessionId, status, host, username }) => {
      setTabs(prev => prev.map(t => {
        if (t.id === sessionId) {
          const isConnected = status === 'connected';
          return { ...t, status: isConnected ? '已连接' : '已断开', connected: isConnected };
        }
        return t;
      }));

      if (status === 'disconnected') {
        setSessionStats(prev => {
          const updated = { ...prev };
          delete updated[sessionId];
          return updated;
        });
        setStatsHistory(prev => {
          const updated = { ...prev };
          delete updated[sessionId];
          return updated;
        });
      }
    });

    const removeErrorListener = window.api.ssh.onError(({ sessionId, message }) => {
      const term = terminalRefs.current[sessionId];
      if (term) {
        term.write(`\r\n\x1b[31m[错误] 连接发生异常: ${message}\x1b[0m\r\n`);
      }
      setTabs(prev => prev.map(t => {
        if (t.id === sessionId) {
          return { ...t, status: '错误', connected: false };
        }
        return t;
      }));
    });

    // Real-time telemetry receiver (updates every 2 seconds)
    const removeStatsListener = window.api.ssh.onStats(({ sessionId, stats }) => {
      setSessionStats(prev => ({
        ...prev,
        [sessionId]: stats
      }));

      // If a valid CWD is received and it has changed, trigger directory size check
      if (stats.cwd) {
        const lastCwd = tabCwdsRef.current[sessionId];
        if (lastCwd !== stats.cwd) {
          tabCwdsRef.current[sessionId] = stats.cwd;
          fetchCwdSize(sessionId, stats.cwd);
        }
      }

      // Update historical points (max 20 points, representing last 40 seconds)
      setStatsHistory(prev => {
        const hist = prev[sessionId] || { 
          cpu: Array(20).fill(0), 
          mem: Array(20).fill(0) 
        };
        const nextCpu = [...hist.cpu.slice(1), stats.cpu];
        const nextMem = [...hist.mem.slice(1), stats.mem.percent];
        return {
          ...prev,
          [sessionId]: { cpu: nextCpu, mem: nextMem }
        };
      });
    });

    // Handle home directory resolved from backend SFTP client
    const removeHomeDirListener = window.api.sftp.onHomeDirectory(({ sessionId, path: homePath }) => {
      setSftpPaths(prev => ({
        ...prev,
        [sessionId]: homePath
      }));
      if (sessionId === activeTabId) {
        setSftpPath(homePath);
        setSftpPathInput(homePath);
        loadSftp(sessionId, homePath);
      }
    });

    const removeSftpProgressListener = window.api.sftp.onProgress(({ sessionId, type, remotePath, localPath, percent }) => {
      const filename = remotePath.split('/').pop() || localPath.split(/[/\\]/).pop();
      setSftpTransfers(prev => {
        const existingIdx = prev.findIndex(t => t.sessionId === sessionId && t.filename === filename && t.type === type);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            progress: percent,
            status: percent >= 100 ? 'completed' : 'running'
          };
          return updated;
        } else {
          return [...prev, {
            id: Date.now().toString(),
            sessionId,
            filename,
            type,
            progress: percent,
            status: 'running'
          }];
        }
      });

      if (percent >= 100 && sessionId === activeTabId) {
        setTimeout(() => loadSftp(sessionId, sftpPaths[sessionId] || '/'), 800);
      }
    });

    return () => {
      removeDataListener();
      removeStatusListener();
      removeErrorListener();
      removeStatsListener();
      removeHomeDirListener();
      removeSftpProgressListener();
    };
  }, [activeTabId, sftpPaths]);

  // Clean up terminals when dashboard unmounts
  useEffect(() => {
    return () => {
      tabs.forEach(tab => {
        window.api.ssh.disconnect(tab.id);
      });
    };
  }, []);

  // Sync SFTP when active tab changes
  useEffect(() => {
    if (activeTabId && activeTabId !== 'hosts-dashboard') {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.connected) {
        const currentTabPath = sftpPaths[activeTabId] || '/';
        setSftpPath(currentTabPath);
        setSftpPathInput(currentTabPath);
        loadSftp(activeTabId, currentTabPath);
      } else {
        setSftpFiles([]);
        setSftpError('终端未连接，无法加载 SFTP');
      }
    } else {
      setSftpFiles([]);
      setSftpError('无活跃的终端连接');
    }
  }, [activeTabId, tabs]);

  // Trigger resize on window change
  const handleWindowResize = () => {
    if (activeTabId && activeTabId !== 'hosts-dashboard' && fitAddonRefs.current[activeTabId]) {
      try {
        fitAddonRefs.current[activeTabId].fit();
        const term = terminalRefs.current[activeTabId];
        // Enforce minimum size safeguard to prevent shell prompt reprint distortion
        if (term && term.cols >= 40 && term.rows >= 10) {
          window.api.ssh.resize(activeTabId, term.cols, term.rows);
        }
      } catch (e) {
        console.warn(e);
      }
    }
  };

  // Focus and fit terminal whenever activeTabId changes (tab switching or returning from host dashboard)
  useEffect(() => {
    if (activeTabId && activeTabId !== 'hosts-dashboard') {
      const term = terminalRefs.current[activeTabId];
      const fitAddon = fitAddonRefs.current[activeTabId];
      if (term) {
        term.focus();
        if (fitAddon) {
          // Trigger fit and resize after a small delay to allow DOM transition to settle
          setTimeout(() => {
            try {
              fitAddon.fit();
              const cols = term.cols;
              const rows = term.rows;
              if (cols >= 60 && rows >= 15) {
                window.api.ssh.resize(activeTabId, cols, rows);
              }
            } catch (e) {
              console.warn('Tab switch fit error:', e);
            }
          }, 150);
        }
      }
    }
  }, [activeTabId]);

  const closeKeyEditor = () => {
    setShowKeyEditor(false);
    setEditingKey(null);
    setFormKeyName('');
    setFormKeyContent('');
    setFormKeyPassphrase('');
  };

  const openEditKey = (keyObj, event) => {
    if (event) event.stopPropagation();
    setEditingKey(keyObj);
    setFormKeyName(keyObj.name);
    setFormKeyContent(keyObj.privateKey);
    setFormKeyPassphrase(keyObj.passphrase || '');
    setShowKeyEditor(true);
  };

  const saveSshKey = (e) => {
    e.preventDefault();
    if (!formKeyName || !formKeyContent) return;

    const newKey = {
      id: editingKey ? editingKey.id : `key-${Date.now()}`,
      name: formKeyName,
      privateKey: formKeyContent,
      passphrase: formKeyPassphrase,
      createdAt: editingKey ? editingKey.createdAt : new Date().toLocaleString()
    };

    if (editingKey) {
      setSshKeys(prev => prev.map(k => k.id === editingKey.id ? newKey : k));
    } else {
      setSshKeys(prev => [...prev, newKey]);
    }

    closeKeyEditor();
  };

  const deleteSshKey = (keyId, event) => {
    if (event) event.stopPropagation();
    if (confirm('确定要删除此托管密钥吗？已关联此密钥的主机配置将无法通过它连接。')) {
      setSshKeys(prev => prev.filter(k => k.id !== keyId));
    }
  };

  const closeCredEditor = () => {
    setShowCredEditor(false);
    setEditingCred(null);
    setFormCredName('');
    setFormCredUsername('root');
    setFormCredPassword('');
  };

  const openEditCred = (credObj, event) => {
    if (event) event.stopPropagation();
    setEditingCred(credObj);
    setFormCredName(credObj.name);
    setFormCredUsername(credObj.username);
    setFormCredPassword(credObj.password);
    setShowCredEditor(true);
  };

  const saveSshCredential = (e) => {
    e.preventDefault();
    if (!formCredName || !formCredUsername || !formCredPassword) return;

    const newCred = {
      id: editingCred ? editingCred.id : `cred-${Date.now()}`,
      name: formCredName,
      username: formCredUsername,
      password: formCredPassword,
      createdAt: editingCred ? editingCred.createdAt : new Date().toLocaleString()
    };

    if (editingCred) {
      setSshCredentials(prev => prev.map(c => c.id === editingCred.id ? newCred : c));
    } else {
      setSshCredentials(prev => [...prev, newCred]);
    }

    closeCredEditor();
  };

  const deleteSshCredential = (credId, event) => {
    if (event) event.stopPropagation();
    if (confirm('确定要删除此托管凭据吗？已关联此凭据的主机配置将无法通过它连接。')) {
      setSshCredentials(prev => prev.filter(c => c.id !== credId));
    }
  };

  useEffect(() => {
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [activeTabId]);

  // Mount terminal for a new tab
  const initTerminal = (tabId) => {
    setTimeout(() => {
      const container = containerRefs.current[tabId];
      if (!container || terminalRefs.current[tabId]) return;

      const term = new XTerm({
        theme: {
          background: '#090a0f',
          foreground: '#ccd6f6',
          cursor: '#00e5ff',
          cursorAccent: '#090a0f',
          selectionBackground: 'rgba(0, 229, 255, 0.3)',
          black: '#090a0f',
          red: '#ff3860',
          green: '#39ff14',
          yellow: '#ffb300',
          blue: '#0052d4',
          magenta: '#a29bfe',
          cyan: '#00e5ff',
          white: '#ccd6f6'
        },
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 10000,
        rows: 24,
        cols: 80
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      const searchAddon = new SearchAddon();
      term.loadAddon(searchAddon);
      searchAddonRefs.current[tabId] = searchAddon;
      term.open(container);
      if (container.clientWidth > 200 && container.clientHeight > 100) {
        fitAddon.fit();
      }

      term.attachCustomKeyEventHandler((ev) => {
        if (ev.type === 'keydown') {
          const code = ev.keyCode;
          const isCtrlOrCmd = ev.ctrlKey || ev.metaKey;

          // Cmd+F (Mac) or Ctrl+F (Win) - Intercept for global search
          if (isCtrlOrCmd && code === 70) {
            ev.preventDefault();
            setShowSearch(prev => ({ ...prev, [tabId]: !prev[tabId] }));
            setTimeout(() => {
              const inputEl = document.getElementById(`search-input-${tabId}`);
              if (inputEl) {
                inputEl.focus();
                inputEl.select();
              }
            }, 100);
            return false;
          }

          const matches = suggestionsRef.current || [];
          
          if (matches.length > 0) {
            // Arrow Down (40): select next suggestion
            if (code === 40) {
              ev.preventDefault();
              setSelectedTerminalSuggestionIndex(prev => {
                const next = prev === -1 ? 0 : (prev + 1) % matches.length;
                selectedIndexRef.current = next;
                return next;
              });
              return false;
            }
            // Arrow Up (38): select previous suggestion
            if (code === 38) {
              ev.preventDefault();
              setSelectedTerminalSuggestionIndex(prev => {
                const next = prev === -1 ? matches.length - 1 : (prev - 1 + matches.length) % matches.length;
                selectedIndexRef.current = next;
                return next;
              });
              return false;
            }
            // Enter (13): Only autocomplete if there is an active selection (index >= 0)
            if (code === 13) {
              const sIdx = selectedIndexRef.current;
              if (sIdx >= 0) {
                ev.preventDefault();
                const selectedMatch = matches[sIdx];
                const typed = sessionBuffers.current[tabId] || '';
                if (selectedMatch && selectedMatch.startsWith(typed)) {
                  const remaining = selectedMatch.substring(typed.length);
                  window.api.ssh.write(tabId, remaining);
                  sessionBuffers.current[tabId] = selectedMatch;
                }
                setTerminalSuggestions([]);
                suggestionsRef.current = [];
                return false; // Intercepted
              } else {
                // No active selection (index is -1). Let Enter run the raw typed command!
                setTerminalSuggestions([]);
                suggestionsRef.current = [];
                return true; // Not intercepted, let xterm pass it to PTY
              }
            }
            // Tab (9): complete selected match, or first match if none selected
            if (code === 9) {
              ev.preventDefault();
              const sIdx = selectedIndexRef.current >= 0 ? selectedIndexRef.current : 0;
              const selectedMatch = matches[sIdx];
              const typed = sessionBuffers.current[tabId] || '';
              if (selectedMatch && selectedMatch.startsWith(typed)) {
                const remaining = selectedMatch.substring(typed.length);
                window.api.ssh.write(tabId, remaining);
                sessionBuffers.current[tabId] = selectedMatch;
              }
              setTerminalSuggestions([]);
              suggestionsRef.current = [];
              return false;
            }
            // Escape (27): dismiss suggestions
            if (code === 27) {
              ev.preventDefault();
              setTerminalSuggestions([]);
              suggestionsRef.current = [];
              return false;
            }
          }
        }
        return true;
      });

      term.onData(data => {
        window.api.ssh.write(tabId, data);
        window.api.ssh.notifyActivity(tabId);

        // 1. Immediate buffer update to prevent keypress race conditions (Tab/Enter latency)
        if (data === '\r' || data === '\n') {
          const cmd = (sessionBuffers.current[tabId] || '').trim();
          if (cmd && cmd.length >= 2) {
            setCmdHistory(prev => {
              const filtered = prev.filter(c => c !== cmd);
              const next = [cmd, ...filtered].slice(0, 50);
              localStorage.setItem('debugtoolbox:broadcaster-history', JSON.stringify(next));
              return next;
            });
          }
          sessionBuffers.current[tabId] = '';
          setTerminalSuggestions([]);
          suggestionsRef.current = [];
          return;
        } else if (data === '\u0003') { // Ctrl+C
          sessionBuffers.current[tabId] = '';
          setTerminalSuggestions([]);
          suggestionsRef.current = [];
        } else if (data === '\u007f' || data === '\b') { // Backspace
          sessionBuffers.current[tabId] = (sessionBuffers.current[tabId] || '').slice(0, -1);
        } else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
          sessionBuffers.current[tabId] = (sessionBuffers.current[tabId] || '') + data;
        } else if (data.length > 1 && !data.includes('\u001b')) {
          // Paste operations
          sessionBuffers.current[tabId] = (sessionBuffers.current[tabId] || '') + data;
        }

        // 2. Immediate suggestions lookup using the updated local buffer
        const typedImmediate = sessionBuffers.current[tabId] || '';
        if (typedImmediate.trim().length >= 2) {
          const matches = cmdHistoryRef.current
            .filter(h => h.startsWith(typedImmediate) && h !== typedImmediate)
            .slice(0, 6);
            
          if (matches.length > 0) {
            setTerminalSuggestions(matches);
            suggestionsRef.current = matches;
            
            setSelectedTerminalSuggestionIndex(-1);
            selectedIndexRef.current = -1;

            if (term.buffer && term.buffer.active) {
              setTerminalSuggestionCoords({
                sessionId: tabId,
                x: term.buffer.active.cursorX,
                y: term.buffer.active.cursorY
              });
            }
          } else {
            setTerminalSuggestions([]);
            suggestionsRef.current = [];
          }
        } else {
          setTerminalSuggestions([]);
          suggestionsRef.current = [];
        }

        // 3. Background Correction (50ms & 250ms) to align buffer with actual xterm.js screen output
        // Handles remote completions (Tab), multi-line wrappings, and cursor movements
        setTimeout(() => syncBufferFromScreen(tabId, term), 50);
        setTimeout(() => syncBufferFromScreen(tabId, term), 250);
      });

      terminalRefs.current[tabId] = term;
      fitAddonRefs.current[tabId] = fitAddon;

      // Right-click context menu event listener
      setTimeout(() => {
        const termEl = container.querySelector('.xterm-screen');
        if (termEl) {
          termEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rect = termEl.getBoundingClientRect();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              sessionId: tabId,
              hasSelection: term.hasSelection()
            });
          });
        }
      }, 500);

      if (term.cols >= 40 && term.rows >= 10) {
        window.api.ssh.resize(tabId, term.cols, term.rows);
      }
      term.focus();

      // Setup ResizeObserver to automatically fit and resize terminal to parent DOM changes
      try {
        const ro = new ResizeObserver((entries) => {
          // Only perform fit and resize operations if this tab is the currently active tab
          if (activeTabIdRef.current !== tabId) return;

          for (let entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 150 && height > 80) {
              try {
                fitAddon.fit();
                const cols = term.cols;
                const rows = term.rows;
                // Enforce a minimum safeguard (60 columns, 15 rows) to prevent
                // remote shell prompt wrapping/distortion during layout transitions
                if (cols >= 60 && rows >= 15) {
                  // Debounce remote PTY resize to prevent multiple SIGWINCH signals
                  // which cause prompt duplication/wrapping and multiple carriage returns
                  if (resizeTimeoutRefs.current[tabId]) {
                    clearTimeout(resizeTimeoutRefs.current[tabId]);
                  }
                  resizeTimeoutRefs.current[tabId] = setTimeout(() => {
                    window.api.ssh.resize(tabId, cols, rows);
                  }, 120);
                }
              } catch (e) {
                console.warn(`ResizeObserver fit error for tab ${tabId}:`, e);
              }
            }
          }
        });
        ro.observe(container);
        resizeObserverRefs.current[tabId] = ro;

        // Perform initial fit and PTY resize after container settles in the DOM
        setTimeout(() => {
          try {
            if (fitAddonRefs.current[tabId] && terminalRefs.current[tabId]) {
              fitAddonRefs.current[tabId].fit();
              const cols = terminalRefs.current[tabId].cols;
              const rows = terminalRefs.current[tabId].rows;
              if (cols >= 60 && rows >= 15) {
                window.api.ssh.resize(tabId, cols, rows);
              }
            }
          } catch (e) {
            console.warn(`Initial fit error for tab ${tabId}:`, e);
          }
        }, 150);
      } catch (err) {
        console.error('Failed to initialize ResizeObserver:', err);
      }
    }, 100);
  };

  const fetchCwdSize = async (sessionId, path) => {
    setTabCwdSizesLoading(prev => ({ ...prev, [sessionId]: true }));
    try {
      const res = await window.api.ssh.getDirSize(sessionId, path);
      if (res.success) {
        setTabCwdSizes(prev => ({ ...prev, [sessionId]: res.size }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTabCwdSizesLoading(prev => ({ ...prev, [sessionId]: false }));
    }
  };

  const handleRefreshCwdSize = (sessionId) => {
    const cwd = tabCwdsRef.current[sessionId];
    if (cwd) {
      fetchCwdSize(sessionId, cwd);
    }
  };

  const handleOpenCwdDetails = async (sessionId) => {
    const cwd = tabCwdsRef.current[sessionId];
    if (!cwd) return;
    
    setDetailsModalOpen(true);
    setDetailsModalCwd(cwd);
    setDetailsModalLoading(true);
    setDetailsModalItems([]);
    
    const size = tabCwdSizes[sessionId] || 'Unknown';
    setDetailsModalTotalSize(size);
    
    try {
      const res = await window.api.ssh.getDirDetails(sessionId, cwd);
      if (res.success && res.details) {
        const sorted = res.details.sort((a, b) => sizeToBytes(b.size) - sizeToBytes(a.size));
        setDetailsModalItems(sorted);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetailsModalLoading(false);
    }
  };

  const sizeToBytes = (str) => {
    if (!str) return 0;
    const match = str.match(/^([0-9.]+)\s*([KMGTP]?)$/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    switch (unit) {
      case 'K': return num * 1024;
      case 'M': return num * 1024 * 1024;
      case 'G': return num * 1024 * 1024 * 1024;
      case 'T': return num * 1024 * 1024 * 1024 * 1024;
      default: return num;
    }
  };

  // Read the typed command text directly from the xterm.js screen buffer
  const getTypedTextFromScreen = (tabId) => {
    const term = terminalRefs.current[tabId];
    if (!term || !term.buffer || !term.buffer.active) return '';
    const activeBuffer = term.buffer.active;
    const activeLineIndex = activeBuffer.baseY + activeBuffer.cursorY;
    const currentLine = activeBuffer.getLine(activeLineIndex);
    if (currentLine) {
      const lineText = currentLine.translateToString(true);
      const match = lineText.match(/^.*?[#$>\u276f]\s*(.*)$/);
      return match ? match[1] : '';
    }
    return '';
  };

  // Connect to Host
  const connectHost = async (hostObj) => {
    const tabId = `ssh-${Date.now()}`;
    const newTab = {
      id: tabId,
      name: hostObj.name || hostObj.host,
      host: hostObj.host,
      username: hostObj.username,
      status: '连接中...',
      connected: false,
      hostConfig: hostObj // Keep a copy of the host configuration for duplicating session!
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);

    setTimeout(async () => {
      initTerminal(tabId);
      
      const connectConfig = {
        host: hostObj.host,
        port: parseInt(hostObj.port) || 22,
        username: hostObj.username,
        authType: hostObj.authType,
        password: hostObj.password,
        privateKeyPath: hostObj.privateKeyPath,
        passphrase: hostObj.passphrase
      };

      // Retrieve escrowed password credentials if specified
      if (hostObj.authType === 'password' && hostObj.credentialId && hostObj.credentialId !== 'manually') {
        const matchedCred = sshCredentials.find(c => c.id === hostObj.credentialId);
        if (matchedCred) {
          connectConfig.username = matchedCred.username;
          connectConfig.password = matchedCred.password;
        }
      }

      // Retrieve escrowed key details if specified
      if (hostObj.authType === 'key' && hostObj.sshKeyId && hostObj.sshKeyId !== 'manually') {
        const matchedKey = sshKeys.find(k => k.id === hostObj.sshKeyId);
        if (matchedKey) {
          connectConfig.privateKey = matchedKey.privateKey;
          connectConfig.passphrase = matchedKey.passphrase || hostObj.passphrase;
          connectConfig.privateKeyPath = '';
        }
      }

      // Resolve jump host if configured
      if (hostObj.jumpHostId) {
        const jumpHostConfig = hosts.find(h => h.id === hostObj.jumpHostId);
        if (jumpHostConfig) {
          connectConfig.jumpHost = {
            host: jumpHostConfig.host,
            port: parseInt(jumpHostConfig.port) || 22,
            username: jumpHostConfig.username,
            authType: jumpHostConfig.authType,
            password: jumpHostConfig.password,
            privateKeyPath: jumpHostConfig.privateKeyPath,
            passphrase: jumpHostConfig.passphrase
          };

          if (jumpHostConfig.authType === 'password' && jumpHostConfig.credentialId && jumpHostConfig.credentialId !== 'manually') {
            const matchedJumpCred = sshCredentials.find(c => c.id === jumpHostConfig.credentialId);
            if (matchedJumpCred) {
              connectConfig.jumpHost.username = matchedJumpCred.username;
              connectConfig.jumpHost.password = matchedJumpCred.password;
            }
          }

          if (jumpHostConfig.authType === 'key' && jumpHostConfig.sshKeyId && jumpHostConfig.sshKeyId !== 'manually') {
            const matchedJumpKey = sshKeys.find(k => k.id === jumpHostConfig.sshKeyId);
            if (matchedJumpKey) {
              connectConfig.jumpHost.privateKey = matchedJumpKey.privateKey;
              connectConfig.jumpHost.passphrase = matchedJumpKey.passphrase || jumpHostConfig.passphrase;
              connectConfig.jumpHost.privateKeyPath = '';
            }
          }
        }
      }
      
      const res = await window.api.ssh.connect(tabId, connectConfig);

      if (!res.success) {
        const term = terminalRefs.current[tabId];
        if (term) {
          term.write(`\r\n\x1b[31m[错误] 无法连接到服务器: ${res.error}\x1b[0m\r\n`);
        }
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: '连接失败' } : t));
      }
    }, 150);
  };

  // Duplicate Session (Copy active tab connection into a new tab)
  const duplicateSession = (tab) => {
    if (tab.hostConfig) {
      connectHost(tab.hostConfig);
    } else {
      // Fallback for quick connect tabs
      const config = {
        name: tab.name,
        host: tab.host,
        username: tab.username,
        port: 22,
        authType: 'password',
        password: ''
      };
      connectHost(config);
    }
  };

  // Quick Connect Submit
  const handleQuickConnect = () => {
    if (!quickConnectInput) return;
    let username = 'root';
    let hostPortStr = quickConnectInput;
    
    if (quickConnectInput.includes('@')) {
      const parts = quickConnectInput.split('@');
      username = parts[0];
      hostPortStr = parts[1];
    }
    
    let host = hostPortStr;
    let port = 22;
    if (hostPortStr.includes(':')) {
      const parts = hostPortStr.split(':');
      host = parts[0];
      port = parseInt(parts[1]) || 22;
    }

    const pwd = prompt(`请输入 ${username}@${host}:${port} 的连接密码:`);
    if (pwd === null) return;

    connectHost({
      name: `${username}@${host}`,
      host,
      port,
      username,
      authType: 'password',
      password: pwd
    });
  };

  // Close tab
  const closeTab = (tabId) => {
    window.api.ssh.disconnect(tabId);
    
    if (terminalRefs.current[tabId]) {
      terminalRefs.current[tabId].dispose();
      delete terminalRefs.current[tabId];
    }
    delete fitAddonRefs.current[tabId];
    delete containerRefs.current[tabId];
    if (resizeObserverRefs.current[tabId]) {
      resizeObserverRefs.current[tabId].disconnect();
      delete resizeObserverRefs.current[tabId];
    }
    if (resizeTimeoutRefs.current[tabId]) {
      clearTimeout(resizeTimeoutRefs.current[tabId]);
      delete resizeTimeoutRefs.current[tabId];
    }

    const tabIdx = tabs.findIndex(t => t.id === tabId);
    const updatedTabs = tabs.filter(t => t.id !== tabId);
    setTabs(updatedTabs);

    setSftpPaths(prev => {
      const updated = { ...prev };
      delete updated[tabId];
      return updated;
    });

    if (activeTabId === tabId) {
      if (updatedTabs.length > 0) {
        const nextActiveIdx = Math.max(0, tabIdx - 1);
        setActiveTabId(updatedTabs[nextActiveIdx].id);
      } else {
        setActiveTabId('hosts-dashboard');
      }
    }
  };

  // Command Broadcaster Submit (Autocomplete history logic integrated)
  const sendCommand = (broadcast) => {
    if (!broadcastCmd) return;
    
    const cmdStr = broadcastCmd + '\n';
    if (broadcast) {
      tabs.forEach(tab => {
        if (tab.connected) {
          window.api.ssh.write(tab.id, cmdStr);
        }
      });
    } else {
      if (activeTabId && activeTabId !== 'hosts-dashboard') {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.connected) {
          window.api.ssh.write(activeTabId, cmdStr);
        }
      }
    }

    // Persist broadcaster command history
    const trimmed = broadcastCmd.trim();
    if (trimmed) {
      setCmdHistory(prev => {
        const filtered = prev.filter(c => c !== trimmed);
        const next = [trimmed, ...filtered].slice(0, 50); // Cap history list to last 50 items
        localStorage.setItem('debugtoolbox:broadcaster-history', JSON.stringify(next));
        return next;
      });
    }

    setBroadcastCmd('');
    setHistoryIndex(-1);
    setShowSuggestions(false);
  };

  // Autocomplete change and keydown listeners
  const handleBroadcasterInputChange = (e) => {
    const val = e.target.value;
    setBroadcastCmd(val);
    setHistoryIndex(-1); // Reset arrow index

    if (val.trim()) {
      const matches = cmdHistory.filter(cmd => 
        cmd.toLowerCase().includes(val.toLowerCase()) && 
        cmd !== val
      );
      if (matches.length > 0) {
        setShowSuggestions(true);
        setSelectedSuggestionIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const suggestionMatches = cmdHistory.filter(cmd => 
    broadcastCmd && 
    cmd.toLowerCase().includes(broadcastCmd.toLowerCase()) && 
    cmd !== broadcastCmd
  );

  const handleBroadcasterInputKeyDown = (e) => {
    if (showSuggestions && suggestionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev + 1) % suggestionMatches.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev - 1 + suggestionMatches.length) % suggestionMatches.length);
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setBroadcastCmd(suggestionMatches[selectedSuggestionIndex]);
        setShowSuggestions(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    } else {
      // Normal cycling through history using ↑/↓ arrows inside empty or non-suggest input box
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex < cmdHistory.length - 1) {
          const nextIdx = historyIndex + 1;
          setHistoryIndex(nextIdx);
          setBroadcastCmd(cmdHistory[nextIdx]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          const nextIdx = historyIndex - 1;
          setHistoryIndex(nextIdx);
          setBroadcastCmd(cmdHistory[nextIdx]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setBroadcastCmd('');
        }
      }
    }

    // Trigger submission on Enter
    if (e.key === 'Enter' && (!showSuggestions || suggestionMatches.length === 0)) {
      if (e.ctrlKey || e.metaKey) {
        sendCommand(true);
      } else {
        sendCommand(false);
      }
    }
  };

  // SFTP Operations
  const loadSftp = async (sessionId, pathStr) => {
    setSftpLoading(true);
    setSftpError(null);
    try {
      const res = await window.api.sftp.list(sessionId, pathStr);
      if (res.success) {
        setSftpFiles(res.list);
        setSftpPath(pathStr);
        setSftpPathInput(pathStr);
        setSftpPaths(prev => ({ ...prev, [sessionId]: pathStr }));
      } else {
        setSftpError(res.error);
      }
    } catch (e) {
      setSftpError(e.message);
    } finally {
      setSftpLoading(false);
    }
  };

  const handleSftpNavigate = (filename, type) => {
    if (type !== 'd') return;
    let newPath = sftpPath;
    if (filename === '..') {
      const parts = sftpPath.split('/').filter(Boolean);
      parts.pop();
      newPath = '/' + parts.join('/');
    } else {
      newPath = sftpPath.endsWith('/') ? `${sftpPath}${filename}` : `${sftpPath}/${filename}`;
    }
    loadSftp(activeTabId, newPath);
  };

  const handleSftpPathSubmit = (e) => {
    e.preventDefault();
    if (!activeTabId || activeTabId === 'hosts-dashboard' || !sftpPathInput) return;
    loadSftp(activeTabId, sftpPathInput);
  };

  const sftpCreateFolder = async () => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    const folderName = prompt('请输入新建文件夹名称:');
    if (!folderName) return;

    const fullPath = sftpPath.endsWith('/') ? `${sftpPath}${folderName}` : `${sftpPath}/${folderName}`;
    const res = await window.api.sftp.mkdir(activeTabId, fullPath);
    if (res.success) {
      loadSftp(activeTabId, sftpPath);
    } else {
      alert(`创建文件夹失败: ${res.error}`);
    }
  };

  const sftpDelete = async (filename, type) => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    if (!confirm(`确定要删除 ${filename} 吗？`)) return;

    const fullPath = sftpPath.endsWith('/') ? `${sftpPath}${filename}` : `${sftpPath}/${filename}`;
    let res;
    if (type === 'd') {
      res = await window.api.sftp.rmdir(activeTabId, fullPath);
    } else {
      res = await window.api.sftp.deleteFile(activeTabId, fullPath);
    }

    if (res.success) {
      loadSftp(activeTabId, sftpPath);
    } else {
      alert(`删除失败: ${res.error}`);
    }
  };

  const sftpUpload = async () => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    const localPath = await window.api.dialog.openFile({
      title: '选择要上传的文件',
      properties: ['openFile']
    });
    if (!localPath) return;

    const filename = localPath.split(/[/\\]/).pop();
    const remoteDest = sftpPath.endsWith('/') ? `${sftpPath}${filename}` : `${sftpPath}/${filename}`;
    
    setSftpTransfers(prev => [...prev, {
      id: Date.now().toString(),
      sessionId: activeTabId,
      filename,
      type: 'upload',
      progress: 0,
      status: 'pending'
    }]);

    const res = await window.api.sftp.upload(activeTabId, localPath, remoteDest);
    if (!res.success) {
      alert(`文件上传失败: ${res.error}`);
    }
  };

  const sftpDownload = async (filename) => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    const localPath = await window.api.dialog.saveFile({
      title: '另存为',
      defaultPath: filename
    });
    if (!localPath) return;

    const remoteSource = sftpPath.endsWith('/') ? `${sftpPath}${filename}` : `${sftpPath}/${filename}`;
    
    setSftpTransfers(prev => [...prev, {
      id: Date.now().toString(),
      sessionId: activeTabId,
      filename,
      type: 'download',
      progress: 0,
      status: 'pending'
    }]);

    const res = await window.api.sftp.download(activeTabId, remoteSource, localPath);
    if (!res.success) {
      alert(`文件下载失败: ${res.error}`);
    }
  };

  // --- Professional Features Effects & Helpers ---
  useEffect(() => {
    localStorage.setItem('rshell:quick-snippets', JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    const initLocalPath = async () => {
      try {
        if (window.api && window.api.localFs) {
          const home = await window.api.localFs.getHomeDir();
          setLocalPath(home);
          setLocalPathInput(home);
          loadLocalFiles(home);
        }
      } catch (err) {
        console.error('Failed to init local path:', err);
      }
    };
    initLocalPath();
  }, []);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const loadLocalFiles = async (dirPath) => {
    setLocalLoading(true);
    try {
      const res = await window.api.localFs.listDir(dirPath);
      if (res.success && res.items) {
        const sorted = res.items.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        setLocalFiles(sorted);
        setLocalPath(dirPath);
        setLocalPathInput(dirPath);
      }
    } catch (err) {
      console.error('Failed to load local files:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleLocalNavigate = (filename, isDirectory) => {
    if (!isDirectory) return;
    let newPath;
    if (filename === '..') {
      const parts = localPath.split('/').filter(Boolean);
      if (parts.length <= 1) {
        newPath = '/';
      } else {
        newPath = '/' + parts.slice(0, -1).join('/');
      }
    } else {
      newPath = localPath.endsWith('/') ? `${localPath}${filename}` : `${localPath}/${filename}`;
    }
    loadLocalFiles(newPath);
  };

  const triggerUpload = async (localFilePath) => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    const filename = localFilePath.substring(localFilePath.lastIndexOf('/') + 1) || localFilePath;
    const destRemotePath = sftpPath.endsWith('/') ? `${sftpPath}${filename}` : `${sftpPath}/${filename}`;
    const transferId = `up-${Date.now()}-${Math.random()}`;
    
    setSftpTransfers(prev => [...prev, {
      id: transferId,
      sessionId: activeTabId,
      filename,
      localPath: localFilePath,
      remotePath: destRemotePath,
      type: 'upload',
      progress: 0,
      status: 'pending'
    }]);
    
    const res = await window.api.sftp.upload(activeTabId, localFilePath, destRemotePath, transferId);
    if (res.success) {
      loadSftp(activeTabId, sftpPath);
    } else {
      if (cancelledTransfersRef.current.has(filename)) {
        cancelledTransfersRef.current.delete(filename);
      } else {
        alert(`文件上传失败: ${res.error}`);
      }
    }
  };

  const triggerDownload = async (remoteFilePath) => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    const filename = remoteFilePath.substring(remoteFilePath.lastIndexOf('/') + 1) || remoteFilePath;
    const destLocalPath = localPath.endsWith('/') ? `${localPath}${filename}` : `${localPath}/${filename}`;
    const transferId = `down-${Date.now()}-${Math.random()}`;
    
    setSftpTransfers(prev => [...prev, {
      id: transferId,
      sessionId: activeTabId,
      filename,
      localPath: destLocalPath,
      remotePath: remoteFilePath,
      type: 'download',
      progress: 0,
      status: 'pending'
    }]);
    
    const res = await window.api.sftp.download(activeTabId, remoteFilePath, destLocalPath, transferId);
    if (res.success) {
      loadLocalFiles(localPath);
    } else {
      if (cancelledTransfersRef.current.has(filename)) {
        cancelledTransfersRef.current.delete(filename);
      } else {
        alert(`文件下载失败: ${res.error}`);
      }
    }
  };

  const executeSnippet = (cmdText, autoSend) => {
    if (activeTabId === 'hosts-dashboard') return;
    window.api.ssh.write(activeTabId, cmdText + (autoSend ? '\r' : ''));
    window.api.ssh.notifyActivity(activeTabId);
    // Autofocus terminal back
    const term = terminalRefs.current[activeTabId];
    if (term) term.focus();
  };

  const handleContextPaste = async (sessionId) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        window.api.ssh.write(sessionId, text);
      }
    } catch (err) {
      console.error('Clipboard paste failed:', err);
    }
    setContextMenu(null);
    // Autofocus terminal back
    const term = terminalRefs.current[sessionId];
    if (term) term.focus();
  };

  const handlePauseResumeTransfer = async (transfer) => {
    const isPaused = transfer.status === 'paused';
    const nextStatus = isPaused ? 'running' : 'paused';

    setSftpTransfers(prev => prev.map(t => 
      (t.id === transfer.id) ? { ...t, status: nextStatus } : t
    ));

    try {
      if (isPaused) {
        await window.api.sftp.resumeTransfer(transfer.sessionId, transfer.remotePath);
      } else {
        await window.api.sftp.pauseTransfer(transfer.sessionId, transfer.remotePath);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelTransfer = async (transfer) => {
    cancelledTransfersRef.current.add(transfer.filename);
    setSftpTransfers(prev => prev.map(t =>
      (t.id === transfer.id) ? { ...t, status: 'cancelled', progress: 0 } : t
    ));
    try {
      await window.api.sftp.abortTransfers(transfer.sessionId, transfer.remotePath);
    } catch (e) {
      console.error(e);
    }
  };

  const handleZoomTerminal = (delta) => {
    if (!activeTabId || activeTabId === 'hosts-dashboard') return;
    const term = terminalRefs.current[activeTabId];
    if (term) {
      const newSize = Math.max(10, Math.min(24, term.options.fontSize + delta));
      term.options.fontSize = newSize;
      setTimeout(() => {
        if (fitAddonRefs.current[activeTabId]) {
          fitAddonRefs.current[activeTabId].fit();
          window.api.ssh.resize(activeTabId, term.cols, term.rows);
        }
      }, 50);
    }
  };

  const reconnectTab = async (tabObj) => {
    try {
      window.api.ssh.disconnect(tabObj.id);
      
      // Update tab status to connecting
      setTabs(prev => prev.map(t => t.id === tabObj.id ? { ...t, connected: false, status: 'connecting' } : t));
      
      // Prepare connection options
      const hostConf = tabObj.hostConfig;
      const connectConfig = {
        host: hostConf.host,
        port: parseInt(hostConf.port) || 22,
        username: hostConf.username,
        authType: hostConf.authType,
        password: hostConf.password,
        privateKeyPath: hostConf.privateKeyPath,
        passphrase: hostConf.passphrase
      };

      // Retrieve escrowed password credentials if specified
      if (hostConf.authType === 'password' && hostConf.credentialId && hostConf.credentialId !== 'manually') {
        const matchedCred = Bt.find(c => c.id === hostConf.credentialId);
        if (matchedCred) {
          connectConfig.username = matchedCred.username;
          connectConfig.password = matchedCred.password;
        }
      }

      // Retrieve escrowed SSH keys if specified
      if (hostConf.authType === 'key' && hostConf.sshKeyId && hostConf.sshKeyId !== 'manually') {
        const matchedKey = Xt.find(k => k.id === hostConf.sshKeyId);
        if (matchedKey) {
          connectConfig.privateKey = matchedKey.privateKey;
          connectConfig.passphrase = matchedKey.passphrase || hostConf.passphrase;
          connectConfig.privateKeyPath = ''; // clear path when key is loaded from escrow
        }
      }

      // Handle Jump Host Tunnel if configured
      if (hostConf.jumpHostId) {
        const jumpHost = e.find(h => h.id === hostConf.jumpHostId);
        if (jumpHost) {
          connectConfig.jumpHost = {
            host: jumpHost.host,
            port: parseInt(jumpHost.port) || 22,
            username: jumpHost.username,
            authType: jumpHost.authType,
            password: jumpHost.password,
            privateKeyPath: jumpHost.privateKeyPath,
            passphrase: jumpHost.passphrase
          };

          if (jumpHost.authType === 'password' && jumpHost.credentialId && jumpHost.credentialId !== 'manually') {
            const matchedJumpCred = Bt.find(c => c.id === jumpHost.credentialId);
            if (matchedJumpCred) {
              connectConfig.jumpHost.username = matchedJumpCred.username;
              connectConfig.jumpHost.password = matchedJumpCred.password;
            }
          }

          if (jumpHost.authType === 'key' && jumpHost.sshKeyId && jumpHost.sshKeyId !== 'manually') {
            const matchedJumpKey = Xt.find(k => k.id === jumpHost.sshKeyId);
            if (matchedJumpKey) {
              connectConfig.jumpHost.privateKey = matchedJumpKey.privateKey;
              connectConfig.jumpHost.passphrase = matchedJumpKey.passphrase || jumpHost.passphrase;
              connectConfig.jumpHost.privateKeyPath = '';
            }
          }
        }
      }

      const res = await window.api.ssh.connect(tabObj.id, connectConfig);

      if (!res.success) {
        setTabs(prev => prev.map(t => t.id === tabObj.id ? { ...t, status: 'error', error: res.error } : t));
      }
    } catch (err) {
      console.error(err);
      setTabs(prev => prev.map(t => t.id === tabObj.id ? { ...t, status: 'error', error: err.message } : t));
    }
  };

  const handleQueueResizeMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = sftpQueueHeight;

    const handleMouseMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(80, Math.min(500, startHeight + deltaY));
      setSftpQueueHeight(newHeight);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDrawerResizeMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sftpDrawerWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(320, Math.min(1200, startWidth + deltaX));
      setSftpDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSearchChange = (tabId, value) => {
    setSearchQuery(value);
    const searchAddon = searchAddonRefs.current[tabId];
    if (searchAddon) {
      if (value) {
        searchAddon.findNext(value, { incremental: true });
      } else {
        searchAddon.findNext('', { incremental: true });
      }
    }
  };

  const handleSearchNext = (tabId, goBack = false) => {
    const searchAddon = searchAddonRefs.current[tabId];
    if (searchAddon && searchQuery) {
      if (goBack) {
        searchAddon.findPrevious(searchQuery);
      } else {
        searchAddon.findNext(searchQuery);
      }
    }
  };

  const syncBufferFromScreen = (tabId, term) => {
    if (!term || !term.buffer || !term.buffer.active) return;
    const activeBuffer = term.buffer.active;
    const activeLineIndex = activeBuffer.baseY + activeBuffer.cursorY;
    const currentLine = activeBuffer.getLine(activeLineIndex);
    
    if (currentLine) {
      const lineText = currentLine.translateToString(true);
      // Added '%' to prompt characters list to support macOS Zsh prompts
      const match = lineText.match(/^.*?[#$>%❯\u276f]\s*(.*)$/);
      const typedFromScreen = match ? match[1] : '';
      
      // If the screen prompt is empty, clear the local buffer too
      if (typedFromScreen === '') {
        if (sessionBuffers.current[tabId] !== '') {
          sessionBuffers.current[tabId] = '';
          setTerminalSuggestions([]);
          suggestionsRef.current = [];
        }
      } else if (typedFromScreen !== sessionBuffers.current[tabId]) {
        // Only sync if the screen text has a different value that is LONGER (e.g. Tab autocomplete has updated the screen)
        // or if the local buffer is empty (e.g. cursor line reset or paste actions)
        if (typedFromScreen.length > (sessionBuffers.current[tabId] || '').length || !sessionBuffers.current[tabId]) {
          sessionBuffers.current[tabId] = typedFromScreen;
          
          if (typedFromScreen.trim().length >= 2) {
            const matches = cmdHistoryRef.current
              .filter(h => h.startsWith(typedFromScreen) && h !== typedFromScreen)
              .slice(0, 6);
              
            if (matches.length > 0) {
              setTerminalSuggestions(matches);
              suggestionsRef.current = matches;
              
              setSelectedTerminalSuggestionIndex(-1);
              selectedIndexRef.current = -1;

              setTerminalSuggestionCoords({
                sessionId: tabId,
                x: activeBuffer.cursorX,
                y: activeBuffer.cursorY
              });
            } else {
              setTerminalSuggestions([]);
              suggestionsRef.current = [];
            }
          } else {
            setTerminalSuggestions([]);
            suggestionsRef.current = [];
          }
        }
      }
    }
  };

  const selectKeyPath = async () => {
    const file = await window.api.dialog.openFile({
      title: '选择私钥文件',
      properties: ['openFile']
    });
    if (file) {
      setFormPrivateKeyPath(file);
    }
  };

  const saveHost = (e) => {
    e.preventDefault();
    if (!formHost) return;

    const newHost = {
      id: editingHost ? editingHost.id : `host-${Date.now()}`,
      name: formName || formHost,
      host: formHost,
      port: parseInt(formPort) || 22,
      username: formUsername,
      authType: formAuthType,
      password: formPassword,
      privateKeyPath: formPrivateKeyPath,
      passphrase: formPassphrase,
      group: formGroup,
      jumpHostId: formJumpHostId,
      sshKeyId: formSshKeyId,
      credentialId: formCredentialId
    };

    if (editingHost) {
      setHosts(prev => prev.map(h => h.id === editingHost.id ? newHost : h));
    } else {
      setHosts(prev => [...prev, newHost]);
    }

    closeHostEditor();
  };

  const closeHostEditor = () => {
    setShowHostEditor(false);
    setEditingHost(null);
    setFormName('');
    setFormHost('');
    setFormPort('22');
    setFormUsername('root');
    setFormAuthType('password');
    setFormPassword('');
    setFormPrivateKeyPath('');
    setFormPassphrase('');
    setFormJumpHostId('');
    setFormSshKeyId('manually');
    setFormCredentialId('manually');
  };

  const openEditHost = (hostObj, event) => {
    event.stopPropagation();
    setEditingHost(hostObj);
    setFormName(hostObj.name);
    setFormHost(hostObj.host);
    setFormPort(hostObj.port.toString());
    setFormUsername(hostObj.username);
    setFormAuthType(hostObj.authType);
    setFormPassword(hostObj.password || '');
    setFormPrivateKeyPath(hostObj.privateKeyPath || '');
    setFormPassphrase(hostObj.passphrase || '');
    setFormGroup(hostObj.group || '开发环境');
    setFormJumpHostId(hostObj.jumpHostId || '');
    setFormSshKeyId(hostObj.sshKeyId || 'manually');
    setFormCredentialId(hostObj.credentialId || 'manually');
    setShowHostEditor(true);
  };

  const duplicateHostConfig = (hostObj, event) => {
    event.stopPropagation();
    const newHost = {
      ...hostObj,
      id: `host-${Date.now()}`,
      name: `${hostObj.name} - 副本`
    };
    setHosts(prev => [...prev, newHost]);
  };

  const deleteHost = (hostId, event) => {
    event.stopPropagation();
    if (confirm('确定要删除此主机配置吗？')) {
      setHosts(prev => prev.filter(h => h.id !== hostId));
    }
  };


  const filteredHosts = hosts.filter(h => {
    const matchesGroup = activeGroup === 'All' || h.group === activeGroup;
    const matchesSearch = h.name.toLowerCase().includes(hostSearchQuery.toLowerCase()) || 
                          h.host.toLowerCase().includes(hostSearchQuery.toLowerCase()) ||
                          h.username.toLowerCase().includes(hostSearchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const formatBytes = (bytes) => {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec) => {
    if (bytesPerSec === undefined || bytesPerSec === null) return '0 B/s';
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    const kb = bytesPerSec / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB/s`;
  };

  const renderSparkline = (dataPoints, strokeColor) => {
    if (!dataPoints || dataPoints.length === 0) return null;
    const width = 230;
    const height = 55;
    const padding = 4;
    const maxVal = 100;
    
    const points = dataPoints.map((val, idx) => {
      const x = (idx / (dataPoints.length - 1)) * (width - padding * 2) + padding;
      const y = height - (val / maxVal) * (height - padding * 2) - padding;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width="100%" height={height} className="sparkline-svg">
        <line x1="0" y1="12" x2={width} y2="12" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        <line x1="0" y1="27" x2={width} y2="27" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        <line x1="0" y1="42" x2={width} y2="42" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.8"
          points={points}
          style={{ filter: `drop-shadow(0 0 3px ${strokeColor}cc)` }}
        />
      </svg>
    );
  };

  const renderLeftMonitorPanel = () => {
    return (
      <div className="left-monitor-sidebar-component">
        <div className="sidebar-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={14} color="var(--color-primary)" />
            <span>系统遥测</span>
          </div>
          <span className="live-badge-glow">LIVE 2s</span>
        </div>

        {!activeTabId || !tabs.find(t => t.id === activeTabId)?.connected ? (
          <div className="drawer-offline-placeholder">
            <AlertCircle size={20} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
            <span>会话未连接</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
              请双击主机配置连接服务器后，即可开始接收遥测性能指标
            </span>
          </div>
        ) : !activeStats ? (
          <div className="sftp-loading-state" style={{ height: '240px' }}>
            <RefreshCw size={18} className="spin" />
            <span>正在建立实时信息通道...</span>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '6px' }}>
              (监控支持标准 Linux /proc)
            </span>
          </div>
        ) : (
          <div className="monitor-widgets-scroll">
            
            {/* 1. CPU circular & sparkline */}
            <div className="monitor-widget-card">
              <div className="widget-header-row">
                <div className="widget-header">
                  <Cpu size={13} color="var(--color-primary)" />
                  <span>CPU 活跃负载</span>
                </div>
                <span className="widget-value-tag">{activeStats?.cpu || 0}%</span>
              </div>
              
              <div className="widget-body-curve">
                {activeHistory && renderSparkline(activeHistory.cpu, '#00e5ff')}
              </div>
            </div>

            {/* 2. RAM Linear & Sparkline */}
            <div className="monitor-widget-card">
              <div className="widget-header-row">
                <div className="widget-header">
                  <Activity size={13} color="var(--color-success)" />
                  <span>RAM 随机运存</span>
                </div>
                <span className="widget-value-tag text-success">{activeStats?.mem?.percent || 0}%</span>
              </div>
              <div className="widget-sub-values">
                {formatBytes(activeStats?.mem?.used || 0)} / {formatBytes(activeStats?.mem?.total || 0)}
              </div>
              <div className="widget-body-curve">
                {activeHistory && renderSparkline(activeHistory.mem, '#39ff14')}
              </div>
            </div>

            {/* 3. Real-time Net Speeds (Upload / Download) */}
            <div className="monitor-widget-card">
              <div className="widget-header">
                <ArrowLeftRight size={13} color="#f53b57" />
                <span>实时网络流量 (网速)</span>
              </div>
              
              <div className="net-speeds-row">
                <div className="speed-col">
                  <div className="speed-label">
                    <ArrowDown size={11} color="var(--color-primary)" />
                    <span>下载 (RX)</span>
                  </div>
                  <div className="speed-val">{formatSpeed(activeStats?.downSpeed || 0)}</div>
                </div>
                <div className="speed-col">
                  <div className="speed-label">
                    <ArrowUp size={11} color="#f53b57" />
                    <span>上传 (TX)</span>
                  </div>
                  <div className="speed-val">{formatSpeed(activeStats?.upSpeed || 0)}</div>
                </div>
              </div>
            </div>

            {/* 4. Load Average (1m, 5m, 15m) */}
            <div className="monitor-widget-card">
              <div className="widget-header">
                <Layers size={13} color="var(--color-warning)" />
                <span>CPU 系统平均负载 (Load)</span>
              </div>
              <div className="load-pills-row">
                <div className="load-pill">
                  <span className="pill-name">1分钟</span>
                  <span className="pill-val">{activeStats?.load ? activeStats.load[0] : '0.00'}</span>
                </div>
                <div className="load-pill">
                  <span className="pill-name">5分钟</span>
                  <span className="pill-val">{activeStats?.load ? activeStats.load[1] : '0.00'}</span>
                </div>
                <div className="load-pill">
                  <span className="pill-name">15分钟</span>
                  <span className="pill-val">{activeStats?.load ? activeStats.load[2] : '0.00'}</span>
                </div>
              </div>
            </div>

            {/* 5. Disk storage usage */}
            <div className="monitor-widget-card">
              <div className="widget-header-row">
                <div className="widget-header">
                  <HardDrive size={13} color="#a29bfe" />
                  <span>根文件磁盘空间 (Disk)</span>
                </div>
                <span className="widget-value-tag text-accent">{activeStats?.disk?.percent || 0}%</span>
              </div>
              <div className="widget-sub-values" style={{ marginBottom: '8px' }}>
                已占用: {activeStats?.disk?.used || '-'} / 总共: {activeStats?.disk?.total || '-'}
              </div>
              <div className="linear-gauge-track">
                <div 
                  className="linear-gauge-fill" 
                  style={{ 
                    width: `${activeStats?.disk?.percent || 0}%`,
                    background: (activeStats?.disk?.percent || 0) > 90 ? 'var(--color-danger)' : '#a29bfe'
                  }}
                />
              </div>
            </div>

            {/* 6. Current Directory Space Analyzer (Du) */}
            <div className="monitor-widget-card">
              <div className="widget-header-row">
                <div className="widget-header">
                  <Folder size={13} color="var(--color-primary)" />
                  <span>当前目录空间分析</span>
                </div>
                {tabCwdSizesLoading[activeTabId] ? (
                  <RefreshCw size={11} className="spin text-muted" />
                ) : (
                  <span className="widget-value-tag text-primary" style={{ cursor: 'pointer' }} onClick={() => handleRefreshCwdSize(activeTabId)} title="点击刷新空间占用">
                    {tabCwdSizes[activeTabId] || 'Unknown'}
                  </span>
                )}
              </div>
              <div 
                className="widget-sub-values" 
                style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '10px', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  marginTop: '4px',
                  marginBottom: '8px'
                }} 
                title={tabCwdsRef.current[activeTabId] || '/'}
              >
                路径: {tabCwdsRef.current[activeTabId] || '/'}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  style={{ 
                    flex: 1, 
                    padding: '6px 8px', 
                    fontSize: '10.5px', 
                    borderRadius: '4px', 
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-light)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                  onClick={() => handleRefreshCwdSize(activeTabId)}
                  disabled={tabCwdSizesLoading[activeTabId]}
                >
                  <RefreshCw size={10} className={tabCwdSizesLoading[activeTabId] ? 'spin' : ''} />
                  <span>重新扫描</span>
                </button>
                <button 
                  style={{ 
                    flex: 1, 
                    padding: '6px 8px', 
                    fontSize: '10.5px', 
                    borderRadius: '4px', 
                    background: 'rgba(0, 229, 255, 0.1)',
                    border: '1px solid rgba(0, 229, 255, 0.25)',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                  onClick={() => handleOpenCwdDetails(activeTabId)}
                  disabled={!tabCwdsRef.current[activeTabId]}
                >
                  <List size={10} />
                  <span>空间详情</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    );
  };

  const activeStats = (activeTabId && activeTabId !== 'hosts-dashboard') ? sessionStats[activeTabId] : null;
  const activeHistory = (activeTabId && activeTabId !== 'hosts-dashboard') ? statsHistory[activeTabId] : null;

  // Render Host Panel/Sidebar (Termius full width list format)
  const renderHostSidebarList = () => {
    return (
      <div className="host-sidebar-component">
        <div className="sidebar-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={14} color="var(--color-primary)" />
            <span>主机预置 (Termius)</span>
          </div>
          <button className="icon-btn-primary" onClick={() => setShowHostEditor(true)}>
            <Plus size={13} />
          </button>
        </div>

        <div className="host-search-wrapper">
          <Search size={11} className="search-icon" />
          <input 
            type="text" 
            placeholder="搜索主机名/IP..." 
            value={hostSearchQuery} 
            onChange={(e) => setHostSearchQuery(e.target.value)} 
            className="host-search-input"
          />
        </div>

        <div className="group-tabs">
          <button 
            className={`group-tab ${activeGroup === 'All' ? 'active' : ''}`}
            onClick={() => setActiveGroup('All')}
          >
            全部 ({hosts.length})
          </button>
          {groups.map(g => (
            <button 
              key={g} 
              className={`group-tab ${activeGroup === g ? 'active' : ''}`}
              onClick={() => setActiveGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="host-list-scroll">
          {filteredHosts.length === 0 ? (
            <div className="empty-hosts-placeholder">
              <AlertCircle size={20} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
              <div>无符合主机配置</div>
            </div>
          ) : (
            filteredHosts.map(hostObj => (
              <div 
                key={hostObj.id} 
                className="host-card"
                onDoubleClick={() => connectHost(hostObj)}
              >
                <div className="host-card-border-indicator" style={{ 
                  background: hostObj.group === '生产环境' ? 'var(--color-danger)' : 
                              hostObj.group === '测试环境' ? 'var(--color-warning)' : 'var(--color-primary)'
                }} />
                <div className="host-card-info" title="双击连接主机">
                  <div className="host-card-title">{hostObj.name}</div>
                  <div className="host-card-sub">{hostObj.username}@{hostObj.host}</div>
                </div>
                                 <div className="host-card-actions">
                   <button className="action-btn" onClick={(e) => openEditHost(hostObj, e)} title="编辑配置">
                     <Edit3 size={11} />
                   </button>
                   <button className="action-btn" onClick={(e) => duplicateHostConfig(hostObj, e)} title="复制配置">
                     <Copy size={11} />
                   </button>
                   <button className="action-btn text-danger" onClick={(e) => deleteHost(hostObj.id, e)} title="删除配置">
                     <Trash2 size={11} />
                   </button>
                 </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="ssh-dashboard-container">
      
      {/* Unifying Top Tab Bar and Layout viewports */}
      <div className="app-workspace-split">
        
        {/* Persistent Shared Tabs Header Bar */}
        <div className="tab-headers-bar">
          
          {/* Toggle sidebar (Only active/clickable when terminal tab is selected) */}
          <button 
            className={`sidebar-toggle-btn ${showLeftSidebar ? 'active' : ''}`}
            onClick={() => {
              if (activeTabId !== 'hosts-dashboard') {
                setShowLeftSidebar(!showLeftSidebar);
              }
            }}
            disabled={activeTabId === 'hosts-dashboard'}
            title={activeTabId === 'hosts-dashboard' ? '查看会话时可使用监控面板' : '显示/隐藏侧边监控面板'}
          >
            <Monitor size={14} />
          </button>

          {/* Persistent Start Tab for Host Manager (Termius dashboard style) */}
          <div 
            className={`terminal-tab-header dashboard-tab ${activeTabId === 'hosts-dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTabId('hosts-dashboard')}
          >
            <Server size={12} className="tab-icon" color={activeTabId === 'hosts-dashboard' ? 'var(--color-primary)' : 'var(--text-muted)'} />
            <span className="tab-title">🏠 主机管理</span>
          </div>

          {/* Active terminals list */}
          <div className="tabs-list-wrapper">
            {tabs.map(tab => (
              <div 
                key={tab.id} 
                className={`terminal-tab-header ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setTimeout(handleWindowResize, 50);
                }}
              >
                <Terminal size={12} className="tab-icon" color={tab.connected ? 'var(--color-success)' : 'var(--color-inactive)'} />
                <span className="tab-title" title={tab.host}>{tab.name}</span>
                <button 
                  className="tab-duplicate-btn" 
                  onClick={(e) => { e.stopPropagation(); duplicateSession(tab); }}
                  title="复制会话 (在新标签页打开相同连接)"
                >
                  <Copy size={9} />
                </button>
                <button 
                  className="tab-close-btn" 
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Add New Session via quick connection input */}
          <div className="tabs-quick-connect-inline">
            <input 
              type="text" 
              placeholder="快速新建: root@192.168.1.1:22" 
              value={quickConnectInput}
              onChange={(e) => setQuickConnectInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuickConnect(); }}
              className="tab-quick-input"
            />
            <button className="tab-quick-add-btn" onClick={handleQuickConnect}>
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Content Viewports (never unmounted to prevent terminal black screen / layout bugs) */}
        <div 
          className="hosts-grid-dashboard-screen"
          style={{ display: activeTabId === 'hosts-dashboard' ? 'block' : 'none' }}
        >
            {/* Top Toolbar Row */}
            <div className="hosts-dashboard-top-row">
              <div className="dashboard-title-box" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px' }}>
                  <button 
                    type="button"
                    style={{ 
                      padding: '6px 16px', 
                      fontSize: '12.5px', 
                      fontWeight: '500',
                      borderRadius: '4px',
                      background: dashboardMode === 'hosts' ? 'var(--color-primary)' : 'transparent',
                      color: dashboardMode === 'hosts' ? '#000000' : 'var(--text-light)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => { setDashboardMode('hosts'); setHostSearchQuery(''); }}
                  >
                    <Server size={12} />
                    <span>主机列表</span>
                  </button>
                  <button 
                    type="button"
                    style={{ 
                      padding: '6px 16px', 
                      fontSize: '12.5px', 
                      fontWeight: '500',
                      borderRadius: '4px',
                      background: dashboardMode === 'credentials' ? 'var(--color-primary)' : 'transparent',
                      color: dashboardMode === 'credentials' ? '#000000' : 'var(--text-light)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => { setDashboardMode('credentials'); setHostSearchQuery(''); }}
                  >
                    <Lock size={12} />
                    <span>密码凭据</span>
                  </button>
                  <button 
                    type="button"
                    style={{ 
                      padding: '6px 16px', 
                      fontSize: '12.5px', 
                      fontWeight: '500',
                      borderRadius: '4px',
                      background: dashboardMode === 'keys' ? 'var(--color-primary)' : 'transparent',
                      color: dashboardMode === 'keys' ? '#000000' : 'var(--text-light)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => { setDashboardMode('keys'); setHostSearchQuery(''); }}
                  >
                    <Key size={12} />
                    <span>密钥托管</span>
                  </button>
                </div>
              </div>

              {/* Quick Connect bar integrated directly inside the page header */}
              {dashboardMode === 'hosts' ? (
                <div className="quick-dial-box">
                  <input 
                    type="text" 
                    placeholder="快速连接命令: root@192.168.1.100" 
                    value={quickConnectInput}
                    onChange={(e) => setQuickConnectInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleQuickConnect(); }}
                    className="quick-dial-input"
                  />
                  <button className="quick-dial-btn" onClick={handleQuickConnect}>
                    <Play size={12} style={{ marginRight: '4px' }} /> 快速拨号
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1 }} />
              )}

              {dashboardMode === 'hosts' ? (
                <button className="btn-primary" onClick={() => setShowHostEditor(true)}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> 新建主机配置
                </button>
              ) : dashboardMode === 'credentials' ? (
                <button className="btn-primary" onClick={() => setShowCredEditor(true)}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> 新建密码凭据
                </button>
              ) : (
                <button className="btn-primary" onClick={() => setShowKeyEditor(true)}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> 新建托管密钥
                </button>
              )}
            </div>

            {dashboardMode === 'hosts' ? (
              <>
                {/* Filter and Search Row */}
                <div className="hosts-dashboard-filter-row">
                  <div className="filter-group-pills">
                    <button 
                      className={`filter-pill ${activeGroup === 'All' ? 'active' : ''}`}
                      onClick={() => setActiveGroup('All')}
                    >
                      全部 ({hosts.length})
                    </button>
                    {groups.map(g => (
                      <button 
                        key={g} 
                        className={`filter-pill ${activeGroup === g ? 'active' : ''}`}
                        onClick={() => setActiveGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div className="grid-search-wrapper">
                    <Search size={12} className="grid-search-icon" />
                    <input 
                      type="text" 
                      placeholder="搜索主机别名、IP地址或用户名..." 
                      value={hostSearchQuery} 
                      onChange={(e) => setHostSearchQuery(e.target.value)} 
                      className="grid-search-input"
                    />
                  </div>
                </div>

                {/* Main responsive grid containing small block cards (Termius mockup matched!) */}
                <div className="hosts-dashboard-grid-scroll">
                  <div className="hosts-grid-layout">
                    {filteredHosts.length === 0 ? (
                      <div className="empty-hosts-placeholder">
                        <AlertCircle size={26} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
                        <div>无符合搜索的主机预设</div>
                      </div>
                    ) : (
                      filteredHosts.map(hostObj => {
                        // Set color gradients based on group category
                        let gradientBg = 'linear-gradient(135deg, #00b894, #00dec9)'; // Default green for 开发环境
                        let iconColor = '#ffffff';

                        if (hostObj.group === '生产环境') {
                          gradientBg = 'linear-gradient(135deg, #d63031, #ff7675)'; // Red
                        } else if (hostObj.group === '测试环境') {
                          gradientBg = 'linear-gradient(135deg, #0984e3, #74b9ff)'; // Blue
                        }

                        const hasCred = hostObj.authType === 'password' && hostObj.credentialId && hostObj.credentialId !== 'manually';
                        const hasKey = hostObj.authType === 'key' && hostObj.sshKeyId && hostObj.sshKeyId !== 'manually';

                        return (
                          <div 
                            key={hostObj.id}
                            className="grid-host-block-card"
                            onDoubleClick={() => connectHost(hostObj)}
                            title="双击建立 SSH 终端会话"
                          >
                            {/* Left: Beautiful rounded icon container (Mockup matched!) */}
                            <div className="grid-host-icon-wrapper" style={{ background: gradientBg }}>
                              <Server size={18} color={iconColor} />
                            </div>

                            {/* Right: details stacked */}
                            <div className="grid-host-details">
                              <div className="grid-host-title">{hostObj.name}</div>
                              <div className="grid-host-protocol">
                                ssh, {hostObj.username} {hasCred ? '(🔑 凭据托管)' : hasKey ? '(🔑 密钥托管)' : ''}
                              </div>
                              <div className="grid-host-ip" title={hostObj.host}>{hostObj.host}:{hostObj.port}</div>
                            </div>

                            {/* Hover Actions */}
                            <div className="grid-host-actions">
                              <button className="action-btn" onClick={(e) => openEditHost(hostObj, e)} title="修改配置">
                                <Edit3 size={11} />
                              </button>
                              <button className="action-btn" onClick={(e) => duplicateHostConfig(hostObj, e)} title="复制配置">
                                <Copy size={11} />
                              </button>
                              <button className="action-btn text-danger" onClick={(e) => deleteHost(hostObj.id, e)} title="删除主机">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                
                <div className="hosts-grid-footer-tip">
                  双击卡片以建立 SSH 终端连接，将在顶部开辟新的标签页面
                </div>
              </>
            ) : dashboardMode === 'credentials' ? (
              <>
                {/* Credentials Filter and Search Row */}
                <div className="hosts-dashboard-filter-row">
                  <div className="filter-group-pills">
                    <button className="filter-pill active">
                      密码凭据数 ({sshCredentials.length})
                    </button>
                  </div>

                  <div className="grid-search-wrapper">
                    <Search size={12} className="grid-search-icon" />
                    <input 
                      type="text" 
                      placeholder="搜索密码凭据别名或用户名..." 
                      value={hostSearchQuery} 
                      onChange={(e) => setHostSearchQuery(e.target.value)} 
                      className="grid-search-input"
                    />
                  </div>
                </div>

                {/* Credentials Grid */}
                <div className="hosts-dashboard-grid-scroll">
                  <div className="hosts-grid-layout">
                    {sshCredentials.filter(c => 
                      c.name.toLowerCase().includes(hostSearchQuery.toLowerCase()) || 
                      c.username.toLowerCase().includes(hostSearchQuery.toLowerCase())
                    ).length === 0 ? (
                      <div className="empty-hosts-placeholder">
                        <AlertCircle size={26} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
                        <div>无符合搜索的密码凭据</div>
                      </div>
                    ) : (
                      sshCredentials.filter(c => 
                        c.name.toLowerCase().includes(hostSearchQuery.toLowerCase()) || 
                        c.username.toLowerCase().includes(hostSearchQuery.toLowerCase())
                      ).map(credObj => (
                        <div 
                          key={credObj.id}
                          className="grid-host-block-card"
                          title="点击修改密码凭据"
                          onClick={(e) => openEditCred(credObj, e)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="grid-host-icon-wrapper" style={{ background: 'linear-gradient(135deg, #ffeaa7, #fdcb6e)' }}>
                            <Lock size={18} color="#ffffff" />
                          </div>

                          <div className="grid-host-details">
                            <div className="grid-host-title">{credObj.name}</div>
                            <div className="grid-host-protocol" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                              用户名: <span style={{ color: 'var(--color-primary)', fontWeight: '600' }}>{credObj.username}</span>
                            </div>
                            <div className="grid-host-ip" style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                              密码: ••••••••
                            </div>
                          </div>

                          {/* Hover Actions */}
                          <div className="grid-host-actions">
                            <button className="action-btn" onClick={(e) => openEditCred(credObj, e)} title="修改凭据">
                              <Edit3 size={11} />
                            </button>
                            <button className="action-btn text-danger" onClick={(e) => deleteSshCredential(credObj.id, e)} title="删除凭据">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="hosts-grid-footer-tip">
                  已关联的密码凭据将在主机使用密码验证时自动加载并进行登录认证，避免重复输入用户名密码
                </div>
              </>
            ) : (
              <>
                {/* Keys Filter and Search Row */}
                <div className="hosts-dashboard-filter-row">
                  <div className="filter-group-pills">
                    <button className="filter-pill active">
                      密钥托管数 ({sshKeys.length})
                    </button>
                  </div>

                  <div className="grid-search-wrapper">
                    <Search size={12} className="grid-search-icon" />
                    <input 
                      type="text" 
                      placeholder="搜索托管密钥别名..." 
                      value={hostSearchQuery} 
                      onChange={(e) => setHostSearchQuery(e.target.value)} 
                      className="grid-search-input"
                    />
                  </div>
                </div>

                {/* Keys Grid */}
                <div className="hosts-dashboard-grid-scroll">
                  <div className="hosts-grid-layout">
                    {sshKeys.filter(k => k.name.toLowerCase().includes(hostSearchQuery.toLowerCase())).length === 0 ? (
                      <div className="empty-hosts-placeholder">
                        <AlertCircle size={26} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
                        <div>无符合搜索的托管密钥</div>
                      </div>
                    ) : (
                      sshKeys.filter(k => k.name.toLowerCase().includes(hostSearchQuery.toLowerCase())).map(keyObj => (
                        <div 
                          key={keyObj.id}
                          className="grid-host-block-card"
                          title="点击修改托管密钥"
                          onClick={(e) => openEditKey(keyObj, e)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="grid-host-icon-wrapper" style={{ background: 'linear-gradient(135deg, #a29bfe, #6c5ce7)' }}>
                            <Key size={18} color="#ffffff" />
                          </div>

                          <div className="grid-host-details">
                            <div className="grid-host-title">{keyObj.name}</div>
                            <div className="grid-host-protocol" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                              创建时间: {keyObj.createdAt}
                            </div>
                            <div className="grid-host-ip" style={{ color: 'var(--text-muted)', fontSize: '10.5px', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                              {keyObj.privateKey.substring(0, 30)}...
                            </div>
                          </div>

                          {/* Hover Actions */}
                          <div className="grid-host-actions">
                            <button className="action-btn" onClick={(e) => openEditKey(keyObj, e)} title="修改密钥">
                              <Edit3 size={11} />
                            </button>
                            <button className="action-btn text-danger" onClick={(e) => deleteSshKey(keyObj.id, e)} title="删除密钥">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="hosts-grid-footer-tip">
                  已关联的托管密钥将在 SSH 密钥认证时自动加载并进行登录认证
                </div>
              </>
            )}
          </div>

          {/* VIEWPORT 2: TERMINAL WORKSPACE SCREEN (Left Monitor, Center Terminal, Right SFTP) */}
          <div 
            className="terminal-session-screen"
            style={{ display: activeTabId !== 'hosts-dashboard' ? 'flex' : 'none' }}
          >
            {/* Left sidebar: strictly dedicated to active stats monitoring */}
            <div className={`collapsible-left-sidebar ${showLeftSidebar ? 'open' : 'collapsed'}`}>
              {showLeftSidebar && renderLeftMonitorPanel()}
            </div>

            {/* Main workspace container */}
            <div className="session-main-pane">
              
              {/* Terminal Window Grid */}
              <div className="terminal-containers-wrapper" style={{ height: '100%' }}>
                <div className="snippets-sidebar-layout">
                  <div style={{ flex: 1, height: '100%', position: 'relative' }}>
                    {tabs.map(tab => (
                      <div 
                        key={tab.id}
                        className="terminal-container-wrapper"
                        style={{ 
                          position: 'absolute', 
                          left: tab.id === activeTabId ? '0' : '-9999px',
                          top: '0',
                          width: '100%', 
                          height: '100%',
                          visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                          opacity: tab.id === activeTabId ? 1 : 0
                        }}
                      >
                        <div 
                          ref={el => containerRefs.current[tab.id] = el}
                          className="terminal-container"
                          style={{ width: '100%', height: '100%' }}
                        />
                        
                        {/* Floating Search Bar */}
                        {showSearch[tab.id] && (
                          <div 
                            className="terminal-search-bar glass"
                            style={{
                              position: 'absolute',
                              top: '16px',
                              right: showSnippetsPanel ? '290px' : '130px',
                              background: 'rgba(16, 18, 26, 0.95)',
                              border: '1px solid var(--border-glow)',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              zIndex: 300,
                              boxShadow: '0 10px 30px rgba(0, 229, 255, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              animation: 'slide-down-search 0.15s ease-out'
                            }}
                          >
                            <Search size={12} color="var(--color-primary)" />
                            <input
                              id={`search-input-${tab.id}`}
                              type="text"
                              value={searchQuery}
                              onChange={(e) => handleSearchChange(tab.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSearchNext(tab.id, e.shiftKey);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setShowSearch(prev => ({ ...prev, [tab.id]: false }));
                                  const term = terminalRefs.current[tab.id];
                                  if (term) term.focus();
                                }
                              }}
                              placeholder="搜索终端内容... (Enter下一个, Shift+Enter上一个)"
                              className="sftp-path-input"
                              style={{ fontSize: '11.5px', padding: '4px 8px', width: '220px', height: '24px' }}
                            />
                            <button 
                              className="sftp-nav-btn"
                              style={{ width: '24px', height: '24px', padding: 0 }}
                              onClick={() => handleSearchNext(tab.id, true)}
                              title="上一个 (Shift+Enter)"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button 
                              className="sftp-nav-btn"
                              style={{ width: '24px', height: '24px', padding: 0 }}
                              onClick={() => handleSearchNext(tab.id, false)}
                              title="下一个 (Enter)"
                            >
                              <ChevronDown size={12} />
                            </button>
                            <button 
                              className="sftp-nav-btn"
                              style={{ width: '24px', height: '24px', padding: 0, color: 'var(--color-danger)' }}
                              onClick={() => {
                                setShowSearch(prev => ({ ...prev, [tab.id]: false }));
                                const term = terminalRefs.current[tab.id];
                                if (term) term.focus();
                              }}
                              title="关闭 (Esc)"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                        
                        {/* Floating Autocomplete Suggestions Dropdown Panel */}
                        {terminalSuggestions.length > 0 && terminalSuggestionCoords.sessionId === tab.id && (() => {
                          const termInstance = terminalRefs.current[tab.id];
                          const totalRows = termInstance ? termInstance.rows : 24;
                          const showAbove = terminalSuggestionCoords.y > totalRows - 7;
                          
                          return (
                            <div 
                              className="terminal-suggestions-dropdown glass"
                              style={{
                                position: 'absolute',
                                left: `${terminalSuggestionCoords.x * 7.8 + 8}px`,
                                ...(showAbove ? {
                                  bottom: `${(totalRows - terminalSuggestionCoords.y) * 17 + 4}px`,
                                  top: 'auto'
                                } : {
                                  top: `${terminalSuggestionCoords.y * 17 + 22}px`,
                                  bottom: 'auto'
                                }),
                                background: 'rgba(16, 18, 26, 0.96)',
                                border: '1px solid var(--border-glow)',
                                borderRadius: '8px',
                                padding: '4px',
                                zIndex: 200,
                                boxShadow: '0 10px 30px rgba(0, 229, 255, 0.2)',
                                minWidth: '220px',
                                maxWidth: '400px',
                                pointerEvents: 'auto'
                              }}
                            >
                              {terminalSuggestions.map((match, idx) => {
                                const isSelected = idx === selectedTerminalSuggestionIndex;
                                return (
                                  <div
                                    key={match}
                                    className={`suggestion-item ${isSelected ? 'active' : ''}`}
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // Prevent terminal input from losing focus (blur)
                                      const screenText = getTypedTextFromScreen(tab.id);
                                      const typed = screenText || sessionBuffers.current[tab.id] || '';
                                      if (match.startsWith(typed)) {
                                        const remaining = match.substring(typed.length);
                                        window.api.ssh.write(tab.id, remaining);
                                        sessionBuffers.current[tab.id] = match;
                                      }
                                      setTerminalSuggestions([]);
                                      suggestionsRef.current = [];
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '6px 10px',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontFamily: 'var(--font-mono)',
                                      background: isSelected ? 'var(--color-primary-glow)' : 'transparent',
                                      color: isSelected ? 'var(--color-primary)' : 'var(--text-light)',
                                      gap: '12px'
                                    }}
                                  >
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{match}</span>
                                    {isSelected && (
                                      <span style={{ fontSize: '9px', opacity: 0.7, background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '2px' }}>Enter 补全</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                    
                    {/* Floating Toggle Button for Snippets Sidebar Drawer */}
                    {activeTabId !== 'hosts-dashboard' && (
                      <button 
                        className="snippets-panel-toggle-btn"
                        onClick={() => setShowSnippetsPanel(!showSnippetsPanel)}
                      >
                        <Activity size={12} />
                        <span>{showSnippetsPanel ? '隐藏快捷命令' : '快捷命令'}</span>
                      </button>
                    )}
                  </div>

                  {/* Snippets drawer panel */}
                  {showSnippetsPanel && activeTabId !== 'hosts-dashboard' && (
                    <div className="snippets-drawer-panel">
                      <div className="snippets-panel-header">
                        <span>⚡ 快捷命令面板</span>
                        <button 
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} 
                          onClick={() => setShowSnippetsPanel(false)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      
                      <div className="snippets-list-scroll">
                        {snippets.map(snip => (
                          <div key={snip.id} style={{ position: 'relative' }}>
                            <button 
                              className="snippet-card-btn"
                              onClick={() => executeSnippet(snip.cmd, snip.autoSend)}
                              title="点击向当前终端发送指令"
                            >
                              <span className="snippet-card-name">{snip.name}</span>
                              <span className="snippet-card-cmd">{snip.cmd}</span>
                            </button>
                            <button 
                              className="snippet-delete-x"
                              onClick={(e) => deleteSnippet(snip.id, e)}
                              title="删除此快捷指令"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      <div className="snippet-add-form">
                        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>➕ 添加自定义指令</span>
                        <input 
                          type="text" 
                          placeholder="指令别名" 
                          value={newSnippetName}
                          onChange={(e) => setNewSnippetName(e.target.value)}
                          className="sftp-path-input"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                        />
                        <input 
                          type="text" 
                          placeholder="具体命令" 
                          value={newSnippetCmd}
                          onChange={(e) => setNewSnippetCmd(e.target.value)}
                          className="sftp-path-input"
                          style={{ fontSize: '11px', padding: '4px 8px', fontFamily: 'var(--font-mono)' }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', margin: '2px 0' }}>
                          <input 
                            type="checkbox" 
                            checked={newSnippetAutoSend}
                            onChange={(e) => setNewSnippetAutoSend(e.target.checked)}
                          />
                          <span>回车自动执行</span>
                        </label>
                        <button 
                          className="btn-primary" 
                          style={{ fontSize: '11.5px', padding: '6px', width: '100%', cursor: 'pointer' }}
                          onClick={() => {
                            if (!newSnippetName || !newSnippetCmd) return;
                            setSnippets(prev => [...prev, {
                              id: `snip-${Date.now()}`,
                              name: newSnippetName,
                              cmd: newSnippetCmd,
                              autoSend: newSnippetAutoSend
                            }]);
                            setNewSnippetName('');
                            setNewSnippetCmd('');
                          }}
                        >
                          保存指令
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right collapsible Drawer (SFTP Browser Only) */}
            <aside 
              className={`right-drawer-panel ${showRightDrawer ? 'open' : 'collapsed'}`}
              style={{ width: showRightDrawer ? `${sftpDrawerWidth}px` : '34px', transition: 'width 0.2s ease-out' }}
            >
              {showRightDrawer && (
                <div 
                  className="sftp-drawer-resizer-h" 
                  onMouseDown={handleDrawerResizeMouseDown}
                />
              )}
              <button className="drawer-toggle-tab" onClick={() => setShowRightDrawer(!showRightDrawer)}>
                {showRightDrawer ? (
                  <>
                    <Compass size={14} style={{ marginRight: '6px' }} />
                    <span>收起文件管理器</span>
                  </>
                ) : (
                  <>
                    <Compass size={14} style={{ marginRight: '6px' }} />
                    <span>展开文件管理器 (SFTP)</span>
                  </>
                )}
              </button>

              {showRightDrawer && (
                <div className="drawer-inner-box">
                  <div className="drawer-tab-headers">
                    <div className="drawer-tab-btn active">
                      <Folder size={12} style={{ marginRight: '4px' }} />
                      文件管理器 (SFTP)
                    </div>
                  </div>

                  <div className="drawer-tab-content-wrapper">
                    <div className="sftp-panel-view">
                      {!activeTabId || !tabs.find(t => t.id === activeTabId)?.connected ? (
                        <div className="drawer-offline-placeholder">
                          <AlertCircle size={20} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
                          <span>无活跃的 SSH 连接</span>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            连接服务器后将自动挂载 SFTP 远程文件树
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="sftp-dual-explorer-layout">
                            {/* Local Files Panel */}
                            <div 
                              className="sftp-explorer-column"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const remoteFilePath = e.dataTransfer.getData('rshell/remote-path');
                                if (remoteFilePath) {
                                  triggerDownload(remoteFilePath);
                                }
                              }}
                            >
                              <div className="sftp-column-header">
                                <Monitor size={12} />
                                <span>💻 本地文件系统</span>
                              </div>
                              
                              <div className="sftp-explorer-breadcrumbs-bar">
                                <button className="sftp-nav-btn" onClick={() => handleLocalNavigate('..', true)} title="返回上级">
                                  <ArrowLeftRight size={12} style={{ transform: 'rotate(-90deg)' }} />
                                </button>
                                <input 
                                  type="text"
                                  value={localPathInput}
                                  onChange={(e) => setLocalPathInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') loadLocalFiles(localPathInput); }}
                                  className="sftp-path-input"
                                  placeholder="本地路径..."
                                />
                              </div>
                              
                              <div className="sftp-items-grid-scroll">
                                {localLoading ? (
                                  <div className="sftp-loading-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 0', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={14} className="spin" />
                                    <span style={{ fontSize: '12px' }}>读取本地目录...</span>
                                  </div>
                                ) : localFiles.length === 0 ? (
                                  <div className="sftp-empty-hint">目录为空</div>
                                ) : (
                                  localFiles.map(file => {
                                    const isSelected = selectedLocalPath === `${localPath}/${file.name}`;
                                    return (
                                      <div 
                                        key={file.name}
                                        className={`sftp-item-row-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => setSelectedLocalPath(`${localPath}/${file.name}`)}
                                        onDoubleClick={() => file.isDirectory ? handleLocalNavigate(file.name, true) : triggerUpload(`${localPath}/${file.name}`)}
                                        draggable={!file.isDirectory}
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData('text/plain', `${localPath}/${file.name}`);
                                          e.dataTransfer.setData('rshell/local-path', `${localPath}/${file.name}`);
                                        }}
                                      >
                                        <div className="sftp-item-left">
                                          {file.isDirectory ? (
                                            <Folder size={12} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                                          ) : (
                                            <File size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                          )}
                                          <span className="sftp-item-name-text">{file.name}</span>
                                        </div>
                                        <div className="sftp-item-right">
                                          <span className="sftp-item-size-text">{file.isDirectory ? '-' : formatBytes(file.size)}</span>
                                          {!file.isDirectory && (
                                            <button 
                                              className="sftp-item-action-trigger"
                                              onClick={(e) => { e.stopPropagation(); triggerUpload(`${localPath}/${file.name}`); }}
                                              title="上传此文件 ->"
                                            >
                                              <UploadCloud size={10} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Remote Files Panel */}
                            <div 
                              className="sftp-explorer-column"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const localFilePath = e.dataTransfer.getData('rshell/local-path');
                                if (localFilePath) {
                                  triggerUpload(localFilePath);
                                }
                              }}
                            >
                              <div className="sftp-column-header">
                                <Compass size={12} />
                                <span>🌍 远程主机 SFTP</span>
                              </div>
                              
                              <div className="sftp-explorer-breadcrumbs-bar">
                                <button className="sftp-nav-btn" onClick={() => handleSftpNavigate('..', 'd')} title="返回上级">
                                  <ArrowLeftRight size={12} style={{ transform: 'rotate(-90deg)' }} />
                                </button>
                                <input 
                                  type="text"
                                  value={sftpPathInput}
                                  onChange={(e) => setSftpPathInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSftpPathSubmit(e); }}
                                  className="sftp-path-input"
                                  placeholder="远程绝对路径..."
                                />
                                <button className="sftp-nav-btn" onClick={() => loadSftp(activeTabId, sftpPath)} title="刷新">
                                  <RefreshCw size={11} className={sftpLoading ? 'spin' : ''} />
                                </button>
                                <button className="sftp-nav-btn" onClick={sftpCreateFolder} title="新建远程文件夹">
                                  <FolderPlus size={11} />
                                </button>
                              </div>
                              
                              <div className="sftp-items-grid-scroll">
                                {sftpLoading ? (
                                  <div className="sftp-loading-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 0', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={14} className="spin" />
                                    <span style={{ fontSize: '12px' }}>读取远程目录...</span>
                                  </div>
                                ) : sftpError ? (
                                  <div className="sftp-empty-hint" style={{ color: 'var(--color-danger)' }}>{sftpError}</div>
                                ) : sftpFiles.length === 0 ? (
                                  <div className="sftp-empty-hint">目录为空</div>
                                ) : (
                                  sftpFiles.map(file => {
                                    const fullRemote = sftpPath.endsWith('/') ? `${sftpPath}${file.name}` : `${sftpPath}/${file.name}`;
                                    const isSelected = selectedRemotePath === fullRemote;
                                    return (
                                      <div 
                                        key={file.name}
                                        className={`sftp-item-row-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => setSelectedRemotePath(fullRemote)}
                                        onDoubleClick={() => file.type === 'd' ? handleSftpNavigate(file.name, 'd') : triggerDownload(fullRemote)}
                                        draggable={file.type !== 'd'}
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData('text/plain', fullRemote);
                                          e.dataTransfer.setData('rshell/remote-path', fullRemote);
                                        }}
                                      >
                                        <div className="sftp-item-left">
                                          {file.type === 'd' ? (
                                            <Folder size={12} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                                          ) : (
                                            <File size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                          )}
                                          <span className="sftp-item-name-text">{file.name}</span>
                                        </div>
                                        <div className="sftp-item-right">
                                          <span className="sftp-item-size-text">{file.type === 'd' ? '-' : formatBytes(file.size)}</span>
                                          {file.type !== 'd' && (
                                            <button 
                                              className="sftp-item-action-trigger"
                                              onClick={(e) => { e.stopPropagation(); triggerDownload(fullRemote); }}
                                              title="下载此文件 <-"
                                            >
                                              <DownloadCloud size={10} />
                                            </button>
                                          )}
                                          <button 
                                            className="sftp-item-action-trigger"
                                            style={{ color: 'var(--color-danger)' }}
                                            onClick={(e) => { e.stopPropagation(); sftpDelete(file.name, file.type); }}
                                            title="删除"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>

                          {/* SFTP Transfers Status */}
                          {sftpTransfers.length > 0 && (
                            <div className="sftp-transfers-panel" style={{ height: `${sftpQueueHeight}px`, position: 'relative' }}>
                              {/* Drag handle for resizing queue panel */}
                              <div 
                                className="sftp-queue-resizer" 
                                onMouseDown={handleQueueResizeMouseDown}
                              />
                              
                              <div className="transfers-header">
                                <span>文件传输队列 ({sftpTransfers.filter(t => t.status === 'running' || t.status === 'pending').length})</span>
                                <button className="text-btn" onClick={() => setSftpTransfers(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'cancelled'))}>清除已完成</button>
                              </div>
                              <div className="transfers-list">
                                {sftpTransfers.map(t => (
                                  <div key={t.id} className="transfer-item">
                                    <div className="transfer-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                                        <span className="transfer-name" title={t.filename}>{t.filename}</span>
                                        <span className="transfer-badge" style={{ 
                                          background: t.type === 'upload' ? '#39ff141a' : '#00e5ff1a', 
                                          color: t.type === 'upload' ? '#39ff14' : '#00e5ff',
                                          fontSize: '9px', padding: '1px 4px', borderRadius: '4px'
                                        }}>{t.type === 'upload' ? 'UPL' : 'DWN'}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {t.status === 'running' && (
                                          <button className="transfer-action-btn" onClick={() => handlePauseResumeTransfer(t)} title="暂停">
                                            <Pause size={10} />
                                          </button>
                                        )}
                                        {t.status === 'paused' && (
                                          <button className="transfer-action-btn" onClick={() => handlePauseResumeTransfer(t)} title="继续">
                                            <Play size={10} />
                                          </button>
                                        )}
                                        {(t.status === 'running' || t.status === 'pending' || t.status === 'paused') && (
                                          <button className="transfer-action-btn text-danger" onClick={() => handleCancelTransfer(t)} title="取消">
                                            <Trash2 size={10} />
                                          </button>
                                        )}
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                          {t.status === 'running' ? `${Math.round(t.progress || 0)}%` : 
                                           t.status === 'paused' ? '已暂停' : 
                                           t.status === 'cancelled' ? '已取消' : t.status}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="transfer-progress-bar">
                                      <div style={{ width: `${t.progress || 0}%`, background: t.status === 'error' ? 'var(--color-danger)' : t.status === 'paused' ? 'var(--color-warning)' : 'var(--color-primary)' }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>

      </div>

      {/* Custom Context Menu Overlay */}
      {contextMenu && (
        <div 
          className="rshell-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            className={`rshell-context-menu-item ${contextMenu.hasSelection ? '' : 'disabled'}`}
            onClick={() => {
              const term = terminalRefs.current[contextMenu.sessionId];
              if (term && term.hasSelection()) {
                navigator.clipboard.writeText(term.getSelection());
              }
              setContextMenu(null);
              if (term) term.focus();
            }}
          >
            <Copy size={12} /> <span>复制选中</span>
          </div>
          <div 
            className="rshell-context-menu-item"
            onClick={() => handleContextPaste(contextMenu.sessionId)}
          >
            <Send size={12} /> <span>粘贴文本</span>
          </div>
          <div className="rshell-context-menu-separator" />
          <div 
            className="rshell-context-menu-item"
            onClick={() => {
              const term = terminalRefs.current[contextMenu.sessionId];
              if (term) {
                term.clear();
                term.focus();
              }
              setContextMenu(null);
            }}
          >
            <Trash2 size={12} /> <span>清空屏幕</span>
          </div>
          <div 
            className="rshell-context-menu-item"
            onClick={() => {
              const tab = tabs.find(t => t.id === contextMenu.sessionId);
              if (tab && tab.hostConfig) {
                reconnectTab(tab); // wait, let's fall back if reconnectTab doesn't exist, we can duplicateSession/disconnect/connect
              }
              const term = terminalRefs.current[contextMenu.sessionId];
              if (term) term.focus();
              setContextMenu(null);
            }}
          >
            <RefreshCw size={12} /> <span>重新连接</span>
          </div>
          <div className="rshell-context-menu-separator" />
          <div className="rshell-context-menu-item" onClick={() => { handleZoomTerminal(1.5); const term = terminalRefs.current[contextMenu.sessionId]; if (term) term.focus(); setContextMenu(null); }}>
            <Plus size={12} /> <span>放大字号</span>
          </div>
          <div className="rshell-context-menu-item" onClick={() => { handleZoomTerminal(-1.5); const term = terminalRefs.current[contextMenu.sessionId]; if (term) term.focus(); setContextMenu(null); }}>
            <X size={12} /> <span>缩小字号</span>
          </div>
        </div>
      )}

      {/* Directory Space Details Modal */}
      {detailsModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onMouseDown={() => setDetailsModalOpen(false)}>
          <div 
            className="host-editor-modal glass" 
            style={{ maxWidth: '640px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking modal content
          >
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={18} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: '15px' }}>当前目录空间分析详情</h3>
              </div>
              <button className="icon-btn" onClick={() => setDetailsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border-color)', fontSize: '11.5px', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={detailsModalCwd}>
              路径: {detailsModalCwd} (大小: <span style={{ color: 'var(--color-primary)', fontWeight: '600' }}>{detailsModalTotalSize}</span>)
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {detailsModalLoading ? (
                <div className="sftp-loading-state" style={{ height: '200px' }}>
                  <RefreshCw size={24} className="spin" />
                  <span>正在深度扫描子目录大小...</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>(对于大文件夹扫描可能需要几秒钟，请耐心等待)</span>
                </div>
              ) : detailsModalItems.length === 0 ? (
                <div className="drawer-offline-placeholder" style={{ height: '200px' }}>
                  <AlertCircle size={24} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
                  <span>目录为空或扫描无结果</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {detailsModalItems.map((item, idx) => {
                    const itemBytes = sizeToBytes(item.size);
                    const totalBytes = sizeToBytes(detailsModalTotalSize);
                    const pct = totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((itemBytes / totalBytes) * 100))) : 0;
                    
                    return (
                      <div key={item.path + idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }} title={item.path}>
                            {item.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>{pct}%</span>
                            <span className="widget-value-tag text-primary" style={{ minWidth: '55px', textAlign: 'right' }}>{item.size}</span>
                          </div>
                        </div>
                        <div className="linear-gauge-track" style={{ height: '5px' }}>
                          <div 
                            className="linear-gauge-fill" 
                            style={{ 
                              width: `${pct}%`,
                              background: pct > 75 ? 'var(--color-danger)' : pct > 35 ? 'var(--color-warning)' : 'var(--color-primary)'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button 
                className="action-btn" 
                style={{ 
                  padding: '6px 16px', 
                  fontSize: '12px', 
                  borderRadius: '4px', 
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-light)',
                  cursor: 'pointer'
                }}
                onClick={() => setDetailsModalOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Config Editor Dialog (Termius style) */}
      {showHostEditor && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="host-editor-modal glass">
            <div className="modal-header">
              <h3>{editingHost ? '编辑主机配置' : '新建主机配置'}</h3>
              <button className="icon-btn" onClick={closeHostEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveHost} className="host-editor-form">
              <div className="form-group-row">
                <div className="form-field">
                  <label>主机别名</label>
                  <input type="text" placeholder="例如: 生产K8s主节点" value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>分组标签</label>
                  <select value={formGroup} onChange={e => setFormGroup(e.target.value)}>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group-row">
                <div className="form-field flex-3">
                  <label>主机 IP / 域名 *</label>
                  <input type="text" required placeholder="192.168.1.50" value={formHost} onChange={e => setFormHost(e.target.value)} />
                </div>
                <div className="form-field flex-1">
                  <label>端口 *</label>
                  <input type="number" required placeholder="22" value={formPort} onChange={e => setFormPort(e.target.value)} />
                </div>
              </div>

              <div className="form-field">
                <label>用户名 *</label>
                <input type="text" required placeholder="root" value={formUsername} onChange={e => setFormUsername(e.target.value)} />
              </div>

              <div className="form-field">
                <label>身份校验方式</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" checked={formAuthType === 'password'} onChange={() => setFormAuthType('password')} />
                    <span>密码认证</span>
                  </label>
                  <label className="radio-label">
                    <input type="radio" checked={formAuthType === 'key'} onChange={() => setFormAuthType('key')} />
                    <span>SSH 私钥认证</span>
                  </label>
                </div>
              </div>

              {formAuthType === 'password' ? (
                <>
                  <div className="form-field">
                    <label>关联密码凭据</label>
                    <select 
                      value={formCredentialId} 
                      onChange={e => {
                        const credId = e.target.value;
                        setFormCredentialId(credId);
                        if (credId !== 'manually') {
                          const matched = sshCredentials.find(c => c.id === credId);
                          if (matched) {
                            setFormUsername(matched.username);
                          }
                        }
                      }}
                    >
                      <option value="manually">手动输入用户名和密码</option>
                      {sshCredentials.map(cred => (
                        <option key={cred.id} value={cred.id}>{cred.name} ({cred.username})</option>
                      ))}
                    </select>
                  </div>

                  {formCredentialId === 'manually' ? (
                    <div className="form-field relative">
                      <label>登录密码</label>
                      <div className="password-input-wrapper">
                        <input 
                          type={showPassword ? 'text' : 'password'} 
                          placeholder="连接密码" 
                          value={formPassword} 
                          onChange={e => setFormPassword(e.target.value)} 
                        />
                        <button type="button" className="pwd-toggle" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'rgba(0, 229, 255, 0.05)', border: '1px solid rgba(0, 229, 255, 0.15)', borderRadius: '4px', padding: '8px 12px', marginTop: '6px', marginBottom: '12px' }}>
                      🔑 连接时将自动加载选中的密码凭据进行鉴权。
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-field">
                    <label>关联托管密钥</label>
                    <select value={formSshKeyId} onChange={e => setFormSshKeyId(e.target.value)}>
                      <option value="manually">手动指定本地文件路径</option>
                      {sshKeys.map(key => (
                        <option key={key.id} value={key.id}>{key.name} (🔑 托管密钥)</option>
                      ))}
                    </select>
                  </div>
                  
                  {formSshKeyId === 'manually' ? (
                    <>
                      <div className="form-field">
                        <label>私钥文件路径</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="点击选择文件或手动输入路径" 
                            value={formPrivateKeyPath} 
                            onChange={e => setFormPrivateKeyPath(e.target.value)} 
                            style={{ flex: 1 }}
                          />
                          <button type="button" className="btn-secondary" onClick={selectKeyPath}>选择文件</button>
                        </div>
                      </div>
                      <div className="form-field">
                        <label>私钥密码 ( passphrase，无则留空 )</label>
                        <input 
                          type="password" 
                          placeholder="私钥密码" 
                          value={formPassphrase} 
                          onChange={e => setFormPassphrase(e.target.value)} 
                        />
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'rgba(0, 229, 255, 0.05)', border: '1px solid rgba(0, 229, 255, 0.15)', borderRadius: '4px', padding: '8px 12px', marginTop: '6px' }}>
                      🔑 连接时将自动加载选中的托管密钥内容进行鉴权。如密钥包含密码，请在托管密钥设置中进行配置。
                    </div>
                  )}
                </>
              )}

              <div className="form-field">
                <label>跳板机 / 代理 (Bastion Tunnel)</label>
                <select value={formJumpHostId} onChange={e => setFormJumpHostId(e.target.value)}>
                  <option value="">直连 (无代理/无跳板机)</option>
                  {hosts.filter(h => h.id !== (editingHost?.id || '')).map(h => (
                    <option key={h.id} value={h.id}>{h.name} ({h.username}@{h.host}:{h.port})</option>
                  ))}
                </select>
              </div>

              <div className="modal-footer-btns">
                <button type="button" className="btn-secondary" onClick={closeHostEditor}>取消</button>
                <button type="submit" className="btn-primary">保存配置</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SSH Key Editor Dialog */}
      {showKeyEditor && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="host-editor-modal glass" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3>{editingKey ? '编辑托管私钥' : '新建托管私钥'}</h3>
              <button className="icon-btn" onClick={closeKeyEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveSshKey} className="host-editor-form">
              <div className="form-field">
                <label>密钥别名 / 名称 *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="例如: 生产K8s集群主密钥 / 腾讯云北京" 
                  value={formKeyName} 
                  onChange={e => setFormKeyName(e.target.value)} 
                />
              </div>

              <div className="form-field">
                <label>私钥 PEM 内容 (PrivateKey) *</label>
                <textarea 
                  required 
                  rows={10}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----" 
                  value={formKeyContent} 
                  onChange={e => setFormKeyContent(e.target.value)} 
                  style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '11px', 
                    background: 'rgba(0,0,0,0.2)', 
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-light)',
                    padding: '8px',
                    width: '100%',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div className="form-field">
                <label>私钥解密密码 ( passphrase，无则留空 )</label>
                <input 
                  type="password" 
                  placeholder="如私钥文件已加密，请输入解密密码" 
                  value={formKeyPassphrase} 
                  onChange={e => setFormKeyPassphrase(e.target.value)} 
                />
              </div>

              <div className="modal-footer-btns">
                <button type="button" className="btn-secondary" onClick={closeKeyEditor}>取消</button>
                <button type="submit" className="btn-primary">保存托管密钥</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Password Credentials Editor Dialog */}
      {showCredEditor && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="host-editor-modal glass" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{editingCred ? '编辑密码凭据' : '新建密码凭据'}</h3>
              <button className="icon-btn" onClick={closeCredEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveSshCredential} className="host-editor-form">
              <div className="form-field">
                <label>凭据备注名称 *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="例如: 大储集群常用密码 / 测试节点通用凭据" 
                  value={formCredName} 
                  onChange={e => setFormCredName(e.target.value)} 
                />
              </div>

              <div className="form-field">
                <label>登录用户名 (Username) *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="例如: root / ubuntu" 
                  value={formCredUsername} 
                  onChange={e => setFormCredUsername(e.target.value)} 
                />
              </div>

              <div className="form-field relative">
                <label>登录密码 (Password) *</label>
                <div className="password-input-wrapper">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required
                    placeholder="连接密码" 
                    value={formCredPassword} 
                    onChange={e => setFormCredPassword(e.target.value)} 
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="modal-footer-btns">
                <button type="button" className="btn-secondary" onClick={closeCredEditor}>取消</button>
                <button type="submit" className="btn-primary">保存凭据</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Component Styling */}
      <style>{`
        /* --- Customized RShell Elements --- */
        .rshell-context-menu {
          position: fixed;
          background: rgba(16, 18, 26, 0.95);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 229, 255, 0.15);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 229, 255, 0.1);
          border-radius: 8px;
          padding: 6px;
          min-width: 140px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: context-menu-fade 0.15s ease-out;
        }
        @keyframes context-menu-fade {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slide-down-search {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rshell-context-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px;
          border-radius: 4px;
          color: var(--text-light);
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .rshell-context-menu-item:hover:not(.disabled) {
          background: var(--color-primary-glow);
          color: var(--color-primary);
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.15);
        }
        .rshell-context-menu-item.disabled {
          opacity: 0.4;
          pointer-events: none;
        }
        .rshell-context-menu-separator {
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
          margin: 4px 0;
        }

        .snippets-sidebar-layout {
          display: flex;
          width: 100%;
          height: 100%;
          position: relative;
        }
        .snippets-panel-toggle-btn {
          position: absolute;
          right: 16px;
          top: 16px;
          background: rgba(0, 229, 255, 0.1);
          border: 1px solid var(--color-primary);
          color: var(--color-primary);
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 11.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
          z-index: 10;
        }
        .snippets-panel-toggle-btn:hover {
          background: var(--color-primary);
          color: #000;
          box-shadow: 0 0 12px var(--color-primary);
        }
        .snippets-drawer-panel {
          width: 260px;
          height: 100%;
          background: rgba(16, 18, 26, 0.95);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-left: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          animation: slide-in-snippets 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slide-in-snippets {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .snippets-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-light);
        }
        .snippets-list-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .snippet-card-btn {
          width: 100%;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }
        .snippet-card-btn:hover {
          background: rgba(0, 229, 255, 0.05);
          border-color: rgba(0, 229, 255, 0.3);
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.05);
        }
        .snippet-card-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-light);
          margin-bottom: 4px;
        }
        .snippet-card-cmd {
          font-size: 10.5px;
          font-family: var(--font-mono);
          color: var(--color-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          opacity: 0.8;
        }
        .snippet-delete-x {
          position: absolute;
          right: 6px;
          top: 6px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .snippet-card-btn:hover + .snippet-delete-x, .snippet-delete-x:hover {
          opacity: 1;
        }
        .snippet-add-form {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sftp-dual-explorer-layout {
          display: flex;
          flex: 1;
          gap: 12px;
          overflow: hidden;
          height: 100%;
          padding: 12px;
        }
        .sftp-explorer-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          overflow: hidden;
        }
        .sftp-column-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-light);
        }
        .sftp-explorer-breadcrumbs-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .sftp-nav-btn {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-light);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .sftp-nav-btn:hover {
          background: rgba(0, 229, 255, 0.1);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }
        .sftp-path-input {
          flex: 1;
          height: 24px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          padding: 0 8px;
          color: var(--text-light);
          font-size: 11px;
          font-family: var(--font-mono);
        }
        .sftp-path-input:focus {
          border-color: var(--color-primary);
          outline: none;
        }
        .sftp-items-grid-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sftp-item-row-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .sftp-item-row-card:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .sftp-item-row-card.selected {
          background: rgba(0, 229, 255, 0.08);
          border-left: 2px solid var(--color-primary);
        }
        .sftp-item-left {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 70%;
        }
        .sftp-item-name-text {
          font-size: 12px;
          color: var(--text-light);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sftp-item-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sftp-item-size-text {
          font-size: 10px;
          color: var(--text-muted);
          min-width: 45px;
          text-align: right;
        }
        .sftp-item-action-trigger {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.15s ease;
        }
        .sftp-item-action-trigger:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--color-primary);
        }
        .sftp-transfers-panel {
          border-top: 1px solid var(--border-color);
          background: rgba(16, 18, 26, 0.98);
          display: flex;
          flex-direction: column;
          min-height: 80px;
        }
        .sftp-queue-resizer {
          position: absolute;
          top: -3px;
          left: 0;
          right: 0;
          height: 6px;
          cursor: ns-resize;
          z-index: 100;
          background: transparent;
        }
        .sftp-queue-resizer:hover {
          background: var(--color-primary);
          box-shadow: 0 0 10px var(--color-primary);
        }
        .transfer-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 2px;
        }
        .transfer-action-btn:hover {
          color: var(--text-light);
          background: rgba(255, 255, 255, 0.05);
        }
        
        .sftp-drawer-resizer-h {
          position: absolute;
          left: -3px;
          top: 0;
          bottom: 0;
          width: 6px;
          cursor: ew-resize;
          z-index: 1000;
          background: transparent;
          transition: background 0.2s ease;
        }
        .sftp-drawer-resizer-h:hover, .sftp-drawer-resizer-h:active {
          background: var(--color-primary);
          box-shadow: 0 0 10px var(--color-primary);
        }

        .ssh-dashboard-container {
          display: flex;
          width: 100%;
          height: 100%;
          background: var(--bg-primary);
          overflow: hidden;
        }

        .app-workspace-split {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        /* ==========================================
           TAB HEADERS BAR (UNIFIED DESIGN)
           ========================================== */
        .tab-headers-bar {
          display: flex;
          background: rgba(12, 14, 21, 0.85);
          border-bottom: 1px solid var(--border-color);
          height: 36px;
          align-items: center;
          padding: 0 6px;
          flex-shrink: 0;
          user-select: none;
        }
        .sidebar-toggle-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          margin-right: 4px;
          transition: all 0.2s;
        }
        .sidebar-toggle-btn:hover:not(:disabled), .sidebar-toggle-btn.active:not(:disabled) {
          color: var(--color-primary);
          background: rgba(255, 255, 255, 0.04);
        }
        .sidebar-toggle-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        .tabs-list-wrapper {
          flex: 1;
          display: flex;
          height: 100%;
          overflow-x: auto;
        }

        /* Standard Tab design */
        .terminal-tab-header {
          display: flex;
          align-items: center;
          padding: 0 12px;
          height: 100%;
          border-right: 1px solid var(--border-color);
          color: var(--text-muted);
          font-size: 11.5px;
          cursor: pointer;
          max-width: 160px;
          min-width: 95px;
          flex-shrink: 0;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .tab-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          margin-left: 6px;
        }

        .tab-icon {
          flex-shrink: 0;
        }
        .terminal-tab-header:hover {
          background: rgba(255, 255, 255, 0.02);
          color: #fff;
        }
        .terminal-tab-header.active {
          background: #090a0f;
          color: #fff;
          font-weight: 600;
          border-top: 2px solid var(--color-primary);
        }
        
        /* Persistent Dashboard Tab style */
        .terminal-tab-header.dashboard-tab {
          border-right: 1px solid var(--border-color);
          font-weight: 600;
        }
        .terminal-tab-header.dashboard-tab.active {
          border-top-color: var(--color-primary);
          background: rgba(16, 18, 26, 0.45);
        }

        .tab-close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          margin-left: 6px;
          border-radius: 2px;
          padding: 1px;
          display: flex;
          align-items: center;
        }
        .tab-close-btn:hover {
          background: rgba(255, 56, 96, 0.15);
          color: var(--color-danger);
        }

        .tab-duplicate-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          margin-left: 6px;
          border-radius: 2px;
          padding: 1.5px;
          display: flex;
          align-items: center;
        }
        .tab-duplicate-btn:hover {
          background: rgba(0, 229, 255, 0.15);
          color: var(--color-primary);
        }

        .tabs-quick-connect-inline {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 8px;
        }
        .tab-quick-input {
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 10.5px;
          color: #fff;
          font-family: var(--font-mono);
          width: 160px;
        }
        .tab-quick-input:focus {
          border-color: var(--color-primary);
          outline: none;
        }
        .tab-quick-add-btn {
          background: var(--color-primary-glow);
          border: 1px solid var(--border-glow);
          border-radius: 4px;
          color: var(--color-primary);
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .tab-quick-add-btn:hover {
          background: var(--color-primary);
          color: #000;
        }

        /* ==========================================
           VIEWPORT 1: FULL SCREEN CARD GRID DASHBOARD
           ========================================== */
        .hosts-grid-dashboard-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
          height: calc(100% - 36px);
          padding: 30px 40px;
          box-sizing: border-box;
          background-image: 
            radial-gradient(at 0% 0%, rgba(0, 229, 255, 0.03) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(99, 102, 241, 0.02) 0px, transparent 50%),
            radial-gradient(at 50% 50%, var(--bg-primary) 0px, #07080c 100%);
          overflow: hidden;
        }

        .hosts-dashboard-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-shrink: 0;
        }
        .dashboard-title-box h2 {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin: 0;
        }
        .dashboard-subtitle-box {
          font-size: 11px;
          color: var(--text-muted);
          display: block;
          margin-top: 4px;
        }

        .quick-dial-box {
          display: flex;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 4px 6px;
          width: 320px;
          align-items: center;
        }
        .quick-dial-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #fff;
          font-size: 11.5px;
          font-family: var(--font-mono);
          padding: 4px 8px;
        }
        .quick-dial-btn {
          background: var(--color-primary-glow);
          border: 1px solid var(--border-glow);
          border-radius: 6px;
          color: var(--color-primary);
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }
        .quick-dial-btn:hover {
          background: var(--color-primary);
          color: #000;
        }

        .hosts-dashboard-filter-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 12px;
          margin-bottom: 16px;
          flex-shrink: 0;
        }
        .filter-group-pills {
          display: flex;
          gap: 6px;
        }
        .filter-pill {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-muted);
          padding: 4px 10px;
          font-size: 11.5px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        .filter-pill:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.02);
        }
        .filter-pill.active {
          background: var(--color-primary-glow);
          border-color: var(--border-glow);
          color: var(--color-primary);
        }

        .grid-search-wrapper {
          position: relative;
          width: 240px;
        }
        .grid-search-icon {
          position: absolute;
          left: 10px;
          top: 8px;
          color: var(--text-muted);
        }
        .grid-search-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: #fff;
          padding: 6px 10px 6px 28px;
          font-size: 11px;
          outline: none;
        }
        .grid-search-input:focus {
          border-color: var(--color-primary);
        }

        .hosts-dashboard-grid-scroll {
          flex: 1;
          overflow-y: auto;
          margin-bottom: 14px;
        }

        /* Responsive Grid layout for small block cards (Termius style) */
        .hosts-grid-layout {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
          align-content: start;
        }

        /* Mockup card shape matched exactly! */
        .grid-host-block-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 14px;
          position: relative;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .grid-host-block-card:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--border-glow);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }

        .grid-host-icon-wrapper {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }

        .grid-host-details {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .grid-host-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .grid-host-protocol {
          font-size: 10.5px;
          color: var(--text-muted);
          font-family: var(--font-mono);
          text-transform: lowercase;
        }
        .grid-host-ip {
          font-size: 10.5px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .grid-host-actions {
          position: absolute;
          right: 8px;
          top: 8px;
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s;
          background: rgba(16, 18, 26, 0.95);
          padding: 2px;
          border-radius: 6px;
        }
        .grid-host-block-card:hover .grid-host-actions {
          opacity: 1;
        }

        .hosts-grid-footer-tip {
          font-size: 11px;
          color: var(--text-muted);
          text-align: center;
          flex-shrink: 0;
        }

        /* ==========================================
           VIEWPORT 2: TERMINAL WORKSPACE LAYOUT
           ========================================== */
        .terminal-session-screen {
          display: flex;
          flex: 1;
          width: 100%;
          height: calc(100% - 36px);
          overflow: hidden;
        }

        .sidebar-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .live-badge-glow {
          font-size: 9px;
          font-weight: 600;
          color: var(--color-primary);
          background: rgba(0, 229, 255, 0.1);
          border: 1px solid var(--color-primary-glow);
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          box-shadow: 0 0 8px rgba(0, 229, 255, 0.2);
          white-space: nowrap;
        }

        /* Collapsible sidebar - strictly dedicated to active stats monitoring */
        .collapsible-left-sidebar {
          height: 100%;
          flex-shrink: 0;
          border-right: 1px solid var(--border-color);
          background: rgba(16, 18, 26, 0.65);
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }
        .collapsible-left-sidebar.open {
          width: 280px;
        }
        .collapsible-left-sidebar.collapsed {
          width: 0;
          border-right: none;
        }

        /* Main session section */
        .session-main-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #090a0f;
          overflow: hidden;
        }

        .terminal-containers-wrapper {
          flex: 1;
          height: 100%;
          min-height: 0;
          width: 100%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* ==========================================
           BOTTOM BROADCASTER BAR (Xshell style)
           ========================================== */
        .broadcaster-bar {
          background: rgba(16, 18, 26, 0.85);
          border-top: 1px solid var(--border-color);
          padding: 6px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .broadcaster-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 229, 255, 0.05);
          border: 1px solid var(--border-glow);
          padding: 5px;
          border-radius: 4px;
        }
        .broadcaster-input {
          flex: 1;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: #fff;
          padding: 5px 10px;
          font-size: 11.5px;
          font-family: var(--font-mono);
          outline: none;
        }
        .broadcaster-input:focus {
          border-color: var(--color-primary);
        }
        .broadcaster-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          color: var(--text-light);
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
        }
        .broadcaster-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .broadcaster-btn.broadcast {
          background: rgba(99, 102, 241, 0.12);
          border-color: rgba(99, 102, 241, 0.25);
          color: #a29bfe;
        }
        .broadcaster-btn.broadcast:hover {
          background: #6366f1;
          color: #fff;
        }

        /* Floating autocomplete list above the broadcaster input */
        .broadcaster-suggestions-dropdown {
          position: absolute;
          bottom: 100%;
          left: 45px;
          width: calc(100% - 240px);
          background: rgba(16, 18, 26, 0.96);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          margin-bottom: 8px;
          box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
          z-index: 100;
          max-height: 160px;
          overflow-y: auto;
          padding: 4px;
          backdrop-filter: blur(8px);
        }
        .suggestion-item {
          display: flex;
          align-items: center;
          padding: 6px 12px;
          color: var(--text-light);
          font-size: 11.5px;
          font-family: var(--font-mono);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .suggestion-item:hover, .suggestion-item.active {
          background: var(--color-primary-glow);
          color: var(--color-primary);
          text-shadow: 0 0 1px var(--color-primary-glow);
        }
        .suggestion-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ==========================================
           RIGHT DRAWER: SFTP Explorer Only
           ========================================== */
        .right-drawer-panel {
          display: flex;
          position: relative;
          background: rgba(16, 18, 26, 0.7);
          border-left: 1px solid var(--border-color);
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          height: 100%;
          flex-shrink: 0;
        }
        /* .right-drawer-panel.open width is now dynamic (controlled by React state inline style) */
        .right-drawer-panel.collapsed {
          width: 34px;
        }
        .drawer-toggle-tab {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 34px;
          background: rgba(12, 14, 21, 0.95);
          border: none;
          color: var(--text-muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 16px;
          cursor: pointer;
          outline: none;
          transition: all 0.2s;
        }
        .drawer-toggle-tab:hover {
          color: var(--color-primary);
        }
        .drawer-toggle-tab span {
          writing-mode: vertical-lr;
          text-orientation: mixed;
          margin-top: 8px;
          font-size: 11px;
          letter-spacing: 2px;
          font-weight: 600;
        }

        .drawer-inner-box {
          margin-left: 34px;
          width: calc(100% - 34px);
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .drawer-tab-headers {
          display: flex;
          background: rgba(0, 0, 0, 0.25);
          border-bottom: 1px solid var(--border-color);
          height: 35px;
        }
        .drawer-tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .drawer-tab-btn.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
          background: rgba(255, 255, 255, 0.01);
        }

        .drawer-tab-content-wrapper {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .drawer-offline-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          padding: 24px;
          text-align: center;
          font-size: 11px;
        }

        /* Tab content: SFTP panel view */
        .sftp-panel-view {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .sftp-toolbar {
          display: flex;
          padding: 6px;
          background: rgba(0, 0, 0, 0.15);
          border-bottom: 1px solid var(--border-color);
          gap: 4px;
        }
        .sftp-tool-btn {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: var(--text-light);
          padding: 3px 6px;
          cursor: pointer;
          font-size: 10.5px;
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .sftp-tool-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
        }
        .sftp-tool-btn.primary {
          background: var(--color-primary-glow);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        /* Editable Address input */
        .sftp-address-bar-form {
          display: flex;
          align-items: center;
          padding: 5px 6px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid var(--border-color);
          gap: 4px;
        }
        .sftp-address-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-light);
          font-size: 10.5px;
          font-family: var(--font-mono);
          outline: none;
          padding: 2px 4px;
        }
        .sftp-address-input:focus {
          color: #fff;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
        }

        .sftp-file-list-scroll {
          flex: 1;
          overflow-y: auto;
          background: rgba(9, 10, 15, 0.2);
        }
        .sftp-loading-state, .sftp-error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          color: var(--text-muted);
          font-size: 11px;
          gap: 6px;
        }
        .sftp-empty-state {
          text-align: center;
          padding: 20px;
          color: var(--text-muted);
          font-size: 11px;
        }

        .sftp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .sftp-table th {
          text-align: left;
          padding: 5px 8px;
          background: rgba(0, 0, 0, 0.25);
          border-bottom: 1px solid var(--border-color);
          color: var(--text-muted);
          font-weight: 600;
        }
        .sftp-table td {
          padding: 5px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.01);
          color: var(--text-light);
        }
        .sftp-row {
          cursor: pointer;
        }
        .sftp-row:hover {
          background: rgba(255, 255, 255, 0.015);
        }
        .file-name-cell {
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .truncate-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sftp-row-actions {
          display: flex;
          gap: 3px;
          justify-content: center;
          opacity: 0;
        }
        .sftp-row:hover .sftp-row-actions {
          opacity: 1;
        }
        .sftp-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 1.5px;
          border-radius: 2px;
        }
        .sftp-action-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.04);
        }
        .sftp-action-btn.delete:hover {
          color: var(--color-danger);
          background: rgba(255, 56, 96, 0.08);
        }

        /* SFTP transfers panel */
        .sftp-transfers-panel {
          height: 120px;
          border-top: 1px solid var(--border-color);
          background: rgba(12, 14, 21, 0.95);
          display: flex;
          flex-direction: column;
          font-size: 10px;
        }
        .transfers-header {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid var(--border-color);
          font-weight: 600;
          color: var(--text-light);
        }
        .transfers-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .transfer-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .transfer-item:last-child {
          margin-bottom: 8px;
        }
        .transfer-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .transfer-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
          color: #fff;
        }
        .transfer-badge {
          font-size: 8px;
          padding: 0.5px 3px;
          border-radius: 2px;
        }
        .transfer-progress-track {
          height: 3px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 1.5px;
          overflow: hidden;
        }
        .transfer-progress-fill {
          height: 100%;
        }
        .transfer-percent {
          text-align: right;
          color: var(--text-muted);
          font-size: 8px;
        }

        /* ==========================================
           TAB CONTENT: LEFT PANEL REAL-TIME MONITOR
           ========================================== */
        .monitor-widgets-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .monitor-widget-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 10px 12px;
          box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.15);
        }

        .widget-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .widget-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-light);
        }

        .widget-value-tag {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--color-primary);
          font-family: var(--font-mono);
        }
        .widget-value-tag.text-success { color: var(--color-success); }
        .widget-value-tag.text-accent { color: #a29bfe; }

        .widget-sub-values {
          font-size: 10px;
          color: var(--text-muted);
          font-family: var(--font-mono);
          margin-top: -4px;
          margin-bottom: 8px;
        }

        .widget-body-curve {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.02);
          border-radius: 6px;
          padding: 4px;
          height: 55px;
          overflow: hidden;
          margin-top: 4px;
        }

        .sparkline-svg {
          display: block;
        }

        /* Net Speedometers */
        .net-speeds-row {
          display: flex;
          gap: 10px;
          margin-top: 6px;
        }
        .speed-col {
          flex: 1;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.01);
          border-radius: 6px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .speed-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .speed-val {
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          font-family: var(--font-mono);
        }

        /* Load avg pills */
        .load-pills-row {
          display: flex;
          gap: 6px;
          margin-top: 6px;
        }
        .load-pill {
          flex: 1;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.01);
          border-radius: 4px;
          padding: 4px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .pill-name {
          font-size: 9px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .pill-val {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--color-warning);
          font-family: var(--font-mono);
        }

        /* Linear meters */
        .linear-gauge-track {
          height: 5px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 2.5px;
          overflow: hidden;
        }
        .linear-gauge-fill {
          height: 100%;
          border-radius: 2.5px;
          transition: width 0.4s ease;
        }

        /* ==========================================
           MODALS & FORMS
           ========================================== */
        .modal-backdrop {
          position: fixed;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .host-editor-modal {
          width: 500px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: rgba(0, 0, 0, 0.1);
        }
        .modal-header h3 {
          margin: 0;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
        }
        .host-editor-form {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .form-group-row {
          display: flex;
          gap: 12px;
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .form-field.flex-3 { flex: 3; }
        .form-field.flex-1 { flex: 1; }
        .form-field label {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .form-field input[type="text"],
        .form-field input[type="number"],
        .form-field input[type="password"],
        .form-field select {
          background: var(--bg-input);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 12.5px;
          color: #fff;
          outline: none;
          transition: border-color 0.2s;
        }
        .form-field input:focus, .form-field select:focus {
          border-color: var(--color-primary);
        }

        .radio-group {
          display: flex;
          gap: 16px;
          padding: 4px 0;
        }
        .radio-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-light);
          cursor: pointer;
        }
        .radio-label input {
          accent-color: var(--color-primary);
        }

        .password-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .password-input-wrapper input {
          width: 100%;
          padding-right: 36px !important;
        }
        .pwd-toggle {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }
        .pwd-toggle:hover {
          color: #fff;
        }

        .modal-footer-btns {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 12px;
        }
        .btn-primary {
          background: var(--color-primary);
          color: #000;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary:hover {
          background: #00e5ff;
          box-shadow: 0 0 10px var(--color-primary-glow);
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          color: var(--text-light);
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .icon-btn-primary {
          background: var(--color-primary-glow);
          border: 1px solid var(--border-glow);
          border-radius: 4px;
          color: var(--color-primary);
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .icon-btn-primary:hover {
          background: var(--color-primary);
          color: #000;
        }

        .action-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }
        .action-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }
        .action-btn.text-danger:hover {
          color: var(--color-danger);
          background: rgba(255, 56, 96, 0.1);
        }

        .text-btn {
          background: none;
          border: none;
          color: var(--color-primary);
          cursor: pointer;
          font-size: 11px;
          text-decoration: underline;
        }

        .spin {
          animation: spin-anim 1s linear infinite;
        }
        @keyframes spin-anim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Light Mode Styling Overrides */
        .light-theme .ssh-dashboard-container {
          background: #f1f3f7;
        }
        .light-theme .hosts-grid-dashboard-screen {
          background: #f1f3f7;
        }
        .light-theme .dashboard-title-box h2 {
          color: #000;
        }
        .light-theme .quick-dial-box {
          background: #fff;
        }
        .light-theme .quick-dial-input {
          color: #000;
        }
        .light-theme .filter-pill:hover {
          color: #000;
          background: rgba(0, 0, 0, 0.02);
        }
        .light-theme .filter-pill.active {
          background: var(--color-primary-glow);
          color: var(--color-primary);
        }
        .light-theme .grid-search-input {
          background: #fff;
          color: #000;
        }
        .light-theme .grid-host-block-card {
          background: #fff;
          box-shadow: 0 2px 10px rgba(0,0,0,0.04);
        }
        .light-theme .grid-host-block-card:hover {
          background: #fdfdfd;
          box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        }
        .light-theme .grid-host-title {
          color: #000;
        }
        .light-theme .collapsible-left-sidebar {
          background: #ffffff;
        }
        .light-theme .sidebar-section-header {
          color: #000;
        }
        .light-theme .session-main-pane {
          background: #fff;
        }
        .light-theme .tab-headers-bar {
          background: #eaecef;
        }
        .light-theme .terminal-tab-header.active {
          background: #fff;
          color: #000;
        }
        .light-theme .tab-quick-input {
          background: #fff;
          color: #000;
        }
        .light-theme .broadcaster-bar {
          background: #f4f6fa;
        }
        .light-theme .broadcaster-input {
          background: #fff;
          color: #000;
        }
        .light-theme .broadcaster-suggestions-dropdown {
          background: #fff;
          box-shadow: 0 -4px 15px rgba(0,0,0,0.06);
        }
        .light-theme .suggestion-item {
          color: #000;
        }
        .light-theme .right-drawer-panel {
          background: #fff;
        }
        .light-theme .drawer-toggle-tab {
          background: #eaecef;
        }
        .light-theme .drawer-tab-headers {
          background: #eaecef;
        }
        .light-theme .drawer-tab-btn.active {
          background: #fff;
        }
        .light-theme .sftp-toolbar {
          background: #f1f3f7;
        }
        .light-theme .sftp-address-bar-form {
          background: #fafafc;
        }
        .light-theme .sftp-address-input {
          color: #000;
        }
        .light-theme .sftp-table th {
          background: #f4f6fa;
          color: #5e6c84;
        }
        .light-theme .sftp-table td {
          color: #000;
        }
        .light-theme .sftp-row:hover {
          background: rgba(0, 0, 0, 0.02);
        }
        .light-theme .monitor-widget-card {
          background: #fff;
          box-shadow: 0 2px 10px rgba(0,0,0,0.04);
        }
        .light-theme .widget-header {
          color: #000;
        }
        .light-theme .widget-body-curve {
          background: rgba(0, 0, 0, 0.03);
          border-color: rgba(0, 0, 0, 0.05);
        }
        .light-theme .linear-gauge-track {
          background: rgba(0, 0, 0, 0.05);
        }
        .light-theme .host-editor-modal {
          background: #fff;
        }
        .light-theme .modal-header h3 {
          color: #000;
        }
        .light-theme .form-field input, .light-theme .form-field select {
          background: #fff;
          color: #000;
          border-color: rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </div>
  );
}
