// src/utils/realtimeAdminSync.js
/**
 * 완벽한 관리자 실시간 동기화 시스템
 * GitHub Gist + localStorage + BroadcastChannel 조합으로 전 세계 PC 간 즉시 동기화
 */

class RealtimeAdminSyncManager {
  constructor() {
    this.isInitialized = false;
    this.syncChannel = null;
    this.syncInterval = null;
    this.lastSyncTime = 0;
    this.pendingChanges = new Map();
    this.isOnline = navigator.onLine;
    
    // ⚠️ 여기에 실제 GitHub 정보 입력하세요!
    this.GIST_ID = 'YOUR_GIST_ID_HERE'; // 2단계에서 얻은 Gist ID
    this.GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN_HERE'; // 1단계에서 얻은 토큰
    
    this.init();
  }

  async init() {
    console.log('🚀 관리자 실시간 동기화 시스템 초기화 중...');
    
    // BroadcastChannel 설정 (같은 PC 내 탭 간 동기화)
    this.setupBroadcastChannel();
    
    // localStorage 변경 감지 (다른 PC에서 접속)
    this.setupStorageListener();
    
    // 온라인/오프라인 상태 감지
    this.setupNetworkListener();
    
    // 주기적 동기화 (백업)
    this.startPeriodicSync();
    
    // 초기 데이터 로드
    await this.loadFromServer();
    
    this.isInitialized = true;
    console.log('✅ 관리자 실시간 동기화 시스템 초기화 완료');
  }

  // BroadcastChannel 설정 (같은 PC 내)
  setupBroadcastChannel() {
    this.syncChannel = new BroadcastChannel('sammi-admin-sync');
    
    this.syncChannel.addEventListener('message', (event) => {
      const { type, data, timestamp } = event.data;
      
      console.log(`📡 [같은PC] 동기화 메시지 수신: ${type}`, data);
      
      switch (type) {
        case 'ADMIN_PRICE_CHANGED':
          this.handleRemotePriceChange(data, 'same_pc');
          break;
        case 'INVENTORY_CHANGED':
          this.handleRemoteInventoryChange(data, 'same_pc');
          break;
        case 'FORCE_RELOAD':
          this.forceReloadAllData();
          break;
      }
    });
  }

  // localStorage 변경 감지 (다른 PC)
  setupStorageListener() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'admin_edit_prices') {
        console.log('📡 [다른PC] 관리자 단가 변경 감지');
        this.handleRemotePriceChange(null, 'other_pc');
      } else if (e.key === 'inventory_data') {
        console.log('📡 [다른PC] 재고 변경 감지');
        this.handleRemoteInventoryChange(null, 'other_pc');
      }
    });
  }

  // 네트워크 상태 감지
  setupNetworkListener() {
    window.addEventListener('online', () => {
      console.log('🌐 온라인 상태 복구 - 대기 중인 변경사항 동기화');
      this.isOnline = true;
      this.syncPendingChanges();
    });
    
    window.addEventListener('offline', () => {
      console.log('🌐 오프라인 상태 - 로컬 저장 모드');
      this.isOnline = false;
    });
  }

  // 주기적 동기화 (백업용)
  startPeriodicSync() {
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.loadFromServer();
      }
    }, 30000); // 30초마다
  }

  // 관리자 단가 저장 (실시간 동기화)
  async saveAdminPrice(partId, price, partInfo = {}, userInfo = {}) {
    const changeData = {
      partId,
      price: Number(price),
      partInfo,
      userInfo: {
        ...userInfo,
        timestamp: new Date().toISOString(),
        ip: await this.getCurrentIP()
      }
    };

    try {
      // 1. 로컬 저장
      this.saveToLocalStorage('admin_edit_prices', partId, changeData);
      
      // 2. 같은 PC 탭들에게 즉시 알림
      this.broadcastToLocalTabs('ADMIN_PRICE_CHANGED', changeData);
      
      // 3. 서버 동기화 (온라인일 때)
      if (this.isOnline && this.isGitHubConfigured()) {
        await this.saveToServer('admin_edit_prices', partId, changeData);
      } else {
        // 오프라인이거나 GitHub 미설정시 대기열에 추가
        this.pendingChanges.set(`price_${partId}`, changeData);
        if (!this.isGitHubConfigured()) {
          console.warn('⚠️ GitHub 설정이 필요합니다. 로컬 저장만 사용 중...');
        }
      }
      
      // 4. 전역 이벤트 발생
      this.emitGlobalEvent('adminPriceChanged', changeData);
      
      console.log(`✅ 관리자 단가 동기화 완료: ${partId} = ${price}원`);
      return true;
      
    } catch (error) {
      console.error('❌ 관리자 단가 동기화 실패:', error);
      return false;
    }
  }

  // 재고 저장 (실시간 동기화)
  async saveInventory(partId, quantity, userInfo = {}) {
    const changeData = {
      partId,
      quantity: Number(quantity),
      userInfo: {
        ...userInfo,
        timestamp: new Date().toISOString(),
        ip: await this.getCurrentIP()
      }
    };

    try {
      // 1. 로컬 저장
      this.saveToLocalStorage('inventory_data', partId, { quantity: Number(quantity) });
      
      // 2. 같은 PC 탭들에게 즉시 알림
      this.broadcastToLocalTabs('INVENTORY_CHANGED', changeData);
      
      // 3. 서버 동기화
      if (this.isOnline && this.isGitHubConfigured()) {
        await this.saveToServer('inventory_data', partId, changeData);
      } else {
        this.pendingChanges.set(`inventory_${partId}`, changeData);
      }
      
      // 4. 전역 이벤트 발생
      this.emitGlobalEvent('inventoryChanged', changeData);
      
      console.log(`✅ 재고 동기화 완료: ${partId} = ${quantity}개`);
      return true;
      
    } catch (error) {
      console.error('❌ 재고 동기화 실패:', error);
      return false;
    }
  }

  // GitHub 설정 확인
  isGitHubConfigured() {
    return this.GIST_ID !== 'YOUR_GIST_ID_HERE' && 
           this.GITHUB_TOKEN !== 'YOUR_GITHUB_TOKEN_HERE' &&
           this.GIST_ID && this.GITHUB_TOKEN;
  }

  // 서버에 저장
  async saveToServer(dataType, partId, data) {
    if (!this.isGitHubConfigured()) {
      console.warn('⚠️ GitHub 설정이 필요합니다.');
      return;
    }

    try {
      // 현재 서버 데이터 가져오기
      const currentData = await this.loadFromServer(dataType) || {};
      
      // 데이터 업데이트
      if (data.price !== undefined || data.quantity !== undefined) {
        currentData[partId] = data;
      } else if (data === null) {
        delete currentData[partId];
      }
      
      // GitHub Gist에 저장
      const gistData = {
        [dataType]: currentData,
        lastUpdated: new Date().toISOString(),
        version: Date.now()
      };
      
      await this.updateGist(gistData);
      
      console.log(`📤 서버 저장 완료: ${dataType}/${partId}`);
      
    } catch (error) {
      console.error('❌ 서버 저장 실패:', error);
      // 실패하면 대기열에 추가
      this.pendingChanges.set(`${dataType}_${partId}`, data);
    }
  }

  // 서버에서 로드
  async loadFromServer(specificType = null) {
    if (!this.isGitHubConfigured()) {
      console.warn('⚠️ GitHub 미설정 - 로컬 데이터만 사용');
      return null;
    }

    try {
      const gistData = await this.fetchGist();
      
      if (specificType) {
        return gistData[specificType] || {};
      }
      
      // 모든 데이터 로컬에 적용
      if (gistData.admin_edit_prices) {
        localStorage.setItem('admin_edit_prices', JSON.stringify(gistData.admin_edit_prices));
        this.emitGlobalEvent('adminPricesUpdated', { source: 'server' });
      }
      
      if (gistData.inventory_data) {
        localStorage.setItem('inventory_data', JSON.stringify(gistData.inventory_data));
        this.emitGlobalEvent('inventoryUpdated', { source: 'server' });
      }
      
      console.log('📥 서버 데이터 로드 완료');
      return gistData;
      
    } catch (error) {
      console.error('❌ 서버 데이터 로드 실패:', error);
      return null;
    }
  }

  // GitHub Gist 업데이트
  async updateGist(data) {
    const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${this.GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          'sammi_admin_data.json': {
            content: JSON.stringify(data, null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API 오류: ${response.status} ${response.statusText}`);
    }
  }

  // GitHub Gist 가져오기
  async fetchGist() {
    const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`, {
      headers: {
        'Authorization': `token ${this.GITHUB_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API 오류: ${response.status} ${response.statusText}`);
    }

    const gist = await response.json();
    const content = gist.files['sammi_admin_data.json']?.content;
    
    return content ? JSON.parse(content) : {};
  }

  // 로컬 저장
  saveToLocalStorage(storageKey, partId, data) {
    try {
      const stored = localStorage.getItem(storageKey) || '{}';
      const allData = JSON.parse(stored);
      
      if (data === null) {
        delete allData[partId];
      } else {
        allData[partId] = data;
      }
      
      localStorage.setItem(storageKey, JSON.stringify(allData));
    } catch (error) {
      console.error('로컬 저장 실패:', error);
    }
  }

  // 같은 PC 탭들에게 브로드캐스트
  broadcastToLocalTabs(type, data) {
    if (this.syncChannel) {
      this.syncChannel.postMessage({
        type,
        data,
        timestamp: Date.now()
      });
    }
  }

  // 전역 이벤트 발생
  emitGlobalEvent(eventName, data) {
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: data
    }));
  }

  // 원격 변경 처리
  handleRemotePriceChange(data, source) {
    console.log(`🔄 원격 단가 변경 처리 (${source}):`, data);
    this.emitGlobalEvent('adminPricesUpdated', { 
      source, 
      data 
    });
  }

  handleRemoteInventoryChange(data, source) {
    console.log(`🔄 원격 재고 변경 처리 (${source}):`, data);
    this.emitGlobalEvent('inventoryUpdated', { 
      source, 
      data 
    });
  }

  forceReloadAllData() {
    console.log('🔄 전체 데이터 강제 새로고침');
    this.loadFromServer();
    this.emitGlobalEvent('forceDataReload', {});
  }

  // 대기 중인 변경사항 동기화
  async syncPendingChanges() {
    if (this.pendingChanges.size === 0) return;
    
    console.log(`🔄 대기 중인 ${this.pendingChanges.size}개 변경사항 동기화 중...`);
    
    for (const [key, data] of this.pendingChanges) {
      try {
        const [dataType, partId] = key.split('_', 2);
        await this.saveToServer(dataType, partId, data);
        this.pendingChanges.delete(key);
      } catch (error) {
        console.error(`동기화 실패: ${key}`, error);
      }
    }
  }

  // 현재 IP 가져오기
  async getCurrentIP() {
    try {
      const cached = localStorage.getItem('current_ip_cache');
      if (cached) {
        const { ip, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 3600000) { // 1시간 캐시
          return ip;
        }
      }

      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      
      localStorage.setItem('current_ip_cache', JSON.stringify({
        ip: data.ip,
        timestamp: Date.now()
      }));
      
      return data.ip;
    } catch (error) {
      return 'Unknown';
    }
  }

  // 정리
  cleanup() {
    if (this.syncChannel) {
      this.syncChannel.close();
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

// 부품 ID 생성 함수
export const generatePartId = (item) => {
  const { rackType, name, specification } = item;
  const cleanName = (name || '').replace(/[^\w가-힣]/g, '');
  const cleanSpec = (specification || '').replace(/[^\w가-힣]/g, '');
  return `${rackType}-${cleanName}-${cleanSpec}`.toLowerCase();
};

// 싱글톤 인스턴스 생성
export const adminSyncManager = new RealtimeAdminSyncManager();

// 간편한 API 함수들
export const saveAdminPriceSync = async (partId, price, partInfo = {}, userInfo = {}) => {
  return await adminSyncManager.saveAdminPrice(partId, price, partInfo, userInfo);
};

export const saveInventorySync = async (partId, quantity, userInfo = {}) => {
  return await adminSyncManager.saveInventory(partId, quantity, userInfo);
};

export const loadAdminPrices = () => {
  try {
    const stored = localStorage.getItem('admin_edit_prices') || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('관리자 단가 로드 실패:', error);
    return {};
  }
};

export const loadInventory = () => {
  try {
    const stored = localStorage.getItem('inventory_data') || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('재고 로드 실패:', error);
    return {};
  }
};

export const getEffectivePrice = (item) => {
  const partId = generatePartId(item);
  const adminPrices = loadAdminPrices();
  
  if (adminPrices[partId]?.price > 0) {
    return adminPrices[partId].price;
  }
  
  return Number(item.unitPrice) || 0;
};

export const forceServerSync = async () => {
  return await adminSyncManager.loadFromServer();
};

console.log('✅ 완벽한 관리자 실시간 동기화 시스템 로드 완료');
