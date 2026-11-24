/** 셸에 붙여 넣을 수 있게 필요할 때만 작은따옴표로 감싼다. */
export function shellQuote(s: string): string {
  return /^[A-Za-z0-9_./@%+=:,-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}
