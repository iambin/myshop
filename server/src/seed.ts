import { db, initSchema } from "./db.js";

initSchema();

const categories = ["電子", "服飾", "家居廚房", "圖書", "運動"];

const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
const insertProduct = db.prepare(`
  INSERT INTO products (name, description, specs, price, image_url, stock, category_id)
  VALUES (@name, @description, @specs, @price, @image_url, @stock, @category_id)
`);

db.prepare("DELETE FROM products").run();
db.prepare("DELETE FROM categories").run();
db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('products','categories')").run();

const categoryIds = new Map<string, number>();
for (const name of categories) {
  const { lastInsertRowid } = insertCategory.run(name);
  categoryIds.set(name, Number(lastInsertRowid));
}

// Deterministic pseudo-random generator so seeds are reproducible
let seedState = 42;
function rand(max: number): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState % max;
}

type Template = { prefix: string; desc: string };
const templates: Record<string, Template[]> = {
  電子: [
    { prefix: "無線藍牙耳機", desc: "藍牙降噪耳機，續航長達 24 小時，配戴舒適。" },
    { prefix: "智慧手錶", desc: "內建心率監測與 GPS，全方位健身追蹤。" },
    { prefix: "USB-C 擴充基座", desc: "七合一擴充基座，支援 HDMI、乙太網路與快速充電。" },
    { prefix: "機械鍵盤", desc: "熱插拔軸體機械鍵盤，RGB 背光可自訂。" },
    { prefix: "行動電源", desc: "20000mAh 大容量，雙 USB-C 快速充電輸出。" },
    { prefix: "視訊攝影機", desc: "1080p HD 網路攝影機，自動對焦並內建麥克風。" },
    { prefix: "藍牙喇叭", desc: "防水便攜設計，低音渾厚，戶外派對首選。" },
    { prefix: "螢幕掛燈", desc: "螢幕上方掛燈，色溫亮度皆可調整，護眼舒適。" },
  ],
  服飾: [
    { prefix: "純棉 T 恤", desc: "柔親膚透氣純棉材質，版型合身，預縮處理不變形。" },
    { prefix: "丹寧外套", desc: "經典丹寧外套，鈕扣開合附胸前口袋。" },
    { prefix: "跑步短褲", desc: "輕量排汗短褲，內襯透氣網布，運動必備。" },
    { prefix: "連帽衛衣", desc: "刷毛內裡連帽衛衣，附袋鼠口袋，保暖有型。" },
    { prefix: "休閒長褲", desc: "彈性斜紋棉布休閒褲，修身剪裁行動自如。" },
    { prefix: "棒球帽", desc: "可調式純棉棒球帽，刺繡logo簡約百搭。" },
    { prefix: "羊毛針織衫", desc: "美麗諾羊毛圓領圓領針織衫，輕盈保暖不起毛球。" },
    { prefix: "防雨外套", desc: "可收納防水雨衣，全壓膠車縫，附連帽設計。" },
  ],
  家居廚房: [
    { prefix: "陶瓷馬克杯組", desc: "四件組石器馬克杯，可微波可洗碗。" },
    { prefix: "不沾平底鍋", desc: "28 公分不沾鍋，IH 電磁爐相容，煎煮都好用。" },
    { prefix: "抱枕套", desc: "絨布抱枕套，隱藏式拉鍊，45x45 公分。" },
    { prefix: "桌面收納盒", desc: "竹製桌上收納盒，含抽屜，文具整齊好分類。" },
    { prefix: "電熱水壺", desc: "1.7 公升不鏽鋼快煮壺，具乾燒自動斷電保護。" },
    { prefix: "棉編收納籃", desc: "手工棉線編織收納籃，三件組可堆疊。" },
    { prefix: "胡桃木砧板", desc: "端面紋理胡桃木砧板，附導汁槽。" },
    { prefix: "LED 檯燈", desc: "可調光 LED 檯燈，附 USB 充電插座。" },
  ],
  圖書: [
    { prefix: "寂靜森林", desc: "以太平洋西北荒野為背景的懸疑推理小說。" },
    { prefix: "廚房基本功", desc: "圖解家常食譜書，收錄 100 道必學料理。" },
    { prefix: "深度工作習慣", desc: "職場專注力與生產力的實用指南。" },
    { prefix: "星際繪圖師", desc: "橫跨星系、描繪文明末日的科幻史詩。" },
    { prefix: "家庭園藝手冊", desc: "逐季解說的家庭種菜指南，從播種到採收。" },
    { prefix: "地圖的歷史", desc: "豐富圖文，帶你看懂製圖學千年演進。" },
    { prefix: "靜心晨間筆記", desc: "每日一問引導書寫，練習反思與感恩。" },
    { prefix: "快速學會吉他", desc: "吉他初學教材，附線上教學影片。" },
  ],
  運動: [
    { prefix: "瑜珈墊", desc: "6mm 防滑瑜珈墊，附體位線與揹帶。" },
    { prefix: "可調啞鈴組", desc: "單支 2 至 20 公斤可調啞鈴，居家重訓好選擇。" },
    { prefix: "自行車安全帽", desc: "一體成型帽體，18 個通風孔，附尾燈。" },
    { prefix: "足球", desc: "5 號車縫足球，室內外場地皆適用。" },
    { prefix: "彈力帶組", desc: "五條不同阻力乳膠彈力帶，附門錨配件。" },
    { prefix: "跳繩", desc: "軸承高速跳繩，長度可調，訓練心肺。" },
    { prefix: "露營帳篷", desc: "兩人圓頂帳篷，防水外帳，五分鐘快速搭設。" },
    { prefix: "保溫水瓶", desc: "不鏽鋼真空保溫瓶，保冷長達 24 小時。" },
  ],
};

interface NewProduct {
  name: string;
  description: string;
  specs: string;
  price: number;
  image_url: string;
  stock: number;
  category_id: number;
}

const rows: NewProduct[] = [];
for (const categoryName of categories) {
  const categoryId = categoryIds.get(categoryName)!;
  for (let i = 0; i < 8; i++) {
    const t = templates[categoryName][i];
    const variant = ["", " Pro", " Plus", " Mini"][i % 4];
    const name = `${t.prefix}${variant}`;
    rows.push({
      name,
      description: t.desc,
      specs: [
        `品名：${name}`,
        `產地：台灣`,
        `保固：一年`,
        `包裝：一般彩盒裝`,
      ].join("\n"),
      price: 5 + rand(990),
      image_url: `https://picsum.photos/seed/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}/600/600`,
      stock: 5 + rand(95),
      category_id: categoryId,
    });
  }
}

db.transaction(() => {
  for (const row of rows) insertProduct.run(row);
})();

console.log(`Seeded ${categories.length} categories and ${rows.length} products.`);
