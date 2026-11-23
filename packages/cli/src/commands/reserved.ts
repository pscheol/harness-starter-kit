/** 이름만 둔 명령(설계 02 §1 · §3.3, README §7). 부르면 exit 2 와 제공 단계를 낸다. */
export const RESERVED: Record<string, string> = {
  pack: "P18(확장 층, 설계 04)",
  skills: "P20 · HK-18(스킬 목록, 설계 07)",
  usage: "P20 · HK-18(관리 페이지 사용량, 설계 06 §3.18 · 12)",
  intake: "P21 · HK-19(요구사항 접수, 설계 08)",
  mob: "P21 · HK-19(설계 단계, 설계 08)",
  deploy: "P24(배포 · 운영, 설계 14)",
  ops: "P24(배포 · 운영, 설계 14)",
  metrics: "P24(배포 · 운영, 설계 14)",
  rules: "P24(배포 · 운영, 설계 14)",
  sync: "P24(설계 10)",
};
