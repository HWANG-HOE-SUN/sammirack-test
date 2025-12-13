// src/utils/realtimeAdminSync.js
/**
 * 실시간 관리자 데이터 동기화 시스템
 * 전 세계 모든 PC에서 실시간 동기화
 * 
 * ✅ 문서 동기화 핵심 원칙:
 * - 서버 데이터에 로컬 데이터를 "누적" (덮어쓰기 X)
 * - 동일 문서 ID는 최신 타임스탬프 우선
 * - 여러 PC 동시 요청 시 각각의 문서가 모두 서버에 누적됨
 */

// 데이터 키
const INVENTORY_KEY = 'inventory_data';
const ADMIN_PRICES_KEY = 'admin_edit_prices';
const PRICE_HISTORY_KEY = 'admin_price_history';
const ACTIVITY_LOG_KEY = 'admin_activity_log';
const DOCUMENTS_KEY = 'synced_documents';
import { generatePartId } from './unifiedPriceManager';

class RealtimeAdminSync {
  constructor() {
    // GitHub 설정 - 환경변수에서만 로드
    this.GIST_ID = import.meta.env.VITE_GITHUB_GIST_ID;
    this.GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
    
    this.API_BASE = 'https://api.github.com/gists';
    this.isOnline = navigator.onLine;
    this.maxRetries = 3;
    
    // Debounce용 변수
    this.saveTimeout = null;
    this.lastSaveTime = 0;
    this.minSaveInterval = 5000; // 5초
    
    // 403 에러 추적
    this.consecutiveFailures = 0;
    this.blockedUntil = 0;
    
    this.setupEventListeners();
    this.initBroadcastChannel();
    
    // 초기 데이터 로드 및 로컬 문서 업로드
    this.initialSync();
    
    // 5분마다 자동 동기화
    setInterval(() => {
      this.loadFromServer();
    }, 5 * 60 * 1000);
  }

  // ✅ 초기 동기화: 서버 로드 + 로컬 문서 업로드
  async initialSync() {
    try {
      // 1. 먼저 서버에서 데이터 로드
      await this.loadFromServer();
      
      // 2. 로컬 레거시 문서가 있으면 서버에 누적 업로드
      await this.uploadLocalDocumentsToServer();
    } catch (error) {
      console.error('초기 동기화 실패:', error);
    }
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
          case 'documents-updated':
            this.handleDocumentsUpdate(data);
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

  // ✅ 생성자 정보 생성 (사용자명@IP)
  async getCreatorInfo() {
    const userIP = await this.getUserIP();
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const username = currentUser.username || currentUser.name || 'unknown';
    return `${username}@${userIP}`;
  }

  // Debounced 저장 (10초 모았다가 한 번만)
  debouncedSave() {
    // 차단 중이면 저장 예약만 하고 종료
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

      // 마지막 저장 후 5초 이상 경과했는지 확인
      if (timeSinceLastSave < this.minSaveInterval) {
        const waitTime = this.minSaveInterval - timeSinceLastSave;
        console.log(`⏳ 너무 빠른 저장 요청. ${Math.ceil(waitTime/1000)}초 후 재시도`);
        setTimeout(() => this.executeSave(), waitTime);
        return;
      }

      await this.executeSave();
    }, 10000);
  }

  // 실제 저장 실행 (Exponential Backoff 강화)
  async executeSave() {
    console.log('🔄 서버 저장 실행');
    this.lastSaveTime = Date.now();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.saveToServerWithMerge();
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
          
          window.dispatchEvent(new CustomEvent('githubBlocked', {
            detail: {
              waitSeconds: Math.ceil(waitTime/1000),
              unblockTime: new Date(this.blockedUntil)
            }
          }));
          
          break;
        }

        // 일반 에러인 경우 짧은 재시도
        if (attempt < this.maxRetries) {
          const waitTime = attempt * 3000;
          console.log(`⏳ ${waitTime/1000}초 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('❌ 최대 재시도 횟수 초과. 저장 실패');
    return false;
  }

  // ✅ 서버에서 최신 데이터 가져오기 (문서만)
  async getServerDocuments() {
    try {
      const response = await fetch(`${this.API_BASE}/${this.GIST_ID}`, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`GitHub API 오류: ${response.status}`);
      }

      const gist = await response.json();
      
      if (gist.files && gist.files['documents.json']) {
        try {
          return JSON.parse(gist.files['documents.json'].content);
        } catch (e) {
          return {};
        }
      }
      return {};
    } catch (error) {
      console.error('서버 문서 로드 실패:', error);
      return {};
    }
  }

  // GitHub Gist에서 데이터 로드 (읽기 전용 - 로컬에 저장)
  async loadFromServer() {
    if (!this.GIST_ID || !this.GITHUB_TOKEN) {
      console.error('❌ GitHub 설정이 누락되었습니다.');
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
          throw new Error(`GitHub API 인증 실패 (401)`);
        } else if (response.status === 404) {
          throw new Error(`Gist를 찾을 수 없음 (404)`);
        } else if (response.status === 403) {
          throw new Error(`Rate Limit 또는 접근 거부 (403)`);
        } else {
          throw new Error(`GitHub API 오류 (${response.status})`);
        }
      }
  
      const gist = await response.json();
      
      if (gist.files) {
        // 재고 데이터 로드
        if (gist.files['inventory.json']) {
          const inventoryData = JSON.parse(gist.files['inventory.json'].content);
          localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryData));
          this.broadcastUpdate('inventory-updated', inventoryData);
        }
  
        // 단가 데이터 로드
        if (gist.files['admin_prices.json']) {
          const serverPrices = JSON.parse(gist.files['admin_prices.json'].content);
          const localPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
          
          // 단가도 누적 병합 (최신 타임스탬프 우선)
          const mergedPrices = this.mergeByTimestamp(serverPrices, localPrices);
          localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(mergedPrices));
          this.broadcastUpdate('prices-updated', mergedPrices);
        }
  
        if (gist.files['price_history.json']) {
          const historyData = JSON.parse(gist.files['price_history.json'].content);
          localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(historyData));
        }
  
        if (gist.files['activity_log.json']) {
          const activityData = JSON.parse(gist.files['activity_log.json'].content);
          localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityData));
        }

        // ✅ 문서 데이터 로드 (서버 → 로컬 동기화)
        if (gist.files['documents.json']) {
          try {
            const serverDocuments = JSON.parse(gist.files['documents.json'].content);
            const localDocuments = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
            
            // 서버 문서를 로컬에 누적 (서버가 기준)
            const mergedDocuments = this.mergeDocumentsByTimestamp(serverDocuments, localDocuments);
            localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(mergedDocuments));
            
            // 레거시 키에도 동기화 (기존 코드 호환)
            this.syncToLegacyKeys(mergedDocuments);
            
            this.broadcastUpdate('documents-updated', mergedDocuments);
            console.log(`📄 서버 문서 로드 완료: ${Object.keys(mergedDocuments).length}개`);
          } catch (e) {
            console.error('문서 파싱 실패:', e);
          }
        }
      }
  
      console.log('✅ GitHub 서버 데이터 로드 완료');
      return true;
      
    } catch (error) {
      console.error('❌ GitHub 서버 데이터 로드 실패:', error);
      throw error;
    }
  }

  // ✅ 로컬 레거시 문서를 서버에 업로드 (누적 방식)
  async uploadLocalDocumentsToServer() {
    try {
      const localLegacyDocuments = this.getLocalLegacyDocuments();
      const localDocCount = Object.keys(localLegacyDocuments).length;
      
      if (localDocCount === 0) {
        console.log('📄 업로드할 로컬 문서 없음');
        return;
      }

      console.log(`📄 로컬 문서 ${localDocCount}개 서버 업로드 시작...`);
      
      // 생성자 정보 추가
      const creatorInfo = await this.getCreatorInfo();
      for (const docKey in localLegacyDocuments) {
        if (!localLegacyDocuments[docKey].createdBy) {
          localLegacyDocuments[docKey].createdBy = creatorInfo;
        }
        if (!localLegacyDocuments[docKey].syncedAt) {
          localLegacyDocuments[docKey].syncedAt = new Date().toISOString();
        }
      }

      // 1. 서버에서 현재 문서 가져오기
      const serverDocuments = await this.getServerDocuments();
      console.log(`📄 서버 기존 문서: ${Object.keys(serverDocuments).length}개`);
      
      // 2. 서버 문서 + 로컬 문서 누적 병합
      const mergedDocuments = this.mergeDocumentsByTimestamp(serverDocuments, localLegacyDocuments);
      console.log(`📄 병합 후 총 문서: ${Object.keys(mergedDocuments).length}개`);
      
      // 3. 로컬 synced_documents에 저장
      localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(mergedDocuments));
      
      // 4. 서버에 즉시 업로드
      await this.saveToServerWithMerge();
      
      console.log('✅ 로컬 문서 서버 업로드 완료');
      
    } catch (error) {
      console.error('❌ 로컬 문서 업로드 실패:', error);
    }
  }

  // ✅ 로컬 레거시 문서 가져오기 (estimate_, purchase_, delivery_ 접두사)
  getLocalLegacyDocuments() {
    const documents = {};
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key && (
          key.startsWith('estimate_') || 
          key.startsWith('purchase_') || 
          key.startsWith('delivery_')
        )
      ) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (item && item.id && item.type) {
            const docKey = `${item.type}_${item.id}`;
            documents[docKey] = item;
          }
        } catch (e) {
          console.error('문서 파싱 실패:', key, e);
        }
      }
    }
    
    return documents;
  }

  // ✅ 문서 병합 (최신 타임스탬프 우선, 누적 방식)
  mergeDocumentsByTimestamp(serverDocs, localDocs) {
    const merged = { ...serverDocs }; // 서버 문서 기반
    
    for (const docKey in localDocs) {
      const localDoc = localDocs[docKey];
      const serverDoc = merged[docKey];
      
      if (!serverDoc) {
        // 서버에 없으면 추가
        merged[docKey] = localDoc;
      } else {
        // 둘 다 있으면 최신 타임스탬프 우선
        const serverTime = new Date(serverDoc.updatedAt || serverDoc.createdAt || 0).getTime();
        const localTime = new Date(localDoc.updatedAt || localDoc.createdAt || 0).getTime();
        
        if (localTime > serverTime) {
          merged[docKey] = localDoc;
        }
        // 서버가 최신이면 서버 데이터 유지 (이미 merged에 있음)
      }
    }
    
    return merged;
  }

  // ✅ 일반 데이터 병합 (최신 타임스탬프 우선)
  mergeByTimestamp(serverData, localData) {
    const merged = { ...serverData };
    
    for (const key in localData) {
      const localItem = localData[key];
      const serverItem = merged[key];
      
      if (!serverItem) {
        merged[key] = localItem;
      } else {
        const serverTime = new Date(serverItem.timestamp || 0).getTime();
        const localTime = new Date(localItem.timestamp || 0).getTime();
        
        if (localTime > serverTime) {
          merged[key] = localItem;
        }
      }
    }
    
    return merged;
  }

  // ✅ 레거시 키에 동기화 (기존 코드 호환성)
  syncToLegacyKeys(documents) {
    for (const docKey in documents) {
      const doc = documents[docKey];
      if (doc && !doc.deleted) {
        localStorage.setItem(docKey, JSON.stringify(doc));
      } else if (doc && doc.deleted) {
        // 삭제된 문서는 레거시 키에서 제거
        localStorage.removeItem(docKey);
      }
    }
  }

  // ✅ 서버에 저장 (누적 병합 방식)
  async saveToServerWithMerge() {
    if (!this.GIST_ID || !this.GITHUB_TOKEN) {
      console.error('❌ GitHub 설정이 누락되었습니다.');
      return false;
    }

    try {
      // 1. 서버에서 현재 문서 가져오기 (동시 요청 대비)
      const serverDocuments = await this.getServerDocuments();
      
      // 2. 로컬 데이터 가져오기
      const localDocuments = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
      const inventory = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}');
      const adminPrices = JSON.parse(localStorage.getItem(ADMIN_PRICES_KEY) || '{}');
      const priceHistory = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '{}');
      const activityLog = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');

      // 3. 문서 누적 병합 (서버 + 로컬)
      const mergedDocuments = this.mergeDocumentsByTimestamp(serverDocuments, localDocuments);
      
      // 4. 로컬에도 병합 결과 저장
      localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(mergedDocuments));
      this.syncToLegacyKeys(mergedDocuments);

      const userIP = await this.getUserIP();
      
      // 활동 로그 추가
      activityLog.unshift({
        timestamp: new Date().toISOString(),
        action: 'data_sync',
        userIP,
        dataTypes: ['inventory', 'prices', 'history', 'documents'],
        documentCount: Object.keys(mergedDocuments).length
      });

      if (activityLog.length > 1000) {
        activityLog.splice(1000);
      }

      // 5. 서버에 저장
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
        'documents.json': {
          content: JSON.stringify(mergedDocuments, null, 2)
        },
        'last_updated.txt': {
          content: `Last updated: ${new Date().toISOString()}\nUser IP: ${userIP}\nSync ID: ${this.getInstanceId()}\nDocuments: ${Object.keys(mergedDocuments).length}`
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

      console.log(`✅ GitHub 서버에 데이터 저장 완료 (문서 ${Object.keys(mergedDocuments).length}개)`);
      
      localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog));
      
      // 브로드캐스트
      this.broadcastUpdate('documents-updated', mergedDocuments);
      
      return true;
      
    } catch (error) {
      console.error('❌ GitHub 서버 저장 실패:', error);
      throw error;
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

  handleDocumentsUpdate(data) {
    console.log('📄 실시간 문서 업데이트 수신:', data);
    window.dispatchEvent(new CustomEvent('documentsUpdated', { detail: data }));
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
    
    if (price && price > 0) {
      adminPrices[partId] = {
        price: Number(price),
        timestamp: new Date().toISOString(),
        account: userInfo.username || 'admin',
        partInfo
      };
    } else {
      delete adminPrices[partId];
    }

    localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(adminPrices));

    if (syncInstance) {
      syncInstance.broadcastUpdate('prices-updated', adminPrices);
    }

    if (syncInstance) {
      syncInstance.debouncedSave();
    }

    return true;
  } catch (error) {
    console.error('관리자 단가 저장 실패:', error);
    return false;
  }
};

// ============================================
// ✅ 문서 동기화 관련 함수들
// ============================================

/**
 * 모든 문서 로드 (삭제되지 않은 문서만)
 * @param {boolean} includeDeleted - 삭제된 문서 포함 여부
 * @returns {Array} 문서 배열
 */
export const loadAllDocuments = (includeDeleted = false) => {
  try {
    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    const docArray = Object.values(documents);
    
    if (includeDeleted) {
      return docArray;
    }
    
    return docArray.filter(doc => !doc.deleted);
  } catch (error) {
    console.error('문서 로드 실패:', error);
    return [];
  }
};

/**
 * 삭제된 문서만 로드
 * @returns {Array} 삭제된 문서 배열
 */
export const loadDeletedDocuments = () => {
  try {
    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    return Object.values(documents).filter(doc => doc.deleted === true);
  } catch (error) {
    console.error('삭제된 문서 로드 실패:', error);
    return [];
  }
};

/**
 * 문서 저장 (생성 또는 수정) - 서버 누적 방식
 * @param {Object} document - 저장할 문서 객체
 * @returns {Promise<boolean>} 성공 여부
 */
export const saveDocumentSync = async (document) => {
  try {
    if (!document || !document.id || !document.type) {
      console.error('유효하지 않은 문서:', document);
      return false;
    }

    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    const docKey = `${document.type}_${document.id}`;
    
    // 생성자 정보 추가 (새 문서인 경우)
    if (!documents[docKey] && syncInstance) {
      document.createdBy = await syncInstance.getCreatorInfo();
    }
    
    // 수정 시간 업데이트
    document.updatedAt = new Date().toISOString();
    document.syncedAt = new Date().toISOString();
    
    documents[docKey] = document;
    
    // synced_documents에 저장
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
    
    // 레거시 키에도 저장 (기존 코드 호환성)
    localStorage.setItem(docKey, JSON.stringify(document));
    
    // 브로드캐스트 및 서버 동기화
    if (syncInstance) {
      syncInstance.broadcastUpdate('documents-updated', documents);
      syncInstance.debouncedSave();
    }
    
    console.log(`📄 문서 저장 완료: ${docKey}`);
    return true;
    
  } catch (error) {
    console.error('문서 저장 실패:', error);
    return false;
  }
};

/**
 * 문서 소프트 삭제
 * @param {string} docId - 문서 ID
 * @param {string} docType - 문서 타입 (estimate, purchase, delivery)
 * @returns {Promise<boolean>} 성공 여부
 */
export const deleteDocumentSync = async (docId, docType) => {
  try {
    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    const docKey = `${docType}_${docId}`;
    
    if (!documents[docKey]) {
      console.warn('삭제할 문서를 찾을 수 없음:', docKey);
      return false;
    }
    
    // 소프트 삭제 (deleted 플래그 추가)
    documents[docKey].deleted = true;
    documents[docKey].deletedAt = new Date().toISOString();
    documents[docKey].updatedAt = new Date().toISOString();
    
    if (syncInstance) {
      documents[docKey].deletedBy = await syncInstance.getCreatorInfo();
    }
    
    // synced_documents 업데이트
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
    
    // 레거시 키에서는 제거 (UI에서 안 보이도록)
    localStorage.removeItem(docKey);
    
    // 브로드캐스트 및 서버 동기화
    if (syncInstance) {
      syncInstance.broadcastUpdate('documents-updated', documents);
      syncInstance.debouncedSave();
    }
    
    console.log(`🗑️ 문서 소프트 삭제 완료: ${docKey}`);
    return true;
    
  } catch (error) {
    console.error('문서 삭제 실패:', error);
    return false;
  }
};

/**
 * 삭제된 문서 복구
 * @param {string} docId - 문서 ID
 * @param {string} docType - 문서 타입
 * @returns {Promise<boolean>} 성공 여부
 */
export const restoreDocumentSync = async (docId, docType) => {
  try {
    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    const docKey = `${docType}_${docId}`;
    
    if (!documents[docKey]) {
      console.warn('복구할 문서를 찾을 수 없음:', docKey);
      return false;
    }
    
    // 삭제 플래그 제거
    delete documents[docKey].deleted;
    delete documents[docKey].deletedAt;
    delete documents[docKey].deletedBy;
    
    documents[docKey].restoredAt = new Date().toISOString();
    documents[docKey].updatedAt = new Date().toISOString();
    
    if (syncInstance) {
      documents[docKey].restoredBy = await syncInstance.getCreatorInfo();
    }
    
    // synced_documents 업데이트
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
    
    // 레거시 키에도 복원
    localStorage.setItem(docKey, JSON.stringify(documents[docKey]));
    
    // 브로드캐스트 및 서버 동기화
    if (syncInstance) {
      syncInstance.broadcastUpdate('documents-updated', documents);
      syncInstance.debouncedSave();
    }
    
    console.log(`♻️ 문서 복구 완료: ${docKey}`);
    return true;
    
  } catch (error) {
    console.error('문서 복구 실패:', error);
    return false;
  }
};

/**
 * 문서 영구 삭제 (서버에서도 완전 삭제)
 * @param {string} docId - 문서 ID
 * @param {string} docType - 문서 타입
 * @returns {Promise<boolean>} 성공 여부
 */
export const permanentDeleteDocumentSync = async (docId, docType) => {
  try {
    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    const docKey = `${docType}_${docId}`;
    
    if (!documents[docKey]) {
      console.warn('영구 삭제할 문서를 찾을 수 없음:', docKey);
      return false;
    }
    
    // 완전 삭제
    delete documents[docKey];
    
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
    localStorage.removeItem(docKey);
    
    if (syncInstance) {
      syncInstance.broadcastUpdate('documents-updated', documents);
      syncInstance.debouncedSave();
    }
    
    console.log(`🔥 문서 영구 삭제 완료: ${docKey}`);
    return true;
    
  } catch (error) {
    console.error('문서 영구 삭제 실패:', error);
    return false;
  }
};

/**
 * 특정 문서 조회
 * @param {string} docId - 문서 ID
 * @param {string} docType - 문서 타입
 * @returns {Object|null} 문서 객체 또는 null
 */
export const getDocumentById = (docId, docType) => {
  try {
    const documents = JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || '{}');
    const docKey = `${docType}_${docId}`;
    return documents[docKey] || null;
  } catch (error) {
    console.error('문서 조회 실패:', error);
    return null;
  }
};

if (typeof window !== 'undefined') {
  initRealtimeSync();
}
