import axios from 'axios';

// Gist ID와 Token을 환경 변수에서 가져옵니다.
const GIST_ID = import.meta.env.VITE_GITHUB_GIST_ID;
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const INVENTORY_FILE_NAME = 'inventory.json';

// Gist ID가 설정되어 있는지 확인합니다.
if (!GIST_ID) {
  console.error("환경 변수 VITE_GITHUB_GIST_ID가 설정되지 않았습니다.");
}

const GIST_URL = GIST_ID ? `https://api.github.com/gists/${GIST_ID}` : null;

/**
 * Gist 서버를 통해 재고 데이터를 관리하는 서비스
 */
class InventoryService {
  /**
   * Gist에서 현재 재고 데이터를 가져옵니다.
   * @returns {Promise<Object>} 재고 데이터 (partId: quantity 형태 )
   */
  async getInventory() {
    if (!GIST_URL) {
      console.error("Gist URL이 유효하지 않아 재고 데이터를 로드할 수 없습니다.");
      return {};
    }
    
    try {
      // Gist API를 사용하여 데이터를 가져옵니다.
      const response = await axios.get(GIST_URL);
      
      const file = response.data.files[INVENTORY_FILE_NAME];
      if (!file) {
        console.error(`Gist 파일 ${INVENTORY_FILE_NAME}을 찾을 수 없습니다.`);
        // 파일이 없으면 초기 재고 데이터로 빈 객체를 반환합니다.
        return {}; 
      }
      
      // 파일 내용을 파싱하여 재고 데이터를 반환합니다.
      const content = file.content;
      return JSON.parse(content);
    } catch (error) {
      console.error('Gist에서 재고 데이터 로드 실패:', error);
      // 실패 시 빈 객체 반환 또는 에러 throw
      return {};
    }
  }

  /**
   * Gist의 재고 데이터를 업데이트합니다.
   * @param {Object} updates - 업데이트할 재고 데이터 (partId: newQuantity 형태)
   * @returns {Promise<Object>} 업데이트된 전체 재고 데이터
   */
  async updateInventory(updates) {
    if (!GIST_URL) {
      throw new Error("Gist URL이 유효하지 않아 재고 데이터를 업데이트할 수 없습니다.");
    }
    if (!GITHUB_TOKEN) {
      throw new Error("환경 변수 VITE_GITHUB_TOKEN이 설정되지 않아 재고 데이터를 업데이트할 수 없습니다.");
    }

    // 1. 현재 재고 데이터를 가져옵니다.
    const currentInventory = await this.getInventory();

    // 2. 업데이트를 적용합니다.
    const newInventory = { ...currentInventory };
    for (const [partId, quantity] of Object.entries(updates)) {
      // 수량이 0보다 작으면 에러 방지
      newInventory[partId] = Math.max(0, quantity);
    }

    // 3. Gist에 업데이트된 데이터를 저장합니다.
    try {
      const payload = {
        files: {
          [INVENTORY_FILE_NAME]: {
            content: JSON.stringify(newInventory, null, 2),
          },
        },
      };

      const config = {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      };

      // Gist API를 사용하여 PATCH 요청으로 업데이트합니다.
      await axios.patch(GIST_URL, payload, config);
      
      return newInventory; // 업데이트된 전체 재고 데이터 반환
    } catch (error) {
      console.error('Gist 재고 데이터 업데이트 실패:', error.response?.data || error.message);
      throw new Error('재고 데이터 서버 업데이트 실패');
    }
  }
}

export const inventoryService = new InventoryService();
