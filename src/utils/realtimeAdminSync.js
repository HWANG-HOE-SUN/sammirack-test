// src/utils/realtimeAdminSync.js
/**
 * 실시간 관리자 데이터 동기화 시스템
 * 전 세계 모든 PC에서 실시간 동기화
 */

// 데이터 키
const INVENTORY_KEY = 'inventory_data';
const ADMIN_PRICES_KEY = 'admin_edit_prices';
const PRICE_HISTORY_KEY = 'admin_price_history';
const PENDING_HISTORY_KEY = 'pending_price_history'; // 오프라인 큐용
const ACTIVITY_LOG_KEY = 'admin_activity_log';
import { generatePartId } from './unifiedPriceManager';

class RealtimeAdminSync {
  constructor() {
    // GitHub 설정 - 환경변수에서만 로드
    this.GIST_ID = import.meta.env.VITE_GITHUB_GIST_ID;
    this.GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
    
    this.API_BASE = 'https://api.github.com/gists';
    this.isOnline = navigator.onLine;
    this.maxRetries = 3;
    
    // ✅ Debounce용 변수
    this.saveTimeout = null;
    this.lastSaveTime = 0;
    this.minSaveInterval = 5000; // 5초로 변경 (GitHub Secondary Rate Limit 회피)
    
    // ✅ 403 에러 추적 추가
    this.consecutiveFailures = 0;
    this.blockedUntil = 0;
    
    this.setupEventListeners();
    this.initBroadcastChannel();
    
    // 초기 데이터 로드
    this.loadFromServer();
    
    // 5분마다 자동 동기화
    setInterval(() => {
      this.loadFromServer();
    }, 5 * 60 * 1000);
  }

  // 브로드캐스트 채널 초기화 (같은 PC 내 탭 간 동기화)
  initBroadcastChannel() {
    try {
      this.channel = new BroadcastChannel('admin-sync');
      this.channel.addEventListener('message', (event) => {
        const { type, data, source } = event.data;
        
        // 자신이 보낸 메시지는 무시
        if (source === this.getInstanceId()) return;
        
        switch (type) {
          case 'inventory-updated':
            this.handleInventoryUpdate(data);
            break;
          case 'prices-updated':
            this.handlePricesUpdate(data);
            break;
          case 'force-reload':
            this.handleForceReload();
            break;
        }
      });
    } catch (error) {
      console.warn('BroadcastChannel을 지원하지 않는 브라우저입니다.');
    }
  }

  // 인스턴스 고유 ID 생성
  getInstanceId() {
    if (!this.instanceId) {
      this.instanceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    return this.instanceId;
  }

  // 네트워크 상태 감지
  setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📶 네트워크 연결됨 - 동기화 재시작');
      this.syncPendingHistory(); // 네트워크 복구 시 큐 동기화
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📵 네트워크 연결 끊김 - 오프라인 모드');
    });
  }

  // GitHub API 헤더
  getHeaders() {
    return {
      'Authorization': `token ${this.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'sammirack-admin-sync/1.0'
    };
  }

  // 현재 사용자 IP 가져오기
  async getUserIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  // ✅ Debounced 저장 (10초 모았다가 한 번만)
  debouncedSave() {
    // ✅ 차단 중이면 저장 예약만 하고 종료
    const now = Date.now();
    if (now < this.blockedUntil) {
      const waitSeconds = Math.ceil((this.blockedUntil - now) / 1000);
      console.log(`⏸️ GitHub 차단 중. ${waitSeconds}초 후 자동 재시도됩니다.`);
      
      if (!this.saveTimeout) {
        this.saveTimeout = setTimeout(() => {
          this.debouncedSave();
        }, this.blockedUntil - now);
      }
      return;
    }

    // 기존 타이머 취소
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    console.log('📥 저장 예약 (10초 후 실행)');

    // 10초 후 저장 실행
    this.saveTimeout = setTimeout(async () => {
      const now = Date.now();
      const timeSinceLastSave = now - this.lastSaveTime;

      // 마지막 저장 후 10초 이상 경과했는지 확인
      if (timeSinceLastSave < this.minSaveInterval) {
        const waitTime = this.minSaveInterval - timeSinceLastSave;
        console.log(`⏳ 너무 빠른 저장 요청. ${Math.ceil(waitTime/1000)}초 후 재시도`);
        setTimeout(() => this.executeSave(), waitTime);
        return;
      }

      await this.executeSave();
    }, 10000);
  }

	  // ✅ 실제 저장 실행 (Exponential Backoff 강화)
	  async executeSave() {
	    // 오프라인 큐에 쌓인 이력 먼저 동기화 시도
	    await this.syncPendingHistory();
	    
	    // ... (기존 로직 계속)
    console.log('🔄 서버 저장 실행');
    this.lastSaveTime = Date.now();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.saveToServer();
        console.log('✅ 서버 저장 완료');
        
        // 성공 시 실패 카운터 리셋
        this.consecutiveFailures = 0;
        this.blockedUntil = 0;
        
        return true;
      } catch (error) {
        console.error(`❌ 저장 시도 ${attempt}/${this.maxRetries} 실패:`, error.message);

        // 403 에러인 경우 - Secondary Rate Limit
        if (error.message.includes('403')) {
          this.consecutiveFailures++;
          
          // Exponential backoff 계산
          const baseWait = 60000; // 기본 60초
          const exponentialWait = baseWait * Math.pow(2, this.consecutiveFailures - 1);
          const maxWait = 300000; // 최대 5분
          const waitTime = Math.min(exponentialWait, maxWait);
          
          this.blockedUntil = Date.now() + waitTime;
          
          console.error('🚫 GitHub Secondary Rate Limit 감지');
          console.error(`   연속 실패: ${this.consecutiveFailures}회`);
          console.error(`   대기 시간: ${Math.ceil(waitTime/1000)}초`);
          console.error(`   차단 해제: ${new Date(this.blockedUntil).toLocaleTimeString('ko-KR')}`);
          
          // 사용자에게 알림
          window.dispatchEvent(new CustomEvent('githubBlocked', {
            detail: {
              waitSeconds: Math.ceil(waitTime/1000),
              unblockTime: new Date(this.blockedUntil)
            }
          }));
          
          // 더 이상 재시도하지 않음 (차단 해제까지 대기)
          break;
        }

        // 일반 에러인 경우 짧은 재시도
        if (attempt < this.maxRetries) {
          const waitTime = attempt * 3000; // 3초, 6초, 9초
          console.log(`⏳ ${waitTime/1000}초 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('❌ 최대 재시도 횟수 초과. 저장 실패');
    return false;
  }

	  // GitHub Gist에서 데이터 로드
	  async loadFromServer() {
	    // 로드 전 오프라인 큐 동기화 시도 (네트워크 연결 시)
	    await this.syncPendingHistory();
	    
	    // ... (기존 로직 계속)
    if (!this.GIST_ID || !this.GITHUB_TOKEN) {
      console.error('❌ GitHub 설정이 누락되었습니다.');
      console.error('   GIST_ID:', this.GIST_ID ? '설정됨' : '없음');
      console.error('   TOKEN:', this.GITHUB_TOKEN ? `설정됨 (${this.GITHUB_TOKEN.substring(0, 4)}...)` : '없음');
      throw new Error('GitHub 설정 오류: GIST_ID 또는 TOKEN이 없습니다.');
    }
    
    try {
      console.log('🔄 GitHub 서버에서 데이터 로드 중...');
      
      const response = await fetch(`${this.API_BASE}/${this.GIST_ID}`, {
        headers: this.getHeaders()
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new Error(`GitHub API 인증 실패 (401): Token 권한 확인 필요`);
        } else if (response.status === 404) {
          throw new Error(`Gist를 찾을 수 없음 (404): GIST_ID 확인 필요`);
        } else if (response.status === 403) {
          if (errorText.includes('rate limit')) {
            throw new Error(`Rate Limit 초과 (403)`);
          } else {
            throw new Error(`접근 거부 (403): GitHub Secondary Rate Limit 또는 Token 권한 문제`);
          }
        } else {
          throw new Error(`GitHub API 오류 (${response.status}): ${errorText}`);
        }
      }
  
      const gist = await response.json();
      
      if (gist.files) {
        if (gist.files['inventory.json']) {
          const inventoryData = JSON.parse(gist.files['inventory.json'].content);
          localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryData));
          this.broadcastUpdate('inventory-updated', inventoryData);
        }
  
        if (gist.files['admin_prices.json']) {
          const serverPrices = JSON.parse(gist.files['admin_prices.json'].content);
          const localPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
          
          const serverKeys = Object.keys(serverPrices);
          const localKeys = Object.keys(localPrices);
          
          console.log(`💰 서버 단가: ${serverKeys.length}개`);
          console.log(`💰 로컬 단가: ${localKeys.length}개`);
          
          let finalPrices = {};
          let needsServerUpdate = false;
          
          const allPartIds = new Set([...serverKeys, ...localKeys]);
          
          for (const partId of allPartIds) {
            const serverData = serverPrices[partId];
            const localData = localPrices[partId];
            
            if (!serverData && !localData) {
              continue;
            } else if (!serverData && localData) {
              // console.log(`💰 [${partId}] 로컬만 있음 → 서버 업로드 예정`);
              finalPrices[partId] = localData;
              needsServerUpdate = true;
            } else if (serverData && !localData) {
              // console.log(`💰 [${partId}] 서버만 있음 → 서버 데이터 사용`);
              finalPrices[partId] = serverData;
            } else {
              const serverTime = new Date(serverData.timestamp || 0).getTime();
              const localTime = new Date(localData.timestamp || 0).getTime();
              
              if (localTime > serverTime) {
                // console.log(`💰 [${partId}] 로컬이 최신 (${new Date(localTime).toLocaleString()}) → 서버 업데이트 예정`);
                finalPrices[partId] = localData;
                needsServerUpdate = true;
              } else {
                // console.log(`💰 [${partId}] 서버가 최신 (${new Date(serverTime).toLocaleString()}) → 서버 데이터 사용`);
                finalPrices[partId] = serverData;
              }
            }
          }
          
          localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(finalPrices));
          this.broadcastUpdate('prices-updated', finalPrices);
          
          if (needsServerUpdate) {
            console.log('💰 로컬 데이터를 서버에 즉시 업로드');
            setTimeout(() => this.saveToServer(), 1000);
          }
        } else {
          const localPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
          const localKeys = Object.keys(localPrices);
          
          if (localKeys.length > 0) {
            console.log(`💰 서버에 관리자 단가 파일 없음. 로컬 ${localKeys.length}개 항목을 서버에 업로드`);
            setTimeout(() => this.saveToServer(), 1000);
          }
        }
  
	        if (gist.files['price_history.json']) {
	          // price_history.json은 Append-only 로그이므로, 서버의 최신 버전을 로컬에 저장
	          const historyData = JSON.parse(gist.files['price_history.json'].content);
	          localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(historyData));
	        }
  
        if (gist.files['activity_log.json']) {
          const activityData = JSON.parse(gist.files['activity_log.json'].content);
          localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityData));
        }
      }
  
      console.log('✅ GitHub 서버 데이터 로드 완료');
      return true;
      
    } catch (error) {
      console.error('❌ GitHub 서버 데이터 로드 실패:', error);
      console.error('   에러 상세:', error.message);
      throw error;
    }
  }

	  // GitHub Gist에 데이터 저장
	  async saveToServer() {
	    if (!this.GIST_ID || !this.GITHUB_TOKEN) {
	      console.error('❌ GitHub 설정이 누락되었습니다.');
	      return false;
	    }
	
	    try {
	      const inventory = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}');
	      const adminPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
	      // priceHistory는 appendPriceHistory를 통해 Gist에 직접 반영되므로, 여기서는 로컬의 최신 상태만 읽습니다.
	      const priceHistory = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]');
	      const activityLog = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
	
	      const userIP = await this.getUserIP();
	      
	      activityLog.unshift({
	        timestamp: new Date().toISOString(),
	        action: 'data_sync',
	        userIP,
	        dataTypes: ['inventory', 'prices', 'history']
	      });
	
	      if (activityLog.length > 1000) {
	        activityLog.splice(1000);
	      }
	
	      const files = {
	        'inventory.json': {
	          content: JSON.stringify(inventory, null, 2)
	        },
	        'admin_prices.json': {
	          content: JSON.stringify(adminPrices, null, 2)
	        },
	        // price_history.json은 appendPriceHistory에서 별도로 처리하므로, 여기서는 업데이트하지 않습니다.
	        // 'price_history.json': {
	        //   content: JSON.stringify(priceHistory, null, 2)
	        // },
	        'activity_log.json': {
	          content: JSON.stringify(activityLog, null, 2)
	        },
	        'last_updated.txt': {
	          content: `Last updated: ${new Date().toISOString()}\nUser IP: ${userIP}\nSync ID: ${this.getInstanceId()}`
	        }
	      };
	
	      const response = await fetch(`${this.API_BASE}/${this.GIST_ID}`, {
	        method: 'PATCH',
	        headers: this.getHeaders(),
	        body: JSON.stringify({ files })
	      });
	
	      if (!response.ok) {
	        throw new Error(`GitHub API 저장 실패: ${response.status} - ${response.statusText}`);
	      }
	
	      console.log('✅ GitHub 서버에 데이터 저장 완료');
	      
	      localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog));
	      
	      return true;
	      
	    } catch (error) {
	      console.error('❌ GitHub 서버 저장 실패:', error);
	      throw error;
	    }
	  }
	
	  // =================================================================
	  // ✅ Gist Append-only 가격 이력 관리 (Phase 4)
	  // =================================================================
	
	  /**
	   * 오프라인 큐에 쌓인 가격 이력을 서버에 동기화합니다.
	   */
	  async syncPendingHistory() {
	    if (!this.isOnline) return;
	    
	    const pendingRecords = JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || '[]');
	    if (pendingRecords.length === 0) return;
	    
	    console.log(`🔄 오프라인 가격 이력 ${pendingRecords.length}건 동기화 시도...`);
	    
	    // Gist의 최신 price_history.json을 가져옵니다.
	    try {
	      const gistResponse = await fetch(`${this.API_BASE}/${this.GIST_ID}`, {
	        headers: this.getHeaders()
	      });
	      
	      if (!gistResponse.ok) throw new Error(\`Gist 로드 실패: \${gistResponse.status}\`);
	      
	      const gist = await gistResponse.json();
	      const currentHistoryFile = gist.files['price_history.json'];
	      
	      if (!currentHistoryFile) {
	        console.warn('⚠️ price_history.json 파일이 Gist에 없습니다. 새로 생성합니다.');
	      }
	      
	      const currentHistory = currentHistoryFile 
	        ? JSON.parse(currentHistoryFile.content) 
	        : [];
	      
	      // 로컬 큐의 레코드를 서버 데이터에 추가 (Append-only)
	      const newHistory = [...currentHistory, ...pendingRecords];
	      
	      // Gist에 업데이트
	      const updateResponse = await fetch(\`${this.API_BASE}/\${this.GIST_ID}\`, {
	        method: 'PATCH',
	        headers: this.getHeaders(),
	        body: JSON.stringify({
	          files: {
	            'price_history.json': {
	              content: JSON.stringify(newHistory, null, 2)
	            }
	          }
	        })
	      });
	      
	      if (!updateResponse.ok) {
	        throw new Error(\`Gist 업데이트 실패: \${updateResponse.status}\`);
	      }
	      
	      // 성공 시 로컬 큐 비우기 및 로컬 히스토리 업데이트
	      localStorage.removeItem(PENDING_HISTORY_KEY);
	      localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(newHistory));
	      console.log('✅ 오프라인 가격 이력 동기화 완료');
	      
	    } catch (error) {
	      console.error('❌ 오프라인 가격 이력 동기화 실패:', error);
	      // 실패 시 큐는 유지됩니다.
	    }
	  }
	
	  /**
	   * 가격 변경 이력을 기록하고 Gist에 동기화 시도합니다.
	   * @param {object} record - 가격 이력 레코드 (스키마 준수)
	   */
	  async appendPriceHistory(record) {
	    // 1. 로컬 히스토리에 추가
	    const currentHistory = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]');
	    currentHistory.push(record);
	    localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(currentHistory));
	    
	    // 2. 오프라인 큐에 추가
	    const pendingRecords = JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || '[]');
	    pendingRecords.push(record);
	    localStorage.setItem(PENDING_HISTORY_KEY, JSON.stringify(pendingRecords));
	    
	    // 3. 즉시 동기화 시도 (네트워크 연결 시)
	    if (this.isOnline) {
	      await this.syncPendingHistory();
	    } else {
	      console.log('📵 오프라인 모드: 가격 이력을 큐에 저장했습니다.');
	    }
	  }
	  
	  // ... (기존 로직 계속)

  // 브로드캐스트 업데이트
  broadcastUpdate(type, data) {
    if (this.channel) {
      this.channel.postMessage({
        type,
        data,
        source: this.getInstanceId(),
        timestamp: Date.now()
      });
    }

    window.dispatchEvent(new CustomEvent(`${type.replace('-', '')}`, {
      detail: { data, source: this.getInstanceId() }
    }));
  }

  // 업데이트 핸들러들
  handleInventoryUpdate(data) {
    console.log('📦 실시간 재고 업데이트 수신:', data);
    window.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: data }));
  }

  handlePricesUpdate(data) {
    console.log('💰 실시간 단가 업데이트 수신:', data);
    window.dispatchEvent(new CustomEvent('adminPricesUpdated', { detail: data }));
  }

  handleForceReload() {
    console.log('🔄 강제 새로고침 수신');
    window.dispatchEvent(new CustomEvent('forceDataReload'));
  }
}

// 싱글톤 인스턴스
let syncInstance = null;

export const initRealtimeSync = () => {
  if (!syncInstance) {
    syncInstance = new RealtimeAdminSync();
  }
  return syncInstance;
};

export const adminSyncManager = {
  getInstance: () => syncInstance || initRealtimeSync()
};

export const saveInventorySync = async (partId, quantity, userInfo = {}) => {
  try {
    const inventory = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}');
    // ✅ 수정: 숫자 형식으로 저장 (객체가 아닌 순수 숫자값)
    inventory[partId] = Number(quantity);
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
    if (syncInstance) {
      syncInstance.broadcastUpdate('inventory-updated', { [partId]: quantity });
    }
    if (syncInstance) {
      syncInstance.debouncedSave();
    }
    return true;
  } catch (error) {
    console.error('재고 저장 실패:', error);
    return false;
  }
};

	export const loadInventory = () => {
	  try {
	    const stored = localStorage.getItem(INVENTORY_KEY) || '{}';
	    return JSON.parse(stored);
	  } catch (error) {
	    console.error('재고 로드 실패:', error);
	    return {};
	  }
	};
	
	/**
	 * Gist에 기록된 가격 이력 전체를 로드합니다.
	 * @returns {Array} 가격 이력 레코드 배열
	 */
	export const loadPriceHistory = () => {
	  try {
	    const stored = localStorage.getItem(PRICE_HISTORY_KEY) || '[]';
	    return JSON.parse(stored);
	  } catch (error) {
	    console.error('가격 이력 로드 실패:', error);
	    return [];
	  }
	};
	
	/**
	 * 가격 이력 레코드를 Gist에 추가합니다.
	 * unifiedPriceManager의 savePriceHistory를 대체합니다.
	 * @param {object} record - 가격 이력 레코드 (스키마 준수)
	 */
	export const appendPriceHistory = async (record) => {
	  if (syncInstance) {
	    await syncInstance.appendPriceHistory(record);
	  } else {
	    console.error('❌ RealtimeAdminSync 인스턴스가 초기화되지 않았습니다.');
	  }
	};

export const forceServerSync = async () => {
  if (syncInstance) {
    await syncInstance.loadFromServer();
  }
};


export const loadAdminPrices = () => {
  try {
    const stored = localStorage.getItem(ADMIN_PRICES_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('관리자 단가 로드 실패:', error);
    return {};
  }
};

	export const saveAdminPriceSync = async (partId, price, partInfo = {}, userInfo = {}) => {
	  try {
	    const adminPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
	    
	    const oldPrice = adminPrices[partId]?.price || 0;
	    const newPrice = Number(price);
	    
	    if (newPrice > 0) {
	      adminPrices[partId] = {
	        price: newPrice,
	        timestamp: new Date().toISOString(),
	        account: userInfo.username || 'admin',
	        partInfo
	      };
	    } else {
	      delete adminPrices[partId];
	    }
	
	    localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(adminPrices));
	
	    // ✅ 가격 이력 기록 (변경이 있을 경우에만)
	    if (oldPrice !== newPrice && syncInstance) {
	      const record = {
	        ts: new Date().toISOString(),
	        admin: { 
	          deviceId: syncInstance.getInstanceId(), 
	          userHint: userInfo.username || 'admin' 
	        },
	        partId: partId,
	        context: partInfo, // partInfo를 context로 사용
	        from: oldPrice,
	        to: newPrice,
	        reason: 'manual edit', // saveAdminPriceSync는 수동 편집으로 간주
	        priceKey: partInfo.priceKey || partId, // 하이랙의 경우 priceKey를 사용
	        source: 'ui'
	      };
	      syncInstance.appendPriceHistory(record);
	    }
	
	    if (syncInstance) {
	      syncInstance.broadcastUpdate('prices-updated', adminPrices);
	      syncInstance.debouncedSave(); // admin_prices.json 업데이트
	    }
	
	    return true;
	  } catch (error) {
	    console.error('관리자 단가 저장 실패:', error);
	    return false;
	  }
	};

if (typeof window !== 'undefined') {
  initRealtimeSync();
}
