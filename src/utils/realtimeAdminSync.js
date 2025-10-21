// src/utils/realtimeAdminSync.js
/**
 * 실시간 관리자 데이터 동기화 시스템
 * 전 세계 모든 PC에서 실시간 동기화
 */

// 데이터 키
const INVENTORY_KEY = 'inventory_data';
const ADMIN_PRICES_KEY = 'admin_edit_prices';
const PRICE_HISTORY_KEY = 'admin_price_history';
const ACTIVITY_LOG_KEY = 'admin_activity_log';

class RealtimeAdminSync {
  constructor() {
    // GitHub 설정 - 환경변수에서만 로드
    this.GIST_ID = import.meta.env.VITE_GITHUB_GIST_ID;
    this.GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
    
    this.API_BASE = 'https://api.github.com/gists';
    this.isOnline = navigator.onLine;
    this.syncQueue = [];
    this.retryCount = 0;
    this.maxRetries = 3;
    
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
      this.processSyncQueue();
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

  // GitHub Gist에서 데이터 로드
  async loadFromServer() {
    if (!this.GIST_ID || !this.GITHUB_TOKEN) {
      console.error('❌ GitHub 설정이 누락되었습니다. GIST_ID와 GITHUB_TOKEN을 설정하세요.');
      return false;
    }

    try {
      console.log('🔄 GitHub 서버에서 데이터 로드 중...');
      
      const response = await fetch(`${this.API_BASE}/${this.GIST_ID}`, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(`GitHub API 오류: ${response.status} - Bad credentials`);
        } else if (response.status === 404) {
          throw new Error(`GitHub API 오류: ${response.status} - Gist를 찾을 수 없습니다.`);
        } else {
          const errorData = await response.text();
          throw new Error(`GitHub API 오류: ${response.status} - ${errorData}`);
        }
      }

      const gist = await response.json();
      
      // 각 파일별로 데이터 복원
      if (gist.files) {
        if (gist.files['inventory.json']) {
          const inventoryData = JSON.parse(gist.files['inventory.json'].content);
          localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryData));
          this.broadcastUpdate('inventory-updated', inventoryData);
        }

        if (gist.files['admin_prices.json']) {
          const pricesData = JSON.parse(gist.files['admin_prices.json'].content);
          localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(pricesData));
          this.broadcastUpdate('prices-updated', pricesData);
        }

        if (gist.files['price_history.json']) {
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
      return false;
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
      const priceHistory = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '{}');
      const activityLog = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');

      const userIP = await this.getUserIP();
      
      // 활동 로그 추가
      activityLog.unshift({
        timestamp: new Date().toISOString(),
        action: 'data_sync',
        userIP,
        dataTypes: ['inventory', 'prices', 'history']
      });

      // 로그 최대 1000개 유지
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
        'price_history.json': {
          content: JSON.stringify(priceHistory, null, 2)
        },
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
      
      // 로컬에 활동 로그 저장
      localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog));
      
      return true;
      
    } catch (error) {
      console.error('❌ GitHub 서버 저장 실패:', error);
      
      // 실패한 요청을 큐에 추가
      this.addToSyncQueue('save', {});
      
      return false;
    }
  }

  // 동기화 큐에 추가
  addToSyncQueue(action, data) {
    this.syncQueue.push({
      action,
      data,
      timestamp: Date.now(),
      retries: 0
    });
  }

  // 동기화 큐 처리
  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) return;

    console.log(`🔄 동기화 큐 처리 중... (${this.syncQueue.length}개 대기)`);

    const toProcess = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of toProcess) {
      try {
        if (item.action === 'save') {
          await this.saveToServer();
        } else if (item.action === 'load') {
          await this.loadFromServer();
        }
      } catch (error) {
        console.error('동기화 큐 처리 실패:', error);
        
        // 재시도 횟수 증가
        item.retries++;
        
        // 최대 재시도 횟수 미만이면 다시 큐에 추가
        if (item.retries < this.maxRetries) {
          this.syncQueue.push(item);
        }
      }
    }
  }

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

    // DOM 이벤트도 발생
    window.dispatchEvent(new CustomEvent(`${type.replace('-', '')}`, {
      detail: { data, source: this.getInstanceId() }
    }));
  }

  // 업데이트 핸들러들
  handleInventoryUpdate(data) {
    console.log('📦 실시간 재고 업데이트 수신:', data);
    // 필요시 UI 갱신 이벤트 발생
    window.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: data }));
  }

  handlePricesUpdate(data) {
    console.log('💰 실시간 단가 업데이트 수신:', data);
    // 필요시 UI 갱신 이벤트 발생
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

// adminSyncManager export (Login.jsx에서 사용)
export const adminSyncManager = {
  getInstance: () => syncInstance || initRealtimeSync()
};

// 재고 저장 함수
export const saveInventorySync = async (partId, quantity, userInfo = {}) => {
  try {
    // 로컬 저장
    const inventory = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}');
    inventory[partId] = quantity;
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));

    // 브로드캐스트
    if (syncInstance) {
      syncInstance.broadcastUpdate('inventory-updated', { [partId]: quantity });
    }

    // 서버 저장
    if (syncInstance) {
      await syncInstance.saveToServer();
    }

    return true;
  } catch (error) {
    console.error('재고 저장 실패:', error);
    return false;
  }
};

// 재고 로드 함수
export const loadInventory = () => {
  try {
    const stored = localStorage.getItem(INVENTORY_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('재고 로드 실패:', error);
    return {};
  }
};

// 강제 서버 동기화
export const forceServerSync = async () => {
  if (syncInstance) {
    await syncInstance.loadFromServer();
    await syncInstance.saveToServer();
  }
};

// 부품 고유 ID 생성
export const generatePartId = (item) => {
  const { rackType, name, specification } = item;
  const cleanName = (name || '').replace(/[^\w가-힣]/g, '');
  const cleanSpec = (specification || '').replace(/[^\w가-힣]/g, '');
  return `${rackType}-${cleanName}-${cleanSpec}`.toLowerCase();
};

// 관리자 단가 로드
export const loadAdminPrices = () => {
  try {
    const stored = localStorage.getItem(ADMIN_PRICES_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('관리자 단가 로드 실패:', error);
    return {};
  }
};

// 관리자 단가 저장 (실시간 동기화)
export const saveAdminPriceSync = async (partId, price, partInfo = {}, userInfo = {}) => {
  try {
    // 로컬 저장
    const adminPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
    
    if (price && price > 0) {
      adminPrices[partId] = {
        price: Number(price),
        timestamp: new Date().toISOString(),
        account: userInfo.username || 'admin',
        partInfo
      };
    } else {
      // 가격이 0이면 삭제 (기본값 사용)
      delete adminPrices[partId];
    }

    localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(adminPrices));

    // 브로드캐스트
    if (syncInstance) {
      syncInstance.broadcastUpdate('prices-updated', adminPrices);
    }

    // 서버 저장
    if (syncInstance) {
      await syncInstance.saveToServer();
    }

    return true;
  } catch (error) {
    console.error('관리자 단가 저장 실패:', error);
    return false;
  }
};

// 자동 초기화
if (typeof window !== 'undefined') {
  initRealtimeSync();
}
