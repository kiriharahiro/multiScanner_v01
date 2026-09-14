/**
 * ====================================================================
 * QR & NFC ハイブリッドスキャナー (multiScanner_v01) - コアロジック
 * ====================================================================
 */

// --- 画面要素の取得 ---
const tabQr = document.getElementById('tabQr');
const tabNfc = document.getElementById('tabNfc');
const qrSection = document.getElementById('qrSection');
const nfcSection = document.getElementById('nfcSection');

const connectionBadge = document.getElementById('connectionBadge');
const pendingCountEl = document.getElementById('pendingCount');
const syncedCountEl = document.getElementById('syncedCount');

const toggleCameraFacingBtn = document.getElementById('toggleCameraFacingBtn');
const toggleQrScanBtn = document.getElementById('toggleQrScanBtn');
const qrBtnIcon = document.getElementById('qrBtnIcon');
const qrBtnText = document.getElementById('qrBtnText');

const startNfcBtn = document.getElementById('startNfcBtn');
const nfcBtnIcon = document.getElementById('nfcBtnIcon');
const nfcBtnText = document.getElementById('nfcBtnText');
const nfcHintText = document.getElementById('nfcHintText');

const latestTypeBadge = document.getElementById('latestTypeBadge');
const latestDataText = document.getElementById('latestDataText');
const latestUidText = document.getElementById('latestUidText');
const latestTime = document.getElementById('latestTime');
const latestSyncStatus = document.getElementById('latestSyncStatus');

const historyEmpty = document.getElementById('historyEmpty');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// 設定モーダル関連
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const gasUrlInput = document.getElementById('gasUrlInput');
const soundToggle = document.getElementById('soundToggle');
const vibrateToggle = document.getElementById('vibrateToggle');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// --- アプリ状態 (State) ---
let currentMode = 'QR'; // 'QR' または 'NFC'
let gasUrl = localStorage.getItem('multi_scan_gas_url') || '';
let enableSound = localStorage.getItem('multi_scan_sound') !== 'false';
let enableVibrate = localStorage.getItem('multi_scan_vibrate') !== 'false';

let scanQueue = JSON.parse(localStorage.getItem('multi_scan_queue')) || [];
let totalSyncedCount = parseInt(localStorage.getItem('multi_scan_synced_count')) || 0;

// 重複読み取りガード（同じデータを連続で読み取らないための保護）
let lastScannedData = '';
let lastScannedTime = 0;
const DUPLICATE_INTERVAL = 2500; // 2.5秒間は同一コードを無視

// QRコードスキャナーインスタンス
let html5QrScanner = null;
let isQrScanning = false;
let currentFacingMode = 'environment'; // 'environment'(外カメラ) または 'user'(インカメラ)

// NFCスキャナーインスタンス
let ndefReader = null;
let isNfcScanning = false;

// --- Web Audio API（読み取り電子音） ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// 読み取り成功時の軽快な「ピピッ」ツートン電子音
function playSuccessBeep() {
  if (!enableSound) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    
    // 第1音 (880Hz = ラ)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // 第2音 (1320Hz = ミ) - 少し高めで軽快な響き
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.08);
    gain2.gain.setValueAtTime(0.15, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.25);
  } catch (e) {
    console.warn("効果音再生エラー:", e);
  }
}

// スマホの振動（バイブレーション）
function triggerVibration() {
  if (!enableVibrate) return;
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(100); // 100ミリ秒の小気味よい振動
    } catch (e) {
      console.warn("バイブレーションエラー:", e);
    }
  }
}

// --- ネットワーク状態の監視 ---
function updateOnlineStatus() {
  if (navigator.onLine) {
    connectionBadge.textContent = 'オンライン';
    connectionBadge.className = 'badge online';
    syncPendingQueue(); // 回線復帰時に保留キューを送信
  } else {
    connectionBadge.textContent = 'オフライン';
    connectionBadge.className = 'badge offline';
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// --- 統計カウンター表示の更新 ---
function updateStatsUI() {
  const pendingCount = scanQueue.filter(item => item.status === 'pending').length;
  pendingCountEl.textContent = pendingCount;
  syncedCountEl.textContent = totalSyncedCount;
}

// --- QRコードスキャナー制御 (html5-qrcode) ---
async function startQrScanner() {
  if (isQrScanning) return;
  
  try {
    if (!html5QrScanner) {
      html5QrScanner = new Html5Qrcode("qrReader");
    }

    const config = {
      fps: 15,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.333
    };

    await html5QrScanner.start(
      { facingMode: currentFacingMode },
      config,
      onQrCodeSuccess,
      onQrCodeError
    );

    isQrScanning = true;
    qrBtnIcon.textContent = '⏸️';
    qrBtnText.textContent = 'スキャン一時停止';
  } catch (err) {
    console.error("カメラ起動エラー:", err);
    isQrScanning = false;
    qrBtnIcon.textContent = '▶️';
    qrBtnText.textContent = 'カメラ起動';
    alert("カメラの起動に失敗しました。カメラへのアクセス権限を許可してください。");
  }
}

async function stopQrScanner() {
  if (!isQrScanning || !html5QrScanner) return;
  try {
    await html5QrScanner.stop();
    isQrScanning = false;
    qrBtnIcon.textContent = '▶️';
    qrBtnText.textContent = 'スキャン再開';
  } catch (err) {
    console.warn("カメラ停止時の警告:", err);
  }
}

// QRコード読み取り成功時のコールバック
function onQrCodeSuccess(decodedText) {
  const now = Date.now();
  // 重複防止：直前と同じデータかつ2.5秒以内ならスキップ
  if (decodedText === lastScannedData && (now - lastScannedTime) < DUPLICATE_INTERVAL) {
    return;
  }

  lastScannedData = decodedText;
  lastScannedTime = now;

  // データ統合処理を実行 (種別: 'QR', UID: 空文字)
  handleCapturedData(decodedText, 'QR', '');
}

function onQrCodeError(errorMessage) {
  // スキャン中の探索フレームはログを出さず通常無視
}

// カメラ切り替え（外カメラ ⇄ インカメラ）
async function toggleCameraFacing() {
  currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
  if (isQrScanning) {
    await stopQrScanner();
    await startQrScanner();
  }
}

// --- Web NFC リーダー制御 ---
async function startNfcScanner() {
  if (!('NDEFReader' in window)) {
    nfcHintText.textContent = '⚠️ お使いのブラウザはWeb NFCに対応していません（Android Chrome推奨）';
    startNfcBtn.disabled = true;
    return;
  }

  try {
    if (!ndefReader) {
      ndefReader = new NDEFReader();
      
      ndefReader.addEventListener('reading', event => {
        const serialNumber = event.serialNumber || ''; // NFCカード固有のUID
        let tagText = '';

        // NDEFレコードからテキストデータを抽出
        const message = event.message;
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding || 'utf-8');
            tagText = textDecoder.decode(record.data);
            break;
          } else if (record.recordType === 'url') {
            const textDecoder = new TextDecoder();
            tagText = textDecoder.decode(record.data);
            break;
          }
        }

        // テキストレコードが見つからなければUIDを代用
        const primaryData = tagText || serialNumber;
        const now = Date.now();

        // 重複防止
        if (primaryData === lastScannedData && (now - lastScannedTime) < DUPLICATE_INTERVAL) {
          return;
        }

        lastScannedData = primaryData;
        lastScannedTime = now;

        // データ統合処理を実行 (種別: 'NFC', UID: serialNumber)
        handleCapturedData(primaryData, 'NFC', serialNumber);
      });

      ndefReader.addEventListener('readingerror', () => {
        console.warn("NFCタグの読み取りに失敗しました。もう一度かざしてください。");
      });
    }

    await ndefReader.scan();
    isNfcScanning = true;
    nfcBtnIcon.textContent = '📡';
    nfcBtnText.textContent = 'NFCスキャン待機中';
    nfcHintText.textContent = 'スマートフォン背面にカードをタッチしてください';
  } catch (err) {
    console.error("NFC起動エラー:", err);
    isNfcScanning = false;
    nfcBtnIcon.textContent = '⚠️';
    nfcBtnText.textContent = 'NFCスキャン開始';
    nfcHintText.textContent = 'NFCの起動をタップしてください';
  }
}

function stopNfcScanner() {
  isNfcScanning = false;
}

// --- 統合データキャプチャ処理 (QR / NFC 共通) ---
function handleCapturedData(dataText, type, uid) {
  // 1. 効果音 ＆ 振動
  playSuccessBeep();
  triggerVibration();

  // 2. 読み取りデータオブジェクトの作成
  const timestamp = new Date().toISOString();
  const scanItem = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: timestamp,
    tagText: dataText,
    type: type,       // 'QR' または 'NFC'
    uid: uid || '',   // NFC固有UID
    status: 'pending' // 送信ステータス
  };

  // 3. 最新結果カードの更新
  renderLatestResult(scanItem);

  // 4. キューおよび履歴に追加（先頭に追加、最大50件保持）
  scanQueue.unshift(scanItem);
  if (scanQueue.length > 50) {
    scanQueue.pop();
  }
  localStorage.setItem('multi_scan_queue', JSON.stringify(scanQueue));

  // 5. 画面の履歴一覧を再描画
  renderHistoryList();
  updateStatsUI();

  // 6. Googleスプレッドシート（GAS）へ送信
  if (navigator.onLine && gasUrl) {
    syncItemToGas(scanItem);
  }
}

// 最新結果カードを描画
function renderLatestResult(item) {
  latestTypeBadge.textContent = item.type;
  latestTypeBadge.className = `type-badge ${item.type.toLowerCase()}`;
  
  latestDataText.textContent = item.tagText;
  if (item.type === 'NFC' && item.uid) {
    latestUidText.textContent = `NFC固有ID: ${item.uid}`;
  } else {
    latestUidText.textContent = '';
  }

  const timeStr = new Date(item.timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  latestTime.textContent = timeStr;

  if (item.status === 'synced') {
    latestSyncStatus.textContent = '✅ 送信完了';
    latestSyncStatus.className = 'result-sync status-success';
  } else {
    latestSyncStatus.textContent = '⏳ 送信中/保留';
    latestSyncStatus.className = 'result-sync status-pending';
  }
}

// --- Googleスプレッドシート (GAS) 送信処理 ---
async function syncItemToGas(item) {
  if (!gasUrl) return;

  try {
    // GASのWebアプリへPOST送信
    // mode: 'no-cors' でCORS制約を回避して確実に送信
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timestamp: item.timestamp,
        tagText: item.tagText,
        type: item.type,
        uid: item.uid
      })
    });

    // 成功マークを付与
    markItemAsSynced(item.id);
  } catch (error) {
    console.error("GAS送信失敗:", error);
  }
}

// 送信成功ステータスの更新
function markItemAsSynced(itemId) {
  scanQueue = scanQueue.map(item => {
    if (item.id === itemId && item.status !== 'synced') {
      totalSyncedCount++;
      localStorage.setItem('multi_scan_synced_count', totalSyncedCount.toString());
      return { ...item, status: 'synced' };
    }
    return item;
  });

  localStorage.setItem('multi_scan_queue', JSON.stringify(scanQueue));
  updateStatsUI();
  renderHistoryList();

  // 最新カードがこのアイテムなら表示も更新
  if (scanQueue.length > 0 && scanQueue[0].id === itemId) {
    latestSyncStatus.textContent = '✅ 送信完了';
    latestSyncStatus.className = 'result-sync status-success';
  }
}

// 保留中キューの自動一括送信
async function syncPendingQueue() {
  if (!navigator.onLine || !gasUrl) return;
  const pendingItems = scanQueue.filter(item => item.status === 'pending');
  if (pendingItems.length === 0) return;

  for (const item of pendingItems) {
    await syncItemToGas(item);
  }
}

// --- 履歴一覧の描画 ---
function renderHistoryList() {
  if (scanQueue.length === 0) {
    historyEmpty.style.display = 'block';
    historyList.innerHTML = '';
    return;
  }

  historyEmpty.style.display = 'none';
  historyList.innerHTML = '';

  // 最新10件を表示
  scanQueue.slice(0, 10).forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const timeStr = new Date(item.timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const isSynced = item.status === 'synced';
    const statusIcon = isSynced ? '✅' : '⏳';
    const typeLower = item.type.toLowerCase();

    li.innerHTML = `
      <div class="history-item-left">
        <span class="history-badge ${typeLower}">${item.type}</span>
        <div class="history-info">
          <span class="history-text">${escapeHtml(item.tagText)}</span>
          <span class="history-sub">${timeStr} ${item.uid ? '| UID: ' + escapeHtml(item.uid) : ''}</span>
        </div>
      </div>
      <div class="history-status" title="${isSynced ? '送信完了' : '送信待機中'}">${statusIcon}</div>
    `;

    historyList.appendChild(li);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// --- タブ切り替え処理 ---
tabQr.addEventListener('click', async () => {
  if (currentMode === 'QR') return;
  currentMode = 'QR';

  // タブUIの切り替え
  tabQr.classList.add('active');
  tabQr.setAttribute('aria-selected', 'true');
  tabNfc.classList.remove('active');
  tabNfc.setAttribute('aria-selected', 'false');

  // 表示領域の切り替え
  qrSection.classList.add('active');
  nfcSection.classList.remove('active');

  // NFCを止めてカメラを起動
  stopNfcScanner();
  await startQrScanner();
});

tabNfc.addEventListener('click', async () => {
  if (currentMode === 'NFC') return;
  currentMode = 'NFC';

  // タブUIの切り替え
  tabNfc.classList.add('active');
  tabNfc.setAttribute('aria-selected', 'true');
  tabQr.classList.remove('active');
  tabQr.setAttribute('aria-selected', 'false');

  // 表示領域の切り替え
  nfcSection.classList.add('active');
  qrSection.classList.remove('active');

  // カメラを止めてNFCを起動
  await stopQrScanner();
  await startNfcScanner();
});

// ボタン操作イベント
toggleCameraFacingBtn.addEventListener('click', toggleCameraFacing);

toggleQrScanBtn.addEventListener('click', async () => {
  if (isQrScanning) {
    await stopQrScanner();
  } else {
    await startQrScanner();
  }
});

startNfcBtn.addEventListener('click', () => {
  startNfcScanner();
});

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('読み取り履歴をすべて消去しますか？\n（※スプレッドシート側のデータは削除されません）')) {
    scanQueue = [];
    localStorage.removeItem('multi_scan_queue');
    renderHistoryList();
    updateStatsUI();
  }
});

// --- 設定モーダル制御 ---
openSettingsBtn.addEventListener('click', () => {
  gasUrlInput.value = gasUrl;
  soundToggle.checked = enableSound;
  vibrateToggle.checked = enableVibrate;
  settingsModal.classList.add('open');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('open');
});

settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) {
    settingsModal.classList.remove('open');
  }
});

saveSettingsBtn.addEventListener('click', () => {
  const urlVal = gasUrlInput.value.trim();
  gasUrl = urlVal;
  localStorage.setItem('multi_scan_gas_url', gasUrl);

  enableSound = soundToggle.checked;
  localStorage.setItem('multi_scan_sound', enableSound.toString());

  enableVibrate = vibrateToggle.checked;
  localStorage.setItem('multi_scan_vibrate', enableVibrate.toString());

  settingsModal.classList.remove('open');
  alert('設定を保存しました！');

  // 保留データがあれば即座に送信
  syncPendingQueue();
});

testConnectionBtn.addEventListener('click', async () => {
  const urlVal = gasUrlInput.value.trim();
  if (!urlVal) {
    alert('まずはGoogle Apps ScriptのURLを入力してください。');
    return;
  }

  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = '送信中...';

  try {
    await fetch(urlVal, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        tagText: "テスト送信 (接続確認)",
        type: "TEST",
        uid: "TEST_UID_001"
      })
    });
    alert('テスト送信を行いました！スプレッドシートのI列〜L列に「テスト送信」が記録されているかご確認ください。');
  } catch (err) {
    alert('送信に失敗しました: ' + err.toString());
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'テスト送信';
  }
});

// --- アプリの初期化起動 ---
function initApp() {
  updateOnlineStatus();
  updateStatsUI();
  renderHistoryList();

  // 初期モード(QR)でカメラ起動を試行
  startQrScanner();
}

// ページ読み込み完了時に起動
window.addEventListener('DOMContentLoaded', initApp);
