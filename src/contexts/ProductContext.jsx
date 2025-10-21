import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo
} from "react";
import { sortBOMByMaterialRule } from "../utils/materialSort";
import { 
  loadAdminPrices, 
  getEffectivePrice as utilGetEffectivePrice, 
  generatePartId,
  loadExtraOptionsPrices  // ✅ 추가
} from '../utils/unifiedPriceManager';

const ProductContext = createContext();

const formTypeRacks = ["경량랙", "중량랙", "파렛트랙", "파렛트랙 철판형"];

// 하이랙 고정 높이
const HIGH_RACK_HEIGHTS = ["150","200","250"];

const EXTRA_OPTIONS = {
  파렛트랙: { height: ["H4500","H5000","H5500","H6000"] },
  "파렛트랙 철판형": {
    height: ["1500","2000","2500","3000","3500","4000","H4500","H5000","H5500","H6000"],
    size: ["2080x800","2080x1000"]
  },
  하이랙: { size:["45x150"], level:["5단","6단"] },
  스텐랙: { level:["5단","6단"], height:["210"] },
  경량랙: { height:["H750"] }
};

const COMMON_LEVELS = ["2단","3단","4단","5단","6단"];
export const colorLabelMap = { "200kg":"270kg", "350kg":"450kg", "700kg":"600kg" };

const parseSizeKey=(s="")=>{
  const m=String(s).replace(/\s+/g,"").match(/W?(\d+)\s*[xX]\s*D?(\d+)/);
  return m?{a:Number(m[1]),b:Number(m[2])}:null;
};
const sortSizes=(arr=[])=>[...new Set(arr)].sort((A,B)=>{
  const a=parseSizeKey(A),b=parseSizeKey(B);
  if(a&&b){ if(a.a!==b.a)return a.a-b.a; if(a.b!==b.b)return a.b-b.b; }
  return String(A).localeCompare(String(B),"ko");
});
const parseNum=(s="")=>{
  const m=String(s).match(/\d+/);
  return m?Number(m[0]):Number.POSITIVE_INFINITY;
};
const sortHeights=(arr=[])=>[...new Set(arr)].sort((a,b)=>parseNum(a)-parseNum(b));
const sortLevels=(arr=[])=>[...new Set(arr)].sort((a,b)=>parseNum(a)-parseNum(b));

// const HIGHRACK_600_ALIAS_VIEW_FROM_DATA = { "80x146":"80x108", "80x206":"80x150" };
// const HIGHRACK_600_ALIAS_DATA_FROM_VIEW = { "80x108":"80x146", "80x150":"80x206" };

const parseHeightMm = (h)=>Number(String(h||"").replace(/[^\d]/g,""))||0;
const parseLevel=(levelStr,rackType)=>{
  if(!levelStr) return 1;
  if(rackType==="파렛트랙 철판형"){
    const m=String(levelStr).match(/L?(\d+)/); return m?parseInt(m[1]):1;
  } else {
    const m=String(levelStr).match(/(\d+)/); return m?parseInt(m[1]):1;
  }
};

const parseWD=(size="")=>{
  const m=String(size).replace(/\s+/g,"").match(/W?(\d+)\s*[xX]\s*D?(\d+)/);
  return m?{w:Number(m[1]),d:Number(m[2])}:{w:null,d:null};
};

const calcPalletIronShelfPerLevel=(size)=>{
  const {w}=parseWD(size);
  if(w===1380) return 2;
  if(w===2080) return 3;
  if(w===2580) return 4;
  return 1;
};
const calcHighRackShelfPerLevel=(size)=>{
  const {d}=parseWD(size);
  if(d===108) return 1;
  if(d===150||d===200) return 2;
  return 1;
};

// 브레싱볼트 규칙
function calcBracingBoltCount(heightRaw, isConn, qty) {
  let heightMm = parseHeightMm(heightRaw);
  const baseHeight = 1500;
  let perUnit = 10 + Math.max(0, Math.floor((heightMm-baseHeight)/500))*2;
  if(isConn) perUnit = Math.floor(perUnit/2);
  return perUnit * qty;
}

// 브러싱고무는 기둥 갯수와 동일
function calcBrushingRubberCount(postQty) {
  return postQty;
}

const extractWeightOnly = (color="")=>{
  const m = String(color).match(/(\d{2,4}kg)/);
  return m?m[1]:"";
};

const normalizePartName=(name="")=>{
  return name.replace(/브레싱고무/g,"브러싱고무");
};

const applyAdminEditPrice = (item) => {
  try {
    const stored = localStorage.getItem('admin_edit_prices') || '{}';
    const priceData = JSON.parse(stored);
    const partId = generatePartId(item); // ✅ import한 함수 사용
    const adminPrice = priceData[partId];
    
    console.log(`🔍 부품 ${item.name} (ID: ${partId}) 관리자 단가 확인:`, adminPrice);
    
    if (adminPrice && adminPrice.price > 0) {
      console.log(`✅ 관리자 단가 적용: ${item.name} ${adminPrice.price}원`);
      return {
        ...item,
        unitPrice: adminPrice.price,
        totalPrice: adminPrice.price * (Number(item.quantity) || 0),
        hasAdminPrice: true,
        originalUnitPrice: item.unitPrice
      };
    }
  } catch (error) {
    console.error('관리자 단가 적용 실패:', error);
  }
  return item;
};

const ensureSpecification=(row,ctx={})=>{
  if(!row) return row;
  const {size,height,weight}=ctx;
  row.name = normalizePartName(row.name||"");
  const weightOnly = weight ? extractWeightOnly(weight) : "";
  if(!row.specification || !row.specification.trim()){
    const nm=row.name||"";
    if(/안전좌|안전핀/.test(nm) && row.rackType && row.rackType!=="하이랙" && !/파렛트랙/.test(nm)){
      row.specification=row.rackType;
    }
    if(/브러싱고무|브레싱고무|브레싱볼트|앙카볼트/.test(nm)){
      row.specification="";
    }
    else if(/(수평|경사)브레?싱/.test(nm)){
      const {d}=parseWD(size||"");
      row.specification=d?`${d}`:"";
    }
    else if(/기둥\(/.test(nm)&&height) row.specification=`높이 ${height}${weightOnly?` ${weightOnly}`:""}`;
    else if(/로드빔\(/.test(nm)){
      const m=nm.match(/\((\d+)\)/); if(m) row.specification=`${m[1]}${weightOnly?` ${weightOnly}`:""}`;
    } else if(/타이빔\(/.test(nm)){
      const m=nm.match(/\((\d+)\)/); if(m) row.specification=`${m[1]}${weightOnly?` ${weightOnly}`:""}`;
    } else if(/선반\(/.test(nm)){
      row.specification=`사이즈 ${size||""}${weightOnly?` ${weightOnly}`:""}`;
    } else if(/받침\(상\)\(/.test(nm)||/받침\(하\)\(/.test(nm)){
      const {d}=parseWD(size||""); row.specification=row.specification || (d?`D${d}`:"");
    }
    else if(/안전핀/.test(nm)&&(/파렛트랙/.test(nm)||/파렛트랙 철판형/.test(nm))){
      row.specification="안전핀";
    }
    else if(/브레싱/.test(nm)){
      const {d}=parseWD(size||"");
      row.specification=d?`${d}`:"";
    }
    else if(!row.specification && size){
      row.specification=`사이즈 ${size}${weightOnly?` ${weightOnly}`:""}`;
    }
  } else {
    if(weightOnly && row.rackType==="하이랙" && !row.specification.includes(weightOnly)){
      row.specification=`${row.specification} ${weightOnly}`;
    }
  }
  return row;
};

export const ProductProvider=({children})=>{
  const [data,setData]=useState({});
  const [bomData,setBomData]=useState({});
  const [extraProducts,setExtraProducts]=useState({});
  const [loading,setLoading]=useState(true);
  const [allOptions,setAllOptions]=useState({types:[]});
  const [availableOptions,setAvailableOptions]=useState({});
  const [selectedType,setSelectedType]=useState("");
  const [selectedOptions,setSelectedOptions]=useState({});
  const [quantity,setQuantity]=useState("");
  const [customPrice,setCustomPrice]=useState(0);
  const [applyRate,setApplyRate]=useState(100);
  const [currentPrice,setCurrentPrice]=useState(0);
  const [currentBOM,setCurrentBOM]=useState([]);
  const [cart,setCart]=useState([]);
  const [cartBOM,setCartBOM]=useState([]);
  const [cartTotal,setCartTotal]=useState(0);
  const [extraOptionsSel,setExtraOptionsSel]=useState([]);
  const [customMaterials,setCustomMaterials]=useState([]);
  
  // ✅ 관리자 단가 변경 감지를 위한 상태 추가
  const [adminPricesVersion, setAdminPricesVersion] = useState(0);

  // ✅ 관리자 단가 변경 이벤트 리스너 추가
  useEffect(() => {
    const handleAdminPriceChange = () => {
      console.log('ProductContext: 관리자 단가 변경 감지, 가격 재계산 트리거');
      setAdminPricesVersion(prev => prev + 1);
    };

    const handleSystemRestore = () => {
      console.log('ProductContext: 시스템 데이터 복원 감지, 가격 재계산 트리거');
      setAdminPricesVersion(prev => prev + 1);
    };

    // ✅ 추가: 추가옵션 가격 변경 이벤트 리스너
    const handleExtraOptionsPriceChange = () => {
      console.log('ProductContext: 추가옵션 가격 변경 감지, 가격 재계산 트리거');
      setAdminPricesVersion(prev => prev + 1);
    };

    window.addEventListener('adminPriceChanged', handleAdminPriceChange);
    window.addEventListener('systemDataRestored', handleSystemRestore);
    window.addEventListener('extraOptionsPriceChanged', handleExtraOptionsPriceChange); // ✅ 추가
    
    return () => {
      window.removeEventListener('adminPriceChanged', handleAdminPriceChange);
      window.removeEventListener('systemDataRestored', handleSystemRestore);
      window.removeEventListener('extraOptionsPriceChanged', handleExtraOptionsPriceChange); // ✅ 추가
    };
  }, []);

  // ✅ getEffectivePrice 함수를 먼저 정의하고 adminPricesVersion을 의존성에 추가
  const getEffectivePrice = useCallback((item) => {
    try {
      return utilGetEffectivePrice(item);
    } catch (error) {
      console.warn('unifiedPriceManager getEffectivePrice 호출 실패, 기본 단가 사용:', error);
      return Number(item.unitPrice) || 0;
    }
  }, [adminPricesVersion]); // ✅ adminPricesVersion 의존성 추가

  const addCustomMaterial=(name,price)=>{
    if(!String(name).trim()||!(Number(price)>0)) return;
    setCustomMaterials(prev=>[...prev,{id:`cm-${Date.now()}-${prev.length}`,name:String(name),price:Number(price)}]);
  };
  const removeCustomMaterial=(id)=>setCustomMaterials(prev=>prev.filter(m=>m.id!==id));
  const clearCustomMaterials=()=>setCustomMaterials([]);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const dj=await (await fetch("./data.json")).json();
        const bj=await (await fetch("./bom_data.json")).json();
        const ejRaw=await (await fetch("./extra_options.json")).json();
        setData(dj); setBomData(bj);
        const canonical=["경량랙","중량랙","파렛트랙","파렛트랙 철판형","하이랙","스텐랙"];
        const fromData=Object.keys(dj||{});
        const types=canonical.filter(t=>fromData.includes(t));
        const leftovers=fromData.filter(t=>!types.includes(t));
        setAllOptions({types:[...types,...leftovers]});
        const ej={...(ejRaw||{})};
        canonical.forEach(t=>{ if(!ej[t]) ej[t]={}; });
        setExtraProducts(ej);
      }catch(e){ console.error("데이터 로드 실패",e); setAllOptions({types:[]}); }
      finally{ setLoading(false); }
    })();
  },[]);

  useEffect(()=>{
    if(!selectedType){ setAvailableOptions({}); return; }
    if(formTypeRacks.includes(selectedType)){
      const bd=bomData[selectedType]||{};
      const next={size:[],height:[],level:[],formType:[]};
      const sizesFromData=Object.keys(bd||{});
      const extraSizes=EXTRA_OPTIONS[selectedType]?.size||[];
      next.size=sortSizes([...sizesFromData,...extraSizes]);
      if(selectedOptions.size){
        const heightsFromData=Object.keys(bd[selectedOptions.size]||{});
        next.height=sortHeights([...heightsFromData,...(EXTRA_OPTIONS[selectedType]?.height||[])]);
      } else {
        next.height=sortHeights([...(EXTRA_OPTIONS[selectedType]?.height||[])]);
      }
      if(selectedOptions.size && selectedOptions.height){
        if(selectedType==="경량랙"&&selectedOptions.height==="H750"){
          const lk=Object.keys(bd[selectedOptions.size]?.["H900"]||{});
            next.level=lk.length?lk:[];
          if(selectedOptions.level){
            const fm=bd[selectedOptions.size]?.["H900"]?.[selectedOptions.level]||{};
            next.formType=Object.keys(fm).length?Object.keys(fm):["독립형","연결형"];
          }
        } else {
          const levelKeys=Object.keys(bd[selectedOptions.size]?.[selectedOptions.height]||{})||[];
          next.level=levelKeys.length?sortLevels(levelKeys):["L1","L2","L3","L4","L5","L6"];
          if(selectedOptions.level){
            const fm=bd[selectedOptions.size]?.[selectedOptions.height]?.[selectedOptions.level]||{};
            next.formType=Object.keys(fm).length?Object.keys(fm):["독립형","연결형"];
          }
        }
      }
      setAvailableOptions(next);
      return;
    }
    if(selectedType==="하이랙" && data?.하이랙){
      const rd=data["하이랙"];
      const opts={ color: rd["색상"] || [] };
      if(selectedOptions.color){
        const color=selectedOptions.color;
        const weightOnly = extractWeightOnly(color);
        const hide45 = ["450kg","600kg","700kg"].includes(weightOnly);
        const isHeaviest = /(600kg|700kg)$/.test(color);
        const rawSizes=Object.keys(rd["기본가격"]?.[color]||{});
        const sizeViewList = rawSizes; // ALIAS 매핑 제거
        // const sizeViewList=rawSizes.map(s=>
        //   isHeaviest && HIGHRACK_600_ALIAS_VIEW_FROM_DATA[s]
        //     ? HIGHRACK_600_ALIAS_VIEW_FROM_DATA[s]
        //     : s
        // );
        let baseSizes = hide45
          ? sizeViewList.filter(s=>s!=="45x150")
          : sizeViewList;
        (EXTRA_OPTIONS["하이랙"]?.size||[]).forEach(s=>{
            if(hide45 && s==="45x150") return;
          if(!baseSizes.includes(s)) baseSizes.push(s);
        });
        if(isHeaviest && !baseSizes.includes("80x200")) baseSizes.push("80x200");
        opts.size=sortSizes(baseSizes);
        if(selectedOptions.size){
          opts.height=[...HIGH_RACK_HEIGHTS];
          if(selectedOptions.height && !opts.height.includes(selectedOptions.height)){
            setSelectedOptions(prev=>({...prev,height:"",level:""}));
          }
          if(selectedOptions.height){
            const sizeKey = selectedOptions.size; // ALIAS 매핑 제거
            // const sizeKey = isHeaviest
            //   ? HIGHRACK_600_ALIAS_DATA_FROM_VIEW[selectedOptions.size]||selectedOptions.size
            //   : selectedOptions.size;
            const levelKeys = Object.keys(
              rd["기본가격"]?.[color]?.[sizeKey]?.[selectedOptions.height] || {}
            );
            const full = ["1단","2단","3단","4단","5단","6단"];
            let merged = levelKeys.length ? levelKeys : full;
            (EXTRA_OPTIONS["하이랙"]?.level||[]).forEach(l=>{
              if(!merged.includes(l)) merged.push(l);
            });
            if(isHeaviest){
              full.forEach(l=>{ if(!merged.includes(l)) merged.push(l); });
            }
            opts.level=sortLevels(merged);
            if(selectedOptions.level && !opts.level.includes(selectedOptions.level)){
              setSelectedOptions(prev=>({...prev,level:""}));
            }
          }
        }
      }
      opts.formType=["독립형","연결형"];
      setAvailableOptions(opts);
      return;
    }
    if(selectedType==="스텐랙" && data?.스텐랙){
      const rd=data["스텐랙"];
      const opts={ size: sortSizes(Object.keys(rd["기본가격"]||{})) };
      if(selectedOptions.size){
        const heightsFromData=Object.keys(rd["기본가격"][selectedOptions.size]||{});
        opts.height=sortHeights([...heightsFromData,(EXTRA_OPTIONS["스텐랙"]?.height||[])]);
      }
      if(selectedOptions.size && selectedOptions.height){
        const levelsFromData=Object.keys(
          rd["기본가격"]?.[selectedOptions.size]?.[selectedOptions.height]||{}
        );
        opts.level=sortLevels([
          ...levelsFromData,
          ...(EXTRA_OPTIONS["스텐랙"]?.level||[]),
          ...COMMON_LEVELS,
        ]);
      }
      opts.version=["V1"];
      setAvailableOptions(opts);
      return;
    }
    setAvailableOptions({});
  },[selectedType,selectedOptions,data,bomData]);

  const sumComponents=(arr=[])=>arr.reduce((s,c)=>{
    const tp=Number(c.total_price)||0;
    const up=Number(c.unit_price)||0;
    const q=Number(c.quantity)||0;
    return s+(tp>0?tp:up*q);
  },0);

  // ✅ 수정된 calculatePrice 함수
  const calculatePrice = useCallback(() => {
    console.log('🔄 calculatePrice 함수 호출됨');
    if (!selectedType || quantity <= 0) return 0;
    if (selectedType === "하이랙" && !selectedOptions.formType) return 0;
    
    if (customPrice > 0) return Math.round(customPrice * quantity * (applyRate / 100));
    
    let basePrice = 0;
    let bomPrice = 0;
    let basicPrice = 0;
  
    if (formTypeRacks.includes(selectedType)) {
      const { size, height: heightRaw, level: levelRaw, formType } = selectedOptions;
      const height = selectedType === "경량랙" && heightRaw === "H750" ? "H900" : heightRaw;
      
      // ✅ BOM 부품 단가 합산 가격 계산 (추가옵션 포함)
      const bom = calculateCurrentBOM();
      console.log('🔍 calculatePrice: BOM 데이터 확인', bom);
      
      if (bom && bom.length > 0) {
        bomPrice = bom.reduce((sum, item) => {
          const effectivePrice = getEffectivePrice(item);
          const quantity = Number(item.quantity) || 0;
          const itemTotal = effectivePrice * quantity;
          
          console.log(`  📦 ${item.name}: ${effectivePrice}원 × ${quantity}개 = ${itemTotal}원`);
          
          return sum + itemTotal;
        }, 0);
        console.log(`💰 BOM 총 가격 계산 (추가옵션 포함): ${bomPrice}원 (${bom.length}개 부품)`);
      }
      
      // 기본가격(pData) 조회 (백업용)
      let pData;
      if (selectedType === "파렛트랙 철판형") {
        const hKey = String(height || "").replace(/^H/i, "");
        const lKey = (String(levelRaw || "").replace(/^L/i, "").replace(/^\s*$/, "0")) + "단";
        pData = data?.[selectedType]?.["기본가격"]?.[formType]?.[size]?.[hKey]?.[lKey];
      } else {
        pData = data?.[selectedType]?.["기본가격"]?.[size]?.[height]?.[levelRaw]?.[formType];
      }
      
      if (pData) basicPrice = Number(pData);
      
      // ✅ 수정: BOM 가격은 이미 수량이 적용되어 있으므로 그대로 사용
      if (bomPrice > 0) {
        basePrice = bomPrice; // ← 수량 곱하지 않음!
        console.log(`✅ BOM 가격 사용 (추가옵션 포함): ${basePrice}원`);
      } else if (basicPrice > 0) {
        basePrice = basicPrice * (Number(quantity) || 0); // 기본가격만 수량 곱하기
        console.log(`📋 기본가격 사용: ${basePrice}원`);
      }
      
    } else if (selectedType === "스텐랙") {
      const bom = calculateCurrentBOM();
      
      if (bom && bom.length > 0) {
        bomPrice = bom.reduce((sum, item) => {
          const effectivePrice = getEffectivePrice(item);
          const quantity = Number(item.quantity) || 0;
          return sum + (effectivePrice * quantity);
        }, 0);
      }
      
      // ✅ 수정: BOM 가격은 이미 수량이 적용되어 있으므로 그대로 사용
      if (bomPrice > 0) {
        basePrice = bomPrice; // ← 수량 곱하지 않음!
      } else {
        const p = data["스텐랙"]["기본가격"]?.[selectedOptions.size]?.[selectedOptions.height]?.[selectedOptions.level];
        if (p) basePrice = p * quantity; // 기본가격만 수량 곱하기
      }
    } else if (selectedType === "하이랙") {
      const bom = calculateCurrentBOM();
      
      if (bom && bom.length > 0) {
        bomPrice = bom.reduce((sum, item) => {
          const effectivePrice = getEffectivePrice(item);
          const quantity = Number(item.quantity) || 0;
          return sum + (effectivePrice * quantity);
        }, 0);
      }
      
      // ✅ 수정: BOM 가격은 이미 수량이 적용되어 있으므로 그대로 사용
      if (bomPrice > 0) {
        basePrice = bomPrice; // ← 수량 곱하지 않음!
      } else {
        const { size, color, height, level, formType } = selectedOptions;
        if (size && color && height && level && formType) {
          const isHeaviest = /600kg$/.test(color) || /700kg$/.test(color);
          const dataSizeKey = size; // ALIAS 매핑 제거
          // const dataSizeKey = isHeaviest
          //   ? HIGHRACK_600_ALIAS_DATA_FROM_VIEW[size] || size
          //   : size;
          const p = data["하이랙"]["기본가격"]?.[color]?.[dataSizeKey]?.[height]?.[level];
          if (p) basePrice = p * quantity; // 기본가격만 수량 곱하기
        }
      }
    }
  
    // 커스텀 자재 가격 (경량랙만 - 이것은 BOM에 포함되지 않으므로 별도 계산)
    const customExtra = selectedType === "경량랙"
      ? customMaterials.reduce((s, m) => s + (Number(m.price) || 0), 0)
      : 0;
  
    // ✅ 최종 가격: basePrice (BOM 기반, 추가옵션 포함) + customExtra (경량랙 전용)
    const finalPrice = Math.round((basePrice + customExtra) * (applyRate / 100));
    
    console.log(`💵 최종 가격: ${finalPrice}원 (BOM기반: ${basePrice}, 커스텀: ${customExtra}, 적용률: ${applyRate}%)`);
    
    return finalPrice;
  }, [selectedType, selectedOptions, quantity, customPrice, applyRate, data, bomData, extraProducts, extraOptionsSel, customMaterials, getEffectivePrice, adminPricesVersion]);
    
  const makeLightRackH750BOM = () => {
    const q = Number(quantity) || 1;
    const sz = selectedOptions.size || "";
    const ht = "H750";
    const form = selectedOptions.formType || "독립형";
    const level = parseInt((selectedOptions.level || "").replace(/[^\d]/g, "")) || 0;
    const sizeMatch = sz.match(/W?(\d+)[xX]D?(\d+)/i) || [];
    const W_num = sizeMatch[1] || "";
    const D_num = sizeMatch[2] || "";

    const base = [
      { rackType: selectedType, size: sz, name: `기둥(${ht})`, specification: `높이 ${ht}`, quantity: (form === "연결형" ? 2 : 4) * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `받침(상)(${D_num})`, specification: `D${D_num}`, quantity: (form === "연결형" ? 2 : 4) * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `받침(하)(${D_num})`, specification: `D${D_num}`, quantity: (form === "연결형" ? 2 : 4) * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `연결대(${W_num})`, specification: `W${W_num}`, quantity: level * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `선반(${W_num})`, specification: `사이즈 W${W_num}xD${D_num}`, quantity: level * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `안전좌(${selectedType})`, specification: selectedType, quantity: level * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `안전핀(${selectedType})`, specification: selectedType, quantity: level * q, unitPrice: 0, totalPrice: 0 },
    ];

    const baseWithAdminPrices = base.map(applyAdminEditPrice);
    return sortBOMByMaterialRule([...baseWithAdminPrices, ...makeExtraOptionBOM()]);
  };

  const makeExtraOptionBOM = () => {
    const extraBOM = [];
    const extraOptionsPrices = loadExtraOptionsPrices(); // ✅ 추가
    
    (Object.values(extraProducts?.[selectedType] || {})).forEach(arr => {
      if (Array.isArray(arr)) {
        arr.forEach(opt => {
          if (extraOptionsSel.includes(opt.id)) {
            // ✅ 수정된 가격 우선 사용, 없으면 기본 가격 사용
            const effectivePrice = extraOptionsPrices[opt.id]?.price || Number(opt.price) || 0;
            
            extraBOM.push({
              rackType: selectedType,
              size: selectedOptions.size || "",
              name: opt.name,
              specification: opt.specification || "",
              note: opt.note || "",
              quantity: Number(opt.quantity) || 1,
              unitPrice: effectivePrice,      // ✅ 수정된 가격 사용
              totalPrice: effectivePrice      // ✅ 수정된 가격 사용
            });
          }
        });
      }
    });
    return extraBOM;
  };

  const appendCommonHardwareIfMissing = (base, qty) => {
    const names = new Set(base.map(b => normalizePartName(b.name)));
    const pushIfAbsent = (name, quantity) => {
      const normalized = normalizePartName(name);
      if (!names.has(normalized)) {
        base.push({
          rackType: selectedType,
          size: selectedOptions.size || "",
          name,
          specification: "",
          note: "",
          quantity,
          unitPrice: 0,
          totalPrice: 0
        });
        names.add(normalized);
      }
    };
    if(selectedType==="파렛트랙"||selectedType==="파렛트랙 철판형"){
      const isConn=selectedOptions.formType==="연결형";
      const h=selectedOptions.height;
      const qtyNum = Number(qty) || 1;
      const postQty = isConn ? 2 * qtyNum : 4 * qtyNum;
      const braceBolt = calcBracingBoltCount(h, isConn, qtyNum);
      const rubber = calcBrushingRubberCount(postQty);
      const heightMm=parseHeightMm(h);
      const baseHeight=1500;
      const heightStep=500;
      const baseDiagonal=isConn?2:4;
      const additionalSteps=Math.max(0,Math.floor((heightMm-baseHeight)/heightStep));
      const additionalDiagonal=(isConn?1:2)*additionalSteps;
      const diagonal=(baseDiagonal+additionalDiagonal)*qtyNum;
      const horizontal=(isConn?2:4)*qtyNum;
      const anchor=(isConn?2:4)*qtyNum;
      pushIfAbsent("수평브레싱",horizontal);
      pushIfAbsent("경사브레싱",diagonal);
      pushIfAbsent("앙카볼트",anchor);
      pushIfAbsent("브레싱볼트",braceBolt);
      pushIfAbsent("브러싱고무",rubber);
    }
  };

const getFallbackBOM = () => {
  if (selectedType === "파렛트랙" || selectedType === "파렛트랙 철판형") {
    const lvl = parseLevel(selectedOptions.level, selectedType);
    const sz = selectedOptions.size || "";
    const ht = selectedOptions.height || "";
    const form = selectedOptions.formType || "독립형";
    const qty = Number(quantity) || 1;
    const { w, d } = parseWD(sz);
    const tieSpec = d != null ? String(d) : `규격 ${sz}`;
    const loadSpec = w != null ? String(Math.floor(w / 100) * 100) : `규격 ${sz}`;
    const base = [
      { rackType: selectedType, size: sz, name: `기둥(${ht})`, specification: `높이 ${ht}`, quantity: (form === "연결형" ? 2 : 4) * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: `로드빔(${loadSpec})`, specification: loadSpec, quantity: 2 * lvl * qty, unitPrice: 0, totalPrice: 0 },
      ...(selectedType === "파렛트랙 철판형" ? [] : [
        { rackType: selectedType, size: sz, name: `타이빔(${tieSpec})`, specification: tieSpec, quantity: 2 * lvl * qty, unitPrice: 0, totalPrice: 0 },
      ]),
      { rackType: selectedType, size: sz, name: "안전핀(파렛트랙)", specification: "안전핀", quantity: 2 * lvl * 2 * qty, unitPrice: 0, totalPrice: 0 },
    ];
    if (selectedType === "파렛트랙 철판형") {
      const shelfPerLevel = calcPalletIronShelfPerLevel(sz);
      const frontNum = (selectedOptions.size || "").match(/\d+/);
      const frontNumVal = frontNum ? frontNum[0] : selectedOptions.size;
      base.push({
        rackType: selectedType, size: sz, name: `선반(${frontNumVal.trim()})`,
        specification: `사이즈 ${sz}`, quantity: shelfPerLevel * lvl * qty, unitPrice: 0, totalPrice: 0
      });
    }
    let filteredBase = base.filter(i => !i.name.includes("철판"));
    appendCommonHardwareIfMissing(filteredBase, qty);
    const filtered = [...filteredBase, ...makeExtraOptionBOM()]
      .filter(r => !/베이스볼트/.test(r.name))
      .map(r => ensureSpecification(r, { size: sz, height: ht, ...parseWD(sz) }));
    const filteredWithAdminPrices = filtered.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(filteredWithAdminPrices);
  }

  if (selectedType === "하이랙") {
    const qty = Number(quantity) || 1;
    const level = parseInt(selectedOptions.level) || 1;
    const size = selectedOptions.size || "";
    const color = selectedOptions.color || "";
    const heightValue = selectedOptions.height || "";
    const formType = selectedOptions.formType || "독립형";
    const shelfPerLevel = calcHighRackShelfPerLevel(size);
    const sizeMatch = String(size).replace(/\s+/g, "").match(/(\d+)[xX](\d+)/);
    const rodBeamNum = sizeMatch ? sizeMatch[2] : "";
    const shelfNum = sizeMatch ? sizeMatch[1] : "";
    const weightOnly = extractWeightOnly(color);

    const pillarQty = formType === "연결형" ? 2 * qty : 4 * qty;

    const list = [
      {
        rackType: selectedType,
        name: `기둥(${heightValue})`,
        specification: `높이 ${heightValue}${weightOnly ? ` ${weightOnly}` : ""}`,
        quantity: pillarQty,
        unitPrice: 0,
        totalPrice: 0
      },
      {
        rackType: selectedType,
        name: `로드빔(${rodBeamNum})`,
        specification: `${rodBeamNum}${weightOnly ? ` ${weightOnly}` : ""}`,
        quantity: 2 * level * qty,
        unitPrice: 0,
        totalPrice: 0
      },
      {
        rackType: selectedType,
        name: `선반(${shelfNum})`,
        specification: `사이즈 ${size}${weightOnly ? ` ${weightOnly}` : ""}`,
        quantity: shelfPerLevel * level * qty,
        unitPrice: 0,
        totalPrice: 0
      },
      ...makeExtraOptionBOM(),
    ].map(r => ensureSpecification(r, { size, height: heightValue, ...parseWD(size), weight: weightOnly }));
    const listWithAdminPrices = list.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(listWithAdminPrices.filter(r => !/베이스볼트/.test(r.name)));
  }

  if (selectedType === "스텐랙") {
    const heightValue = selectedOptions.height || "";
    const q = Number(quantity) || 1;
    const sz = selectedOptions.size || "";
    const sizeFront = (sz.split("x")[0]) || sz;
    const list = [
      { rackType: selectedType, name: `기둥(${heightValue})`, specification: `높이 ${heightValue}`, quantity: 4 * q, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, name: `선반(${sizeFront})`, specification: `사이즈 ${sz}`, quantity: (parseInt((selectedOptions.level || "").replace(/[^\d]/g, "")) || 0) * q, unitPrice: 0, totalPrice: 0 },
      ...makeExtraOptionBOM(),
    ].map(r => ensureSpecification(r, { size: sz, height: heightValue, ...parseWD(sz) }));
    const listWithAdminPrices = list.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(listWithAdminPrices.filter(r => !/베이스볼트/.test(r.name)));
  }

  const extraBOM = makeExtraOptionBOM()
    .filter(r => !/베이스볼트/.test(r.name))
    .map(r => ensureSpecification(r, { size: r.size }));
  return extraBOM.map(applyAdminEditPrice);
};
  
  // ✅ calculateCurrentBOM 함수에 adminPricesVersion 의존성 추가
  const calculateCurrentBOM=useCallback(()=> {
    if(!selectedType||quantity<=0) return [];
    if(selectedType==="하이랙" && !selectedOptions.formType) return [];
    if(selectedType==="파렛트랙"||selectedType==="파렛트랙 철판형"){
      const rec=bomData[selectedType]?.[selectedOptions.size]?.[selectedOptions.height]?.[selectedOptions.level]?.[selectedOptions.formType];
      if(rec?.components){
        const q=Number(quantity)||1;
        const sz=selectedOptions.size||"";
        const ht=selectedOptions.height||"";
        const lvl=parseLevel(selectedOptions.level,selectedType);
        const {w,d}=parseWD(sz);
        const hardwareNames=new Set(["수평브레싱","수평브래싱","경사브레싱","경사브래싱","앙카볼트","브레싱볼트","브러싱고무","브레싱고무","안전핀","베이스(안전좌)"]);
        const base=rec.components
          .filter(c=>!hardwareNames.has(normalizePartName(c.name)))
          .filter(c=>!(selectedType==="파렛트랙 철판형"&&c.name.includes("철판")))
          .filter(c=>!(selectedType==="파렛트랙 철판형"&&c.name.includes("타이빔")))
          .map(c=>{
            let nm=normalizePartName(c.name);
            let spec="";
            if(nm.includes("기둥")){ nm=`기둥(${ht})`; spec=`높이 ${ht}`; }
            else if(nm.includes("로드빔")){ nm=`로드빔(${w})`; spec=String(w); }
            else if(nm.includes("타이빔")){ nm=`타이빔(${d})`; spec=String(d); }
            else if(nm.includes("선반")){ nm=`선반(${w})`; spec=`사이즈 W${w}xD${d}`; }
            else if(nm.includes("안전좌")) return null;
            else if(nm.includes("안전핀")){ nm="안전핀(파렛트랙)"; spec="안전핀"; }
            else if(nm.includes("받침")){
              nm=nm.includes("상")?`받침(상)(${d})`:`받침(하)(${d})`; spec=`D${d}`;
            } else spec=c.specification??"";
            return {
              rackType:selectedType,size:sz,name:nm,specification:spec,note:c.note??"",
              quantity:(Number(c.quantity)||0)*q,
              unitPrice:Number(c.unit_price)||0,
              totalPrice:Number(c.total_price)>0?Number(c.total_price)*q:(Number(c.unit_price)||0)*(Number(c.quantity)||0)*q
            };
          }).filter(Boolean);
        if(selectedType==="파렛트랙 철판형"){
          const frontNumMatch=(sz||"").match(/\d+/);
          const frontNum=frontNumMatch?frontNumMatch[0]:sz;
          if(!base.some(p=>p.name.includes("선반("))){
            const shelfPerLevel=calcPalletIronShelfPerLevel(sz);
            base.push({
              rackType:selectedType,size:sz,name:`선반(${frontNum.trim()})`,
              specification:`사이즈 ${sz}`,quantity:shelfPerLevel*lvl*q,
              unitPrice:0,totalPrice:0
            });
          }
        }
        if(!base.some(b=>b.name.startsWith("안전핀"))){
          base.push({
            rackType:selectedType,size:sz,name:"안전핀(파렛트랙)",specification:"안전핀",
            note:"",quantity:2*lvl*2*q,unitPrice:0,totalPrice:0
          });
        }
        appendCommonHardwareIfMissing(base,q);
        const finalized=[...base,...makeExtraOptionBOM()]
          .filter(r=>!/베이스볼트/.test(r.name))
          .map(r=>ensureSpecification(r,{size:sz,height:ht,...parseWD(sz)}));
        const finalizedWithAdminPrices = finalized.map(applyAdminEditPrice);
        return sortBOMByMaterialRule(finalizedWithAdminPrices);
      }
      return getFallbackBOM();
    }
    if(selectedType==="하이랙"||selectedType==="스텐랙"){
      return getFallbackBOM();
    }
    if(["경량랙","중량랙"].includes(selectedType)){
      if(selectedType==="경량랙"&&selectedOptions.height==="H750") return makeLightRackH750BOM();
      const rec=bomData[selectedType]?.[selectedOptions.size]?.[selectedOptions.height]?.[selectedOptions.level]?.[selectedOptions.formType];
      const q=Number(quantity)||1;
      const sz=selectedOptions.size||"";
      const ht=selectedOptions.height||"";
      const sizeMatch=sz.match(/W?(\d+)[xX]D?(\d+)/i)||[];
      const W_num=sizeMatch[1]||"";
      const D_num=sizeMatch[2]||"";
      const base=(rec?.components||[]).map(c=>{
        let name=normalizePartName(c.name);
        let specification=c.specification??"";
        if(name.includes("기둥")){ name=`기둥(${ht})`; specification=`높이 ${ht}`; }
        else if(name.includes("받침")){ name=name.includes("상")?`받침(상)(${D_num})`:`받침(하)(${D_num})`; specification=`D${D_num}`; }
        else if(name.includes("연결대")){ name=`연결대(${W_num})`; specification=`W${W_num}`; }
        else if(name.includes("선반")){ name=`선반(${W_num})`; specification=`사이즈 W${W_num}xD${D_num}`; }
        else if(name.includes("안전좌")){ name=`안전좌(${selectedType})`; specification=selectedType; }
        else if(name.includes("안전핀")){ name=`안전핀(${selectedType})`; specification=selectedType; }
        else if(!specification && /\d/.test(name)){ specification=`사이즈 ${sz}`; }
        const row={
          rackType:selectedType,size:sz,name,specification,note:c.note??"",
          quantity:(Number(c.quantity)||0)*q,
          unitPrice:Number(c.unit_price)||0,
          totalPrice:Number(c.total_price)>0?Number(c.total_price)*q:(Number(c.unit_price)||0)*(Number(c.quantity)||0)*q
        };
        return ensureSpecification(row,{size:sz,height:ht,...parseWD(sz)});
      });
      const baseWithAdminPrices = base.map(applyAdminEditPrice);
      return sortBOMByMaterialRule(
        [...baseWithAdminPrices,...makeExtraOptionBOM()].filter(r=>!/베이스볼트/.test(r.name))
      );
    }
    const extraBOM = makeExtraOptionBOM()
      .filter(r=>!/베이스볼트/.test(r.name))
      .map(r=>ensureSpecification(r,{size:r.size}));
    return extraBOM.map(applyAdminEditPrice);
  },[selectedType,selectedOptions,quantity,customPrice,bomData,extraOptionsSel,extraProducts,customMaterials,adminPricesVersion]); // ✅ adminPricesVersion 의존성 추가

  const handleOptionChange=(k,v)=>{
    if(k==="type"){
      setSelectedType(v);
      setSelectedOptions({});
      setExtraOptionsSel([]);
      setQuantity("");
      setCustomPrice(0);
      clearCustomMaterials();
      return;
    }
    setSelectedOptions(prev=>({...prev,[k]:v}));
    if(["color","size","height","level","formType"].includes(k)) setCustomPrice(0);
  };
  const handleExtraOptionChange=(ids)=>{
    setExtraOptionsSel(Array.from(new Set(ids||[])).map(String));
  };

  const addToCart=()=>{
    if(!selectedType||quantity<=0) return;
    if(selectedType==="하이랙" && !selectedOptions.formType) return;
    setCart(prev=>[...prev,{
      id:`${Date.now()}`,
      type:selectedType,
      options:{...selectedOptions},
      extraOptions:[...extraOptionsSel],
      quantity,
      price:customPrice>0?customPrice:currentPrice,
      bom:calculateCurrentBOM(),
      displayName:[
        selectedType,
        selectedOptions.formType,
        selectedOptions.size,
        selectedOptions.height,
        selectedOptions.level,
        selectedOptions.color||""
      ].filter(Boolean).join(" "),
    }]);
  };
  const removeFromCart=id=>setCart(prev=>prev.filter(i=>i.id!==id));

  const updateCartItemQuantity=(id,nextQtyRaw)=>{
    setCart(prev=>prev.map(item=>{
      if(item.id!==id) return item;
      const nextQty=Math.max(1,parseInt(nextQtyRaw)||1);
      return {...item,quantity:nextQty};
    }));
  };

  const updateCartItemPriceDirect=(id,newPrice)=>{
    setCart(prev=>prev.map(item=>item.id===id?{...item,price:Number(newPrice)||0}:item));
  };

  // ✅ 수정된 cartBOMView - specification을 포함한 키로 그룹핑
  const cartBOMView = useMemo(() => {
    const bomMap = new Map();
    cart.forEach(item => {
      if (item.bom && Array.isArray(item.bom)) {
        item.bom.forEach(bomItem => {
          // ✅ specification을 포함한 고유 키 생성
          const key = `${bomItem.rackType}|${bomItem.size || ''}|${bomItem.name}|${bomItem.specification || ''}`;
          
          if (bomMap.has(key)) {
            const existing = bomMap.get(key);
            bomMap.set(key, {
              ...existing,
              quantity: existing.quantity + (bomItem.quantity || 0),
              totalPrice: existing.totalPrice + (bomItem.totalPrice || 0)
            });
          } else {
            bomMap.set(key, {
              ...bomItem,
              quantity: bomItem.quantity || 0,
              totalPrice: bomItem.totalPrice || 0,
              unitPrice: bomItem.unitPrice || bomItem.unit_price || 0
            });
          }
        });
      }
    });
    const result = Array.from(bomMap.values());
    return sortBOMByMaterialRule(result);
  }, [cart]);

  const cartTotalCalc=useMemo(()=>{
    return cart.reduce((sum,item)=>{
      const itemTotal=Number(item.price||0)*Number(item.quantity||0);
      return sum+itemTotal;
    },0);
  },[cart]);

  const cartBOMTotalCalc=useMemo(()=>{
    return cartBOMView.reduce((sum,bomItem)=>{
      // ✅ 효과적인 단가를 사용하여 BOM 총액 계산
      const effectivePrice = getEffectivePrice(bomItem);
      return sum + (effectivePrice * (Number(bomItem.quantity) || 0));
    },0);
  },[cartBOMView, getEffectivePrice]);

  const [totalBomQuantity,setTotalBomQuantity]=useState(0);

  // ✅ calculateCurrentBOM이 변경될 때마다 BOM 업데이트
  useEffect(()=>{
    const bom=calculateCurrentBOM();
    setCurrentBOM(bom);
    setTotalBomQuantity(bom.reduce((sum,item)=>sum+(Number(item.quantity)||0),0));
  },[calculateCurrentBOM]);

  // ✅ calculatePrice가 변경될 때마다 가격 업데이트 + 강제 재계산
  useEffect(()=>{
    const newPrice = calculatePrice();
    console.log(`🔄 가격 재계산: ${newPrice}원`);
    setCurrentPrice(newPrice);
  },[calculatePrice]);

  // ✅ 추가: 관리자 단가 변경 시 강제로 currentPrice 재계산
  useEffect(() => {
    const handlePriceChange = () => {
      console.log('🔥 관리자 단가 변경 감지 - 강제 가격 재계산');
      const newPrice = calculatePrice();
      console.log(`💰 새로 계산된 가격: ${newPrice}원`);
      setCurrentPrice(newPrice);
    };

    // ✅ 추가: 추가옵션 가격 변경 이벤트 리스너
    const handleExtraOptionsChange = () => {
      console.log('🔥 추가옵션 가격 변경 감지 - 강제 가격 재계산');
      const newPrice = calculatePrice();
      console.log(`💰 새로 계산된 가격: ${newPrice}원`);
      setCurrentPrice(newPrice);
    };
      
    const handleSystemRestore = () => {
      console.log('🔥 시스템 데이터 복원 감지 - 강제 가격 재계산');
      const newPrice = calculatePrice();
      console.log(`💰 새로 계산된 가격: ${newPrice}원`);
      setCurrentPrice(newPrice);
    };

    window.addEventListener('adminPriceChanged', handlePriceChange);
    window.addEventListener('systemDataRestored', handleSystemRestore);
    window.addEventListener('extraOptionsPriceChanged', handleExtraOptionsChange); // ✅ 추가
    
    return () => {
      window.removeEventListener('adminPriceChanged', handlePriceChange);
      window.removeEventListener('systemDataRestored', handleSystemRestore);
      window.removeEventListener('extraOptionsPriceChanged', handleExtraOptionsChange); // ✅ 추가
    };
  }, [calculatePrice]); // calculatePrice를 의존성에 추가

  useEffect(()=>{
    setCartBOM(cartBOMView);
    setCartTotal(cartTotalCalc);
  },[cartBOMView,cartTotalCalc]);

  const contextValue = {
    // 데이터
    loading,
    data,
    bomData,
    extraProducts,
    // 옵션 관련
    allOptions,
    availableOptions,
    selectedType,
    selectedOptions,
    quantity,
    customPrice,
    applyRate,
    // 계산된 값들
    currentPrice,
    currentBOM,
    totalBomQuantity,
    // 장바구니
    cart,
    cartBOM,
    cartBOMView,
    cartTotal,
    cartBOMTotalCalc,
    // 추가 옵션 & 커스텀 자재
    extraOptionsSel,
    customMaterials,
    // 기존에 있던 항목들 (누락된 것들)
    canAddItem: selectedType && quantity > 0,
    colorLabelMap,
    // 핸들러들
    setSelectedType,
    setSelectedOptions,
    handleOptionChange,
    handleExtraOptionChange,
    setQuantity,
    setCustomPrice,
    setApplyRate,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    updateCartItemPriceDirect,
    addCustomMaterial,
    removeCustomMaterial,
    clearCustomMaterials,
    setTotalBomQuantity,
    // ✅ getEffectivePrice 함수 노출
    getEffectivePrice
  };

  return (
    <ProductContext.Provider value={contextValue}>
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};
