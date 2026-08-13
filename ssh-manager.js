const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class SSHManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // id -> { client, stream, sftp, host, port, username, statsInterval, prevCpuTicks, prevNetBytes }
    this.activeStreams = new Map(); // transferKey -> { readStream, writeStream }
  }

  /**
   * Establish SSH Connection and open shell channel
   */
  connect(id, config, mainWindow) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let resolved = false;
      let jumpConn = null;

      // Prepare main connection options
      const connOptions = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3
      };

      // Only use local SSH agent if authType is explicitly key and no key contents/paths are provided
      if (config.authType === 'key' && !config.privateKey && !config.privateKeyPath && process.env.SSH_AUTH_SOCK) {
        connOptions.agent = process.env.SSH_AUTH_SOCK;
      }

      if (config.authType === 'key') {
        if (config.privateKey) {
          connOptions.privateKey = config.privateKey;
        } else if (config.privateKeyPath) {
          try {
            connOptions.privateKey = fs.readFileSync(config.privateKeyPath);
          } catch (readErr) {
            return reject(new Error(`无法读取私钥文件: ${readErr.message}`));
          }
        }
        if (config.passphrase) {
          connOptions.passphrase = config.passphrase;
        }
      } else {
        connOptions.password = config.password;
      }

      const setupMainClient = () => {
        conn.on('ready', () => {
          conn.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
            if (err) {
              conn.end();
              if (jumpConn) jumpConn.end();
              if (!resolved) {
                resolved = true;
                reject(err);
              }
              return;
            }

            // Register stream data events
            stream.on('data', (data) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ssh:data', {
                  sessionId: id,
                  data: data.toString('utf-8')
                });
              }
            });

            stream.on('close', () => {
              console.log(`[SSH] Stream closed for session ${id}`);
              this.disconnect(id);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ssh:status', {
                  sessionId: id,
                  status: 'disconnected'
                });
              }
            });

            const sessionObj = {
              client: conn,
              jumpClient: jumpConn,
              stream: stream,
              sftp: null,
              host: config.host,
              port: config.port || 22,
              username: config.username,
              statsInterval: null,
              prevCpuTicks: null,
              prevNetBytes: null
            };

            this.sessions.set(id, sessionObj);

            if (!resolved) {
              resolved = true;
              resolve({ success: true });
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ssh:status', {
                sessionId: id,
                status: 'connected',
                host: config.host,
                username: config.username
              });
            }

            // Resolve home directory using SFTP
            this.getSftp(id).then(sftp => {
              sftp.realpath('.', (err, resolvedPath) => {
                if (!err && resolvedPath && mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('sftp:home-directory', {
                    sessionId: id,
                    path: resolvedPath
                  });
                }
              });
            }).catch(e => console.warn('Failed to resolve SFTP home path:', e));

            // Start real-time CPU/Memory/Network statistics monitor (Every 2 seconds)
            this.startStatsMonitor(id, mainWindow);
          });
        });

        conn.on('error', (err) => {
          console.error(`[SSH] Connection error on session ${id}:`, err.message);
          if (!resolved) {
            resolved = true;
            reject(err);
          } else {
            // Stream error to frontend if already connected
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ssh:error', {
                sessionId: id,
                message: err.message
              });
            }
          }
          this.disconnect(id);
        });

        conn.on('close', () => {
          console.log(`[SSH] Connection closed for session ${id}`);
          this.disconnect(id);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ssh:status', {
              sessionId: id,
              status: 'disconnected'
            });
          }
        });

        console.log('[SSH CONNECT OPTIONS]', {
          host: connOptions.host,
          port: connOptions.port,
          username: connOptions.username,
          authType: config.authType,
          hasPassword: !!connOptions.password,
          hasAgent: !!connOptions.agent,
          agentPath: connOptions.agent
        });

        conn.connect(connOptions);
      };

      // Connect Jump Host Tunnel
      if (config.jumpHost) {
        jumpConn = new Client();
        
        jumpConn.on('ready', () => {
          console.log(`[SSH] Jump host ready for session ${id}. Requesting port forward to ${config.host}:${config.port || 22}...`);
          
          const startForwardTunnel = () => {
            jumpConn.forwardOut(
              '127.0.0.1', 0,
              config.host, config.port || 22,
              (err, stream) => {
                if (err) {
                  jumpConn.end();
                  if (!resolved) {
                    resolved = true;
                    reject(new Error(`跳板机端口转发失败: ${err.message}`));
                  }
                  return;
                }
                
                connOptions.sock = stream;
                setupMainClient();
              }
            );
          };

          // If SSH key authentication is selected but no local path/key is provided,
          // read the private key ~/.ssh/id_rsa directly from the jump host!
          if (config.authType === 'key' && !config.privateKeyPath && !config.privateKey) {
            console.log(`[SSH] Key auth requested but no local key provided. Reading remote ~/.ssh/id_rsa from jump host...`);
            jumpConn.exec('cat ~/.ssh/id_rsa', (err, keyStream) => {
              if (err) {
                jumpConn.end();
                return reject(new Error(`读取跳板机私钥失败: ${err.message}`));
              }
              let remoteKey = '';
              keyStream.on('data', (chunk) => {
                remoteKey += chunk.toString('utf-8');
              });
              keyStream.on('close', () => {
                const trimmedKey = remoteKey.trim();
                if (!trimmedKey || trimmedKey.includes('No such file') || trimmedKey.includes('Permission denied')) {
                  jumpConn.end();
                  return reject(new Error(`未提供本地私钥，且无法读取跳板机上的 ~/.ssh/id_rsa 文件`));
                }
                connOptions.privateKey = trimmedKey;
                startForwardTunnel();
              });
            });
          } else {
            startForwardTunnel();
          }
        });

        jumpConn.on('error', (err) => {
          console.error(`[SSH] Jump host connection error on session ${id}:`, err.message);
          if (!resolved) {
            resolved = true;
            reject(new Error(`跳板机连接失败: ${err.message}`));
          }
          this.disconnect(id);
        });

        jumpConn.on('close', () => {
          console.log(`[SSH] Jump host closed for session ${id}`);
          this.disconnect(id);
        });

        // Prepare jump connection options
        const jumpOptions = {
          host: config.jumpHost.host,
          port: config.jumpHost.port || 22,
          username: config.jumpHost.username,
          readyTimeout: 15000,
          keepaliveInterval: 10000,
          keepaliveCountMax: 3
        };

        // Only use local SSH agent if jumpHost authType is explicitly key and no keys are provided
        if (config.jumpHost.authType === 'key' && !config.jumpHost.privateKey && !config.jumpHost.privateKeyPath && process.env.SSH_AUTH_SOCK) {
          jumpOptions.agent = process.env.SSH_AUTH_SOCK;
        }

        if (config.jumpHost.authType === 'key') {
          if (config.jumpHost.privateKey) {
            jumpOptions.privateKey = config.jumpHost.privateKey;
          } else if (config.jumpHost.privateKeyPath) {
            try {
              jumpOptions.privateKey = fs.readFileSync(config.jumpHost.privateKeyPath);
            } catch (readErr) {
              return reject(new Error(`无法读取跳板机私钥文件: ${readErr.message}`));
            }
          }
          if (config.jumpHost.passphrase) {
            jumpOptions.passphrase = config.jumpHost.passphrase;
          }
        } else {
          jumpOptions.password = config.jumpHost.password;
        }

        jumpConn.connect(jumpOptions);
      } else {
        setupMainClient();
      }
    });
  }

  /**
   * Start Linux Stats Monitoring Command Exec Loop (Every 2 Seconds)
   */
  startStatsMonitor(id, mainWindow) {
    const session = this.sessions.get(id);
    if (!session || !session.client) return;

    const queryStats = () => {
      const activeSession = this.sessions.get(id);
      if (!activeSession || !activeSession.client) return;

      // Skip telemetry query if there was active user input in the last 4 seconds
      const now = Date.now();
      if (activeSession.lastActivity && (now - activeSession.lastActivity) < 4000) {
        return;
      }

      // Exec command returns: cpu ticks, meminfo, root df, loadavg, net dev traffic stats, and current working directory of interactive shell
      const cmd = 'cat /proc/stat && echo "---" && cat /proc/meminfo && echo "---" && df -h / && echo "---" && cat /proc/loadavg && echo "---" && cat /proc/net/dev && echo "---" && (my_ppid=$(ps -o ppid= -p $$); shell_pid=""; [ -n "$my_ppid" ] && shell_pid=$(ps -o pid=,comm= --ppid $my_ppid | grep -E "bash|zsh|sh|ash|csh|tcsh" | grep -v "$$" | awk \'{print $1}\' | head -n 1); [ -z "$shell_pid" -a -n "$my_ppid" ] && { sshd_main_pid=$(ps -o ppid= -p $my_ppid); if [ -n "$sshd_main_pid" -a "$sshd_main_pid" -ne 1 ]; then for sib in $(ps -o pid= --ppid $sshd_main_pid); do if [ "$sib" -ne "$my_ppid" ]; then p=$(ps -o pid=,comm= --ppid $sib | grep -E "bash|zsh|sh|ash|csh|tcsh" | awk \'{print $1}\' | head -n 1); if [ -n "$p" ]; then shell_pid=$p; break; fi; fi; done; fi; }; [ -z "$shell_pid" ] && shell_pid=$(ps -u $USER -o pid=,comm= | grep -E "bash|zsh|sh|ash|csh|tcsh" | awk \'{print $1}\' | head -n 1); [ -n "$shell_pid" ] && readlink -f /proc/$shell_pid/cwd 2>/dev/null || pwd)';
      
      activeSession.client.exec(cmd, (err, execStream) => {
        if (err) return;
        let dataBuffer = '';

        execStream.on('data', (d) => {
          dataBuffer += d.toString('utf-8');
        });

        execStream.on('close', () => {
          try {
            const stats = this.parseStatsOutput(dataBuffer, activeSession.prevCpuTicks, activeSession.prevNetBytes);
            if (stats) {
              activeSession.prevCpuTicks = stats.cpuTicks;
              activeSession.prevNetBytes = stats.currentNetBytes;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ssh:stats', {
                  sessionId: id,
                  stats: {
                    cpu: stats.cpu,
                    mem: stats.mem,
                    disk: stats.disk,
                    load: stats.load,
                    upSpeed: stats.upSpeed,
                    downSpeed: stats.downSpeed,
                    cwd: stats.cwd
                  }
                });
              }
            }
          } catch (parseErr) {
            // Silence parsing errors (for macOS/BSD hosts without procfs)
          }
        });
      });
    };

    // Run once initially, then poll every 2 seconds
    setTimeout(queryStats, 1000);
    session.statsInterval = setInterval(queryStats, 2000);
  }

  /**
   * Parse remote statistics: CPU active ratio, RAM used/total, Disk used/total, Load Avg, Upload/Download Speed
   */
  parseStatsOutput(output, prevTicks, prevNet) {
    const parts = output.split('---');
    if (parts.length < 5) return null;

    const procStat = parts[0].trim();
    const procMem = parts[1].trim();
    const dfOutput = parts[2].trim();
    const loadAvgOutput = parts[3].trim();
    const netDevOutput = parts[4].trim();
    const cwd = parts.length >= 6 ? parts[5].trim() : '';

    // 1. Parse CPU active ratio
    const cpuLines = procStat.split('\n');
    const cpuLine = cpuLines[0];
    const matchCpu = cpuLine.match(/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    let cpuPercent = 0;
    let currentTicks = null;

    if (matchCpu) {
      const user = parseInt(matchCpu[1]);
      const nice = parseInt(matchCpu[2]);
      const system = parseInt(matchCpu[3]);
      const idle = parseInt(matchCpu[4]);
      const iowait = parseInt(matchCpu[5]);
      const irq = parseInt(matchCpu[6]);
      const softirq = parseInt(matchCpu[7]);

      const active = user + nice + system + irq + softirq;
      const totalIdle = idle + iowait;
      const total = active + totalIdle;

      currentTicks = { active, total, idle: totalIdle };

      if (prevTicks) {
        const activeDiff = active - prevTicks.active;
        const totalDiff = total - prevTicks.total;
        if (totalDiff > 0) {
          cpuPercent = Math.min(100, Math.max(0, Math.round((activeDiff / totalDiff) * 100)));
        }
      } else {
        if (total > 0) {
          cpuPercent = Math.min(100, Math.max(0, Math.round((active / total) * 100)));
        }
      }
    }

    // 2. Parse RAM
    const matchTotal = procMem.match(/MemTotal:\s+(\d+)\s+kB/);
    const matchAvailable = procMem.match(/MemAvailable:\s+(\d+)\s+kB/);
    const matchFree = procMem.match(/MemFree:\s+(\d+)\s+kB/);

    let memPercent = 0;
    let memTotalBytes = 0;
    let memUsedBytes = 0;

    if (matchTotal) {
      const totalKB = parseInt(matchTotal[1]);
      const availableKB = matchAvailable ? parseInt(matchAvailable[1]) : (matchFree ? parseInt(matchFree[1]) : totalKB);
      const usedKB = totalKB - availableKB;

      memTotalBytes = totalKB * 1024;
      memUsedBytes = usedKB * 1024;
      memPercent = Math.min(100, Math.max(0, Math.round((usedKB / totalKB) * 100)));
    }

    // 3. Parse Disk (df root mount point)
    const dfLines = dfOutput.split('\n');
    let diskPercent = 0;
    let diskTotalStr = '';
    let diskUsedStr = '';

    for (let i = 1; i < dfLines.length; i++) {
      const line = dfLines[i].trim();
      const fields = line.split(/\s+/);
      if (fields.length >= 6 && fields[fields.length - 1] === '/') {
        const useStr = fields[fields.length - 2];
        diskPercent = parseInt(useStr.replace('%', '')) || 0;
        diskTotalStr = fields[1];
        diskUsedStr = fields[2];
        break;
      }
    }

    // 4. Parse Load Average
    const loadFields = loadAvgOutput.split(/\s+/);
    const load = [
      parseFloat(loadFields[0]) || 0,
      parseFloat(loadFields[1]) || 0,
      parseFloat(loadFields[2]) || 0
    ];

    // 5. Parse Network Traffic Speed (sum of all active interfaces, skipping lo loopback)
    const netLines = netDevOutput.split('\n');
    let totalRx = 0;
    let totalTx = 0;
    for (let i = 2; i < netLines.length; i++) {
      const line = netLines[i].trim();
      if (!line || line.startsWith('lo:')) continue;
      
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const fields = line.substring(colonIdx + 1).trim().split(/\s+/);
      if (fields.length >= 9) {
        totalRx += parseInt(fields[0]) || 0;  // Received bytes
        totalTx += parseInt(fields[8]) || 0;  // Transmitted bytes
      }
    }

    const now = Date.now();
    let downSpeed = 0; // Bytes/sec
    let upSpeed = 0;   // Bytes/sec
    if (prevNet) {
      const rxDiff = totalRx - prevNet.rx;
      const txDiff = totalTx - prevNet.tx;
      const timeDiffSec = (now - prevNet.time) / 1000;
      if (timeDiffSec > 0) {
        downSpeed = Math.round(rxDiff / timeDiffSec);
        upSpeed = Math.round(txDiff / timeDiffSec);
      }
    }

    const currentNetBytes = { rx: totalRx, tx: totalTx, time: now };

    return {
      cpu: cpuPercent,
      cpuTicks: currentTicks,
      mem: {
        percent: memPercent,
        total: memTotalBytes,
        used: memUsedBytes
      },
      disk: {
        percent: diskPercent,
        total: diskTotalStr,
        used: diskUsedStr
      },
      load,
      upSpeed,
      downSpeed,
      currentNetBytes,
      cwd
    };
  }

  /**
   * Write data to SSH shell stream (from frontend terminal input)
   */
  write(id, data) {
    const session = this.sessions.get(id);
    if (session && session.stream) {
      session.stream.write(data);
      return true;
    }
    return false;
  }

  /**
   * Resize terminal dimension
   */
  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (session && session.stream) {
      session.stream.setWindow(rows, cols, 0, 0);
      return true;
    }
    return false;
  }

  /**
   * Disconnect session and clean up
   */
  disconnect(id) {
    const session = this.sessions.get(id);
    if (session) {
      if (session.statsInterval) {
        clearInterval(session.statsInterval);
      }
      try {
        if (session.stream) session.stream.end();
      } catch (e) {}
      try {
        if (session.client) session.client.end();
      } catch (e) {}
      try {
        if (session.jumpClient) session.jumpClient.end();
      } catch (e) {}
      this.sessions.delete(id);
      console.log(`[SSH] Session ${id} cleaned up.`);
      return true;
    }
    return false;
  }

  /**
   * Record terminal user typing activity to suspend telemetry temporarily
   */
  notifyActivity(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Retrieve or initialize SFTP client for active SSH connection
   */
  getSftp(id) {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(id);
      if (!session) {
        return reject(new Error('SSH 链接不存在或已断开'));
      }

      if (session.sftp) {
        return resolve(session.sftp);
      }

      session.client.sftp((err, sftp) => {
        if (err) {
          return reject(err);
        }
        session.sftp = sftp;
        resolve(sftp);
      });
    });
  }

  /**
   * SFTP: List directories and files
   */
  async list(id, remotePath) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) return reject(err);

        // Map files to client format
        const items = list.map(item => {
          const isDir = (item.attrs.mode & 0o170000) === 0o040000;
          const isLink = (item.attrs.mode & 0o170000) === 0o120000;
          return {
            name: item.filename,
            size: item.attrs.size,
            mtime: item.attrs.mtime * 1000,
            type: isDir ? 'd' : (isLink ? 'l' : '-'),
            permissions: item.longname ? item.longname.split(' ')[0] : ''
          };
        });

        // Sort: directories first, then alphabetically
        items.sort((a, b) => {
          if (a.type === 'd' && b.type !== 'd') return -1;
          if (a.type !== 'd' && b.type === 'd') return 1;
          return a.name.localeCompare(b.name);
        });

        resolve(items);
      });
    });
  }

  /**
   * SFTP: Create directory
   */
  async mkdir(id, remotePath) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * SFTP: Delete file
   */
  async deleteFile(id, remotePath) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * SFTP: Delete directory (rmdir)
   */
  async rmdir(id, remotePath) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.rmdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * SFTP: Rename file or directory
   */
  async rename(id, oldPath, newPath) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * SFTP: Download file
   */
  async download(id, remotePath, localPath, transferId, progressCallback) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        if (err) return reject(err);
        const totalSize = stats.size;
        let transferred = 0;

        const readStream = sftp.createReadStream(remotePath);
        const writeStream = fs.createWriteStream(localPath);

        const transferState = {
          readStream,
          writeStream,
          localPath,
          remotePath,
          type: 'download',
          sessionId: id,
          isPaused: false
        };
        this.activeStreams.set(transferId, transferState);

        let lastPercent = -1;
        readStream.on('data', (chunk) => {
          transferred += chunk.length;
          
          const canWrite = writeStream.write(chunk);
          if (!canWrite) {
            readStream.pause();
            writeStream.once('drain', () => {
              if (!transferState.isPaused) {
                readStream.resume();
              }
            });
          }

          if (progressCallback) {
            const percent = totalSize > 0 ? Math.round((transferred / totalSize) * 100) : 0;
            if (percent !== lastPercent) {
              lastPercent = percent;
              progressCallback(percent);
            }
          }
        });

        readStream.on('end', () => {
          writeStream.end();
        });

        readStream.on('error', (err) => {
          this.activeStreams.delete(transferId);
          reject(err);
        });

        writeStream.on('error', (err) => {
          this.activeStreams.delete(transferId);
          reject(err);
        });

        writeStream.on('finish', () => {
          this.activeStreams.delete(transferId);
          resolve();
        });
      });
    });
  }

  /**
   * SFTP: Upload file
   */
  async upload(id, localPath, remotePath, transferId, progressCallback) {
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      fs.stat(localPath, (err, stats) => {
        if (err) return reject(err);
        const totalSize = stats.size;
        let transferred = 0;

        const readStream = fs.createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);

        const transferState = {
          readStream,
          writeStream,
          localPath,
          remotePath,
          type: 'upload',
          sessionId: id,
          isPaused: false
        };
        this.activeStreams.set(transferId, transferState);

        let lastPercent = -1;
        readStream.on('data', (chunk) => {
          transferred += chunk.length;
          
          const canWrite = writeStream.write(chunk);
          if (!canWrite) {
            readStream.pause();
            writeStream.once('drain', () => {
              if (!transferState.isPaused) {
                readStream.resume();
              }
            });
          }

          if (progressCallback) {
            const percent = totalSize > 0 ? Math.round((transferred / totalSize) * 100) : 0;
            if (percent !== lastPercent) {
              lastPercent = percent;
              progressCallback(percent);
            }
          }
        });

        readStream.on('end', () => {
          writeStream.end();
        });

        readStream.on('error', (err) => {
          this.activeStreams.delete(transferId);
          reject(err);
        });

        writeStream.on('error', (err) => {
          this.activeStreams.delete(transferId);
          reject(err);
        });

        writeStream.on('finish', () => {
          this.activeStreams.delete(transferId);
          resolve();
        });
      });
    });
  }

  /**
   * SFTP: Pause a transfer
   */
  pauseTransfer(transferId) {
    const streams = this.activeStreams.get(transferId);
    if (streams && streams.readStream) {
      console.log(`[SFTP] Pausing transfer for transferId: ${transferId}`);
      streams.isPaused = true;
      streams.readStream.pause();
      return true;
    }
    return false;
  }

  /**
   * SFTP: Resume a transfer
   */
  resumeTransfer(transferId) {
    const streams = this.activeStreams.get(transferId);
    if (streams && streams.readStream) {
      console.log(`[SFTP] Resuming transfer for transferId: ${transferId}`);
      streams.isPaused = false;
      streams.readStream.resume();
      return true;
    }
    return false;
  }

  /**
   * SFTP: Abort a specific transfer or all transfers for a session
   */
  abortTransfers(id, transferId) {
    if (transferId) {
      // Abort specific transfer
      const streams = this.activeStreams.get(transferId);
      if (streams) {
        console.log(`[SFTP] Aborting specific transfer for transferId: ${transferId}`);
        try {
          if (streams.readStream.destroy) streams.readStream.destroy();
          if (streams.writeStream.destroy) streams.writeStream.destroy();
        } catch (e) {
          console.error(e);
        }

        // Clean up partial files immediately
        if (streams.type === 'download') {
          console.log(`[SFTP] Cleaning up local partial file: ${streams.localPath}`);
          fs.unlink(streams.localPath, (err) => {
            if (err) console.error('[SFTP] Error unlinking local file:', err);
          });
        } else if (streams.type === 'upload') {
          console.log(`[SFTP] Cleaning up remote partial file: ${streams.remotePath}`);
          const session = this.sessions.get(id);
          if (session && session.sftp) {
            session.sftp.unlink(streams.remotePath, (err) => {
              if (err) console.error('[SFTP] Error unlinking remote file:', err);
            });
          }
        }

        this.activeStreams.delete(transferId);
      }
    } else {
      // Abort all transfers for this session
      console.log(`[SFTP] Aborting all transfers for session ${id}`);
      for (const [key, streams] of this.activeStreams.entries()) {
        if (streams.sessionId === id) {
          try {
            if (streams.readStream.destroy) streams.readStream.destroy();
            if (streams.writeStream.destroy) streams.writeStream.destroy();
          } catch (e) {
            console.error(e);
          }

          if (streams.type === 'download') {
            fs.unlink(streams.localPath, (err) => {
              if (err) console.error('[SFTP] Error unlinking local file:', err);
            });
          } else if (streams.type === 'upload') {
            const session = this.sessions.get(id);
            if (session && session.sftp) {
              session.sftp.unlink(streams.remotePath, (err) => {
                if (err) console.error('[SFTP] Error unlinking remote file:', err);
              });
            }
          }

          this.activeStreams.delete(key);
        }
      }
      
      // Fallback: end the SFTP channel to make absolutely sure
      const session = this.sessions.get(id);
      if (session && session.sftp) {
        try {
          session.sftp.end();
        } catch (e) {
          console.error('[SFTP] Error ending SFTP channel:', e);
        }
        session.sftp = null;
      }
    }
  }

  /**
   * Helper to execute a remote shell command and return its output
   */
  executeCommand(id, cmd) {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(id);
      if (!session || !session.client) {
        return reject(new Error('Session not connected'));
      }
      session.client.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        stream.on('data', (data) => {
          output += data.toString('utf-8');
        });
        stream.stderr.on('data', (data) => {
          // Ignore stderr for command execution
        });
        stream.on('close', () => {
          resolve(output.trim());
        });
      });
    });
  }

  /**
   * Fetch total directory size
   */
  async getDirSize(id, path) {
    if (!path) return '0';
    try {
      const safePath = path.replace(/"/g, '\\"');
      const output = await this.executeCommand(id, `du -sh "${safePath}" 2>/dev/null | awk '{print $1}'`);
      return output || 'Unknown';
    } catch (err) {
      return 'Unknown';
    }
  }

  /**
   * Fetch breakdown of child items sizes inside directory
   */
  async getDirDetails(id, path) {
    if (!path) return [];
    try {
      const safePath = path.replace(/"/g, '\\"');
      const cmd = `du -ah --max-depth=1 "${safePath}" 2>/dev/null || du -ah -d 1 "${safePath}" 2>/dev/null`;
      const output = await this.executeCommand(id, cmd);
      if (!output) return [];
      
      const lines = output.split('\n');
      const items = [];
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const size = parts[0];
        const fullPath = parts.slice(1).join(' ');
        
        // Skip the self directory itself
        if (fullPath === path || fullPath === path + '/' || fullPath + '/' === path) {
          continue;
        }
        
        // Extract the base name of the child item
        const name = fullPath.substring(fullPath.lastIndexOf('/') + 1) || fullPath;
        
        items.push({
          name,
          path: fullPath,
          size
        });
      }
      
      return items;
    } catch (err) {
      return [];
    }
  }

  /**
   * Clean up all active sessions
   */
  cleanupAll() {
    for (const id of this.sessions.keys()) {
      this.disconnect(id);
    }
  }
}

module.exports = new SSHManager();
