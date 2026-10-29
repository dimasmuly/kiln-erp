/** Fictional master data for the demo company, PT Kiln Teknologi Distribusi. */

import type { Role } from "../src/server/auth/rbac";

export const DEMO_PASSWORD = "kiln-demo-2026";

export const DEMO_USERS: { name: string; email: string; role: Role }[] = [
  { name: "Rina Wijaya", email: "admin@kiln.test", role: "admin" },
  { name: "Dimas Pratama", email: "sales@kiln.test", role: "sales" },
  { name: "Sari Lestari", email: "purchasing@kiln.test", role: "purchasing" },
  { name: "Agus Setiawan", email: "warehouse@kiln.test", role: "warehouse" },
  { name: "Maya Putri", email: "finance@kiln.test", role: "finance" },
];

export const ACCOUNT_SEED = [
  { code: "1100", name: "Cash & Bank", type: "asset" },
  { code: "1200", name: "Accounts Receivable", type: "asset" },
  { code: "1300", name: "Inventory", type: "asset" },
  { code: "1400", name: "VAT Input (PPN Masukan)", type: "asset" },
  { code: "2100", name: "Accounts Payable", type: "liability" },
  { code: "2200", name: "VAT Output (PPN Keluaran)", type: "liability" },
  { code: "3100", name: "Owner's Capital", type: "equity" },
  { code: "3200", name: "Retained Earnings", type: "equity" },
  { code: "4100", name: "Sales Revenue", type: "revenue" },
  { code: "5100", name: "Cost of Goods Sold", type: "expense" },
  { code: "5200", name: "Inventory Adjustments", type: "expense" },
] as const;

export const WAREHOUSES = [
  { code: "JKT", name: "Jakarta Distribution Center", city: "Bekasi" },
  { code: "SBY", name: "Surabaya Distribution Center", city: "Sidoarjo" },
];

const IDR = (rupiah: number) => rupiah * 100;

/** [sku, name, category, unit, sale price (IDR), cost (IDR), reorder point, supplier code] */
export const PRODUCTS: [string, string, string, string, number, number, number, string][] = [
  ["LTP-14-PRO", 'Laptop Pro 14" i7 / 16 GB', "Laptops", "unit", 18_500_000, 14_200_000, 8, "SUP-GRK"],
  ["LTP-14-AIR", 'Laptop Air 14" i5 / 8 GB', "Laptops", "unit", 11_900_000, 9_100_000, 12, "SUP-GRK"],
  ["LTP-16-WS", 'Workstation 16" Ryzen 9 / 32 GB', "Laptops", "unit", 32_000_000, 25_400_000, 4, "SUP-GRK"],
  ["LTP-13-EDU", 'Chromebook 13" Education', "Laptops", "unit", 4_750_000, 3_600_000, 20, "SUP-GRK"],
  ["MON-24-FHD", 'Monitor 24" FHD IPS', "Monitors", "unit", 2_150_000, 1_580_000, 25, "SUP-MEG"],
  ["MON-27-QHD", 'Monitor 27" QHD 144 Hz', "Monitors", "unit", 4_600_000, 3_450_000, 15, "SUP-MEG"],
  ["MON-34-UW", 'Monitor 34" Ultrawide', "Monitors", "unit", 8_900_000, 6_800_000, 6, "SUP-MEG"],
  ["ACC-KB-MX", "Mechanical Keyboard TKL", "Accessories", "pcs", 1_250_000, 820_000, 30, "SUP-AKT"],
  ["ACC-MS-WL", "Wireless Mouse Ergonomic", "Accessories", "pcs", 450_000, 270_000, 50, "SUP-AKT"],
  ["ACC-HS-BT", "Bluetooth Headset ANC", "Accessories", "pcs", 1_850_000, 1_240_000, 20, "SUP-AKT"],
  ["ACC-DK-USB", "USB-C Docking Station 11-in-1", "Accessories", "pcs", 2_300_000, 1_610_000, 15, "SUP-AKT"],
  ["ACC-WC-4K", "4K Webcam with Mic", "Accessories", "pcs", 1_400_000, 930_000, 20, "SUP-AKT"],
  ["NET-RT-AX", "Wi-Fi 6 Router AX3000", "Networking", "unit", 2_750_000, 1_980_000, 10, "SUP-JDU"],
  ["NET-SW-24", "Managed Switch 24-port Gigabit", "Networking", "unit", 5_900_000, 4_350_000, 5, "SUP-JDU"],
  ["NET-AP-CL", "Ceiling Access Point Wi-Fi 6", "Networking", "unit", 3_200_000, 2_300_000, 10, "SUP-JDU"],
  ["NET-CB-C6", "Cat6 Cable 305 m Box", "Networking", "box", 1_650_000, 1_120_000, 8, "SUP-JDU"],
  ["FUR-CH-ERG", "Ergonomic Office Chair", "Office Furniture", "unit", 3_450_000, 2_350_000, 10, "SUP-FKP"],
  ["FUR-DK-STD", "Electric Standing Desk 140 cm", "Office Furniture", "unit", 6_250_000, 4_500_000, 6, "SUP-FKP"],
  ["FUR-CB-3D", "Steel Filing Cabinet 3-drawer", "Office Furniture", "unit", 2_100_000, 1_450_000, 6, "SUP-FKP"],
  ["PRN-LJ-MFP", "Laser MFP A4 Duplex", "Printers & Supplies", "unit", 5_400_000, 4_020_000, 6, "SUP-PSI"],
  ["PRN-IT-A3", "Ink Tank Printer A3", "Printers & Supplies", "unit", 4_250_000, 3_150_000, 6, "SUP-PSI"],
  ["PRN-TN-BLK", "Toner Cartridge Black", "Printers & Supplies", "pcs", 950_000, 610_000, 40, "SUP-PSI"],
  ["PRN-PP-A4", "Copy Paper A4 80 gsm (5 rim)", "Printers & Supplies", "box", 275_000, 198_000, 80, "SUP-PSI"],
  ["ACC-UPS-1K", "UPS 1200 VA Line-Interactive", "Accessories", "unit", 1_950_000, 1_380_000, 10, "SUP-AKT"],
].map(([sku, name, category, unit, price, cost, reorder, supplier]) => [
  sku as string,
  name as string,
  category as string,
  unit as string,
  IDR(price as number),
  IDR(cost as number),
  reorder as number,
  supplier as string,
]);

/** [code, name, city, payment terms (days), tax id] */
export const CUSTOMERS: [string, string, string, number, string][] = [
  ["CUS-CDN", "PT Cahaya Digital Nusantara", "Jakarta", 30, "01.234.567.8-012.000"],
  ["CUS-SMT", "CV Sumber Makmur Teknik", "Bandung", 14, "02.345.678.9-423.000"],
  ["CUS-BKS", "PT Bina Karya Sejahtera", "Surabaya", 30, "03.456.789.0-614.000"],
  ["CUS-AIM", "PT Arunika Inti Media", "Jakarta", 45, "04.567.890.1-015.000"],
  ["CUS-LGS", "PT Lintas Garuda Solusi", "Semarang", 30, "05.678.901.2-511.000"],
  ["CUS-MPI", "Yayasan Mitra Pendidikan Indonesia", "Yogyakarta", 30, "06.789.012.3-541.000"],
  ["CUS-SRK", "PT Samudra Raya Kontraktor", "Makassar", 45, "07.890.123.4-801.000"],
  ["CUS-TBN", "CV Tunas Baru Niaga", "Medan", 14, "08.901.234.5-121.000"],
  ["CUS-PDS", "PT Pelita Data Sentosa", "Jakarta", 30, "09.012.345.6-016.000"],
  ["CUS-HKB", "Klinik Harapan Kita Bersama", "Denpasar", 14, "10.123.456.7-901.000"],
  ["CUS-NSF", "PT Nusa Fintek Andalan", "Jakarta", 30, "11.234.567.8-017.000"],
  ["CUS-ABM", "PT Anugerah Bangun Mandiri", "Surabaya", 45, "12.345.678.9-615.000"],
  ["CUS-KRS", "Koperasi Karya Sejati", "Malang", 14, "13.456.789.0-652.000"],
  ["CUS-GLA", "PT Gemilang Logistik Asia", "Bekasi", 30, "14.567.890.1-432.000"],
];

export const SUPPLIERS: [string, string, string, number, string][] = [
  ["SUP-GRK", "PT Graha Komputindo", "Jakarta", 30, "21.234.567.8-013.000"],
  ["SUP-MEG", "PT Mitra Elektronik Global", "Batam", 45, "22.345.678.9-215.000"],
  ["SUP-AKT", "PT Aksesori Teknologi", "Jakarta", 30, "23.456.789.0-018.000"],
  ["SUP-JDU", "PT Jaringan Data Utama", "Tangerang", 30, "24.567.890.1-402.000"],
  ["SUP-FKP", "CV Furnitur Kantor Prima", "Jepara", 14, "25.678.901.2-516.000"],
  ["SUP-PSI", "PT Printindo Solusi", "Surabaya", 30, "26.789.012.3-617.000"],
];
